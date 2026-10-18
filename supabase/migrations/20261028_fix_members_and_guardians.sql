-- ============================================================================
-- Migration: members + member_guardians — kanonický aplikačný model
-- Date: 20261028
-- Status: NÁVRH — NEAPLIKOVAŤ bez overenia na autorizovanom DEV prostredí
--         (supabase db push --dry-run; až po schválení DBA).
--
-- Účel: zjednotiť schému s kanonickým modelom aplikácie bez prepisu
--        historických migrácií (forward-only). Migrácia je IDEMPOTENTNÁ a
--        bezpečná pre opakované spustenie aj na DB, kde už časť zmien
--        existuje: každá zmena je strážená kontrolou existencie
--        (information_schema / pg_enum / pg_constraint).
--
-- Poznámka k poradiu (poučenie z K13.4.5): značka 20261028 je JEDINEČNÁ a vyššia
-- než všetky existujúce (max 20261027) — žiadna kolízia timestampu.
-- ============================================================================

-- ============================================================================
-- 0. BEZPEČNOSTNÉ PRE-FLIGHT KONTROLY (fail-loud, žiadne tiché preskočenie)
-- ============================================================================

DO $preflight$
BEGIN
    IF to_regclass('public.members') IS NULL THEN
        RAISE EXCEPTION
            'members_guardians_fix: public.members neexistuje — najprv aplikujte 20261006';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_status') THEN
        RAISE EXCEPTION
            'members_guardians_fix: enum member_status neexistuje — najprv aplikujte 20261006';
    END IF;
END;
$preflight$;

-- ============================================================================
-- 1. ENUM member_status — doplnenie chýbajúcej hodnoty 'archived'
--    (ochrana LEGACY dát: presun nekanonického stavu na 'archived'/'inactive'
--    je možný len ak cieľová hodnota v enume existuje; na K8 schémach je už
--    prítomná, preto strážené kontrolou existencie)
-- ============================================================================

DO $enum$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'member_status' AND e.enumlabel = 'archived'
    ) THEN
        ALTER TYPE public.member_status ADD VALUE 'archived';
    END IF;
END;
$enum$;

-- ============================================================================
-- 2. members — nové stĺpce kanonického modelu (ADD COLUMN IF NOT EXISTS)
-- ============================================================================

ALTER TABLE public.members
    ADD COLUMN IF NOT EXISTS auth_user_id uuid
        REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.members
    ADD COLUMN IF NOT EXISTS member_number text;

ALTER TABLE public.members
    ADD COLUMN IF NOT EXISTS title text;

ALTER TABLE public.members
    ADD COLUMN IF NOT EXISTS birth_date date;

ALTER TABLE public.members
    ADD COLUMN IF NOT EXISTS membership_type text;

ALTER TABLE public.members
    ADD COLUMN IF NOT EXISTS left_at date;

ALTER TABLE public.members
    ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.members
    ADD COLUMN IF NOT EXISTS photo_path text;

ALTER TABLE public.members
    ADD COLUMN IF NOT EXISTS created_by uuid
        REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.members
    ADD COLUMN IF NOT EXISTS updated_by uuid
        REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================================
-- 3. members — spätné vyplnenie (backfill) zo starých stĺpcov
--    (idempotentné: prepisuje LEN riadky, kde je cieľ stále NULL)
-- ============================================================================

-- 3a) birth_date ← date_of_birth
UPDATE public.members
   SET birth_date = date_of_birth
 WHERE birth_date IS NULL
   AND date_of_birth IS NOT NULL;

-- 3b) notes ← internal_note
UPDATE public.members
   SET notes = internal_note
 WHERE notes IS NULL
   AND internal_note IS NOT NULL;

-- 3c) photo_path ← photo_url
UPDATE public.members
   SET photo_path = photo_url
 WHERE photo_path IS NULL
   AND photo_url IS NOT NULL;

-- 3d) membership_type ← member_type (mapovanie cez youth_category)
--     Kanonické hodnoty: 'adult' | 'youth' | 'preparatory' | 'dorast'.
UPDATE public.members
   SET membership_type = CASE
           WHEN member_type = 'youth' AND youth_category = 'preparatory' THEN 'preparatory'
           WHEN member_type = 'youth' THEN 'dorast'
           ELSE 'adult'
       END
 WHERE membership_type IS NULL;
-- ============================================================================
-- 4. members — CHECK obmedzenia kanonického modelu
--    membership_type: 'adult' | 'youth' | 'preparatory' | 'dorast'
-- ============================================================================

DO $chk$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'members_membership_type_check'
    ) THEN
        ALTER TABLE public.members
            ADD CONSTRAINT members_membership_type_check
            CHECK (membership_type IN ('adult', 'youth', 'preparatory', 'dorast'));
    END IF;
END;
$chk$;

-- ============================================================================
-- 5. members — NOT NULL pre member_number s bezpečným defaultom
--    (aplikácia member_number vyžaduje; staré riadky bez čísla dostanú
--    deterministický placeholder, aby migrácia nezlyhala na dátach)
-- ============================================================================

UPDATE public.members
   SET member_number = 'M-' || substring(id::text, 1, 8)
 WHERE member_number IS NULL OR btrim(member_number) = '';

DO $nn$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'members_member_number_not_null'
    ) THEN
        ALTER TABLE public.members
            ADD CONSTRAINT members_member_number_not_null
            CHECK (member_number IS NOT NULL AND btrim(member_number) <> '');
    END IF;
END;
$nn$;

-- ============================================================================
-- 6. members — normalizácia stavu na malé písmená enumu
--    ('active', 'inactive'): konverzia text/enum bez straty dát.
--    Nekanonické hodnoty sa NEZAHODIA — presunú do archívu ('archived',
--    ak existuje) alebo poznámky; riadok dostane bezpečný stav.
-- ============================================================================

DO $status$
DECLARE
    v_is_text boolean;
    v_has_archived boolean;
BEGIN
    -- 6a) Ak je status ešte TEXT (legacy/K8 schéma): normalizuj hodnoty
    --     na malé písmená, potom pretypuj na enum member_status.
    SELECT format_type(a.atttypid, a.atttypmod) = 'text'
      INTO v_is_text
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'members'
       AND a.attname = 'status';

    IF v_is_text IS TRUE THEN
        UPDATE public.members
           SET status = lower(btrim(status))
         WHERE status IS NOT NULL
           AND lower(btrim(status)) IN ('active', 'inactive', 'archived');

        -- Zvyšok (neznáme hodnoty): presun do archívu/poznámky, bezpečný stav.
        SELECT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'member_status' AND e.enumlabel = 'archived'
        ) INTO v_has_archived;

        UPDATE public.members
           SET notes = COALESCE(notes || E'\n', '')
                     || '[migr 20261028] pôvodný status: ' || status,
               status = CASE WHEN v_has_archived THEN 'archived' ELSE 'inactive' END
         WHERE status IS NOT NULL
           AND lower(btrim(status)) NOT IN ('active', 'inactive', 'archived');

        ALTER TABLE public.members
            ALTER COLUMN status TYPE public.member_status
            USING status::public.member_status;

        ALTER TABLE public.members
            ALTER COLUMN status SET DEFAULT 'active'::public.member_status;
    END IF;

    -- 6b) Ak je status už enum: dotiahni prípadné nekanonické labely.
    --     (Na čistej 20261006 schéme je všetko už malé — no-op.)
    UPDATE public.members
       SET status = 'inactive'::public.member_status
     WHERE status::text NOT IN ('active', 'inactive', 'archived');

    -- Poistka defaultu (idempotentná).
    ALTER TABLE public.members
        ALTER COLUMN status SET DEFAULT 'active'::public.member_status;
END;
$status$;

-- ============================================================================
-- 7. members — indexy kanonických stĺpcov
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_members_member_number ON public.members(member_number);
CREATE INDEX IF NOT EXISTS idx_members_membership_type ON public.members(membership_type);
CREATE INDEX IF NOT EXISTS idx_members_auth_user_id ON public.members(auth_user_id);
-- ============================================================================
-- 8. member_guardians — kanonická tabuľka pre members.service.ts
--    (member_id, user_id, relationship, guardian_full_name,
--     is_primary_contact, phone, email, created_at, created_by)
--    Stará tabuľka public.guardians sa NEMAŽE (história + RLS zostávajú).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.member_guardians (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    member_id uuid NOT NULL
        REFERENCES public.members(id)
        ON DELETE CASCADE,

    user_id uuid
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    relationship text NOT NULL,

    guardian_full_name text NOT NULL,

    is_primary_contact boolean NOT NULL DEFAULT false,

    phone text,

    email text,

    created_at timestamptz NOT NULL DEFAULT now(),

    created_by uuid
        REFERENCES auth.users(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_member_guardians_member_id
    ON public.member_guardians(member_id);

ALTER TABLE public.member_guardians ENABLE ROW LEVEL SECURITY;

-- --- RLS (zrkadlí sémantiku guardians politík z 20261006:640-682) ---
DROP POLICY IF EXISTS member_guardians_select_authenticated
    ON public.member_guardians;
CREATE POLICY member_guardians_select_authenticated
    ON public.member_guardians FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS member_guardians_insert_trener_admin
    ON public.member_guardians;
CREATE POLICY member_guardians_insert_trener_admin
    ON public.member_guardians FOR INSERT TO authenticated
    WITH CHECK (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
    ));

DROP POLICY IF EXISTS member_guardians_update_trener_admin
    ON public.member_guardians;
CREATE POLICY member_guardians_update_trener_admin
    ON public.member_guardians FOR UPDATE TO authenticated
    USING (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
    ))
    WITH CHECK (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
    ));

DROP POLICY IF EXISTS member_guardians_delete_admin
    ON public.member_guardians;
CREATE POLICY member_guardians_delete_admin
    ON public.member_guardians FOR DELETE TO authenticated
    USING (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code = 'ADMIN'
    ));

-- --- Práva (zrkadlí 20261006:812-828) ---
REVOKE ALL ON TABLE public.member_guardians FROM public, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.member_guardians TO authenticated;
GRANT ALL ON TABLE public.member_guardians TO service_role;

-- ============================================================================
-- Overenie po aplikácii (kontrolný SELECT — spúšťa DBA na DEV):
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='members'
--    ORDER BY ordinal_position;
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='member_guardians'
--    ORDER BY ordinal_position;
--   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
--    WHERE t.typname='member_status' ORDER BY enumsortorder;
--   SELECT status, count(*) FROM public.members GROUP BY status;
-- Očakávané: nové stĺpce prítomné; status LEN active/inactive/archived.
-- ============================================================================

