-- ============================================================================
-- Migration: K17.5 – Pozývacie kódy (jednorazové, expirujúce, viazané na rolu)
-- Date: 20261111
--
-- BEZPEČNOSTNÉ ZÁSADY
--  - Raw pozývací kód sa v databáze NIKDY neukladá – iba SHA-256 hash.
--  - Jednorazovosť je vynútená databázou (atomický UPDATE ... WHERE use_count < max_uses).
--  - Rola sa NIKDY neberie z klienta ako role_id – iba ako kód z whitelistu,
--    ktorý sa interne preloží na role_id (FK na public.roles).
--  - Audit záznamy neobsahujú kód ani hash kódu.
--  - Migrácia je forward-only a NIE JE automaticky aplikovaná (bez db push).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================================
-- 1. TABUĽKA public.invitations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.invitations (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- SHA-256 hex(normalizovaný kód). Raw kód sa v DB neukladá.
    code_hash     text NOT NULL,

    -- Kód roly z whitelistu (mirror APP_ROLES v src/lib/auth/roles.ts).
    role          text NOT NULL
                  CHECK (role IN ('ADMIN','VEDENIE','VELITEL','POKLADNIK','TRENER','CLEN','RODIC')),

    -- max_uses = 1 ⇒ čisto jednorazový kód; use_count počíta uplatnenia.
    max_uses      integer NOT NULL DEFAULT 1 CHECK (max_uses >= 1 AND max_uses <= 100),
    use_count     integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),

    expires_at    timestamptz NOT NULL,
    created_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    target_email  text,
    member_id     uuid REFERENCES public.members(id) ON DELETE SET NULL,

    -- Voliteľná poznámka administrátora (bez citlivých údajov).
    notes         text,

    status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','consumed','revoked','expired')),

    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.invitations IS
    'K17.5 pozývacie kódy. Raw kód sa neukladá – iba SHA-256 hash (code_hash).';

COMMENT ON COLUMN public.invitations.code_hash IS
    'SHA-256 hex(normalizovaného kódu). Raw kód sa v databáze neukladá.';

COMMENT ON COLUMN public.invitations.max_uses IS
    'Maximálny počet uplatnení kódu. 1 = jednorazový kód.';

COMMENT ON COLUMN public.invitations.use_count IS
    'Počet doteraj uplatnených kódov (atomicky zvyšovaný pri claim).';

CREATE UNIQUE INDEX IF NOT EXISTS invitations_code_hash_key
    ON public.invitations (code_hash);

CREATE INDEX IF NOT EXISTS idx_invitations_status_created
    ON public.invitations (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invitations_role_created
    ON public.invitations (role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invitations_expires_at
    ON public.invitations (expires_at)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_invitations_created_by
    ON public.invitations (created_by);

-- ============================================================================
-- 2. TABUĽKA public.invitation_claims (evidencia uplatnení)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.invitation_claims (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id uuid NOT NULL REFERENCES public.invitations(id) ON DELETE CASCADE,
    user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    email         text,
    claimed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitation_claims_invitation
    ON public.invitation_claims (invitation_id);

CREATE INDEX IF NOT EXISTS idx_invitation_claims_user
    ON public.invitation_claims (user_id);

-- ============================================================================
-- 3. TRIGGERY: konzistencia stavu + updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.invitations_set_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
    NEW.updated_at := now();

    -- Expirovaný kód sa automaticky označí.
    IF NEW.expires_at <= now() AND NEW.status = 'active' THEN
        NEW.status := 'expired';
    END IF;

    -- Kód, ktorý vyčerpal maximálny počet použití, je spotrebovaný.
    IF NEW.use_count >= NEW.max_uses AND NEW.status = 'active' THEN
        NEW.status := 'consumed';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invitations_set_state_trg ON public.invitations;
CREATE TRIGGER invitations_set_state_trg
    BEFORE UPDATE ON public.invitations
    FOR EACH ROW
    EXECUTE FUNCTION public.invitations_set_state();

-- ============================================================================
-- 4. AUDIT TRIGGER invitations_audit_trigger
--    (zapisuje IBA sanitizované údaje – nikdy kód ani hash kódu)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.invitations_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_action text;
    v_data   jsonb;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'invitation.created';
        v_data   := jsonb_build_object(
            'role', NEW.role,
            'expires_at', NEW.expires_at,
            'max_uses', NEW.max_uses
        );
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            IF NEW.status = 'revoked' THEN
                v_action := 'invitation.revoked';
            ELSIF NEW.status = 'consumed' THEN
                v_action := 'invitation.consumed';
            ELSIF NEW.status = 'expired' THEN
                v_action := 'invitation.expired';
            ELSE
                v_action := 'invitation.updated';
            END IF;
        ELSIF OLD.use_count IS DISTINCT FROM NEW.use_count THEN
            v_action := 'invitation.claimed';
        ELSE
            RETURN NEW;
        END IF;

        v_data := jsonb_build_object(
            'role', NEW.role,
            'expires_at', NEW.expires_at,
            'use_count', NEW.use_count,
            'max_uses', NEW.max_uses
        );
    ELSE
        RETURN NEW;
    END IF;

    INSERT INTO public.audit_log (
        user_id, action, module, entity_type, entity_id, new_data
    ) VALUES (
        COALESCE(NEW.created_by, auth.uid()),
        v_action,
        'admin',
        'invitation',
        NEW.id,
        v_data
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invitations_audit_trigger ON public.invitations;
CREATE TRIGGER invitations_audit_trigger
    AFTER INSERT OR UPDATE ON public.invitations
    FOR EACH ROW
    EXECUTE FUNCTION public.invitations_audit_trigger();

-- ============================================================================
-- 5. RLS – invitations
--    - authenticated s 'admin.users' : SELECT / INSERT / UPDATE
--    - anonym (registračný tok)         : žiadny priamy prístup k tabuľke,
--                                         iba cez SECURITY DEFINER RPC
--    - DELETE                            : žiadna policy => zrušenie nie je možné
--                                         (odobratie = status 'revoked')
-- ============================================================================

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invitations_select_admin ON public.invitations;
CREATE POLICY invitations_select_admin
    ON public.invitations
    FOR SELECT TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'admin.users'));

DROP POLICY IF EXISTS invitations_insert_admin ON public.invitations;
CREATE POLICY invitations_insert_admin
    ON public.invitations
    FOR INSERT TO authenticated
    WITH CHECK (
        public.has_permission((SELECT auth.uid()), 'admin.users')
        AND created_by = (SELECT auth.uid())
    );

DROP POLICY IF EXISTS invitations_update_admin ON public.invitations;
CREATE POLICY invitations_update_admin
    ON public.invitations
    FOR UPDATE TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'admin.users'))
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'admin.users'));

REVOKE ALL ON public.invitations FROM anon;
REVOKE ALL ON public.invitations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;

-- invitation_claims: viditeľné iba adminom s 'admin.users'
ALTER TABLE public.invitation_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invitation_claims_select_admin ON public.invitation_claims;
CREATE POLICY invitation_claims_select_admin
    ON public.invitation_claims
    FOR SELECT TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'admin.users'));

REVOKE ALL ON public.invitation_claims FROM anon;
REVOKE ALL ON public.invitation_claims FROM PUBLIC;
GRANT SELECT ON public.invitation_claims TO authenticated;
GRANT ALL ON public.invitation_claims TO service_role;

-- ---------------------------------------------------------------------------
-- 6.1 create_invitation(p_role_code, p_code_hash, p_expires_at, ...)
--     Vracia id vytvorenej pozvánky. Volá authenticated s 'admin.users'.
--     Klient NIKDY neposiela role_id ani raw kód – iba hash a kód roly
--     z whitelistu (mirror APP_ROLES).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invitation(
    p_role_code      text,
    p_code_hash      text,
    p_expires_at     timestamptz,
    p_target_email   text DEFAULT NULL,
    p_member_id      uuid DEFAULT NULL,
    p_max_uses       integer DEFAULT 1,
    p_notes          text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid        uuid := auth.uid();
    v_role_id    uuid;
    v_invitation uuid;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission(v_uid, 'admin.users') THEN
        RAISE EXCEPTION 'Forbidden: admin.users permission required'
            USING ERRCODE = '42501';
    END IF;

    -- Whitelist rolí (mirror src/lib/auth/roles.ts).
    IF p_role_code IS NULL
       OR p_role_code NOT IN ('ADMIN','VEDENIE','VELITEL','POKLADNIK','TRENER','CLEN','RODIC') THEN
        RAISE EXCEPTION 'Unknown role code' USING ERRCODE = '22023';
    END IF;

    IF p_code_hash IS NULL OR length(btrim(p_code_hash)) <> 64 THEN
        RAISE EXCEPTION 'Invalid code hash' USING ERRCODE = '22023';
    END IF;

    IF p_expires_at IS NULL OR p_expires_at <= now() THEN
        RAISE EXCEPTION 'Expiration must be in the future' USING ERRCODE = '22023';
    END IF;

    IF p_max_uses IS NULL OR p_max_uses < 1 OR p_max_uses > 100 THEN
        RAISE EXCEPTION 'Invalid max_uses' USING ERRCODE = '22023';
    END IF;

    SELECT r.id INTO v_role_id
    FROM public.roles r
    WHERE r.code = p_role_code;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Role does not exist' USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.invitations (
        code_hash, role, max_uses, use_count, expires_at,
        created_by, target_email, member_id, status, notes
    ) VALUES (
        lower(btrim(p_code_hash)),
        p_role_code,
        p_max_uses,
        0,
        p_expires_at,
        v_uid,
        NULLIF(btrim(lower(coalesce(p_target_email, ''))), ''),
        p_member_id,
        'active',
        NULLIF(btrim(p_notes), '')
    )
    RETURNING id INTO v_invitation;

    RETURN v_invitation;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invitation(text, text, timestamptz, text, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invitation(text, text, timestamptz, text, uuid, integer, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6.2 verify_invitation_code(p_code) → tabuľka
--     Overí existenciu a použiteľnosť kódu BEZ toho, aby ho spotreboval.
--     Voliteľné 'anon' (registračný formulár) aj 'authenticated'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_invitation_code(p_code text)
RETURNS TABLE (
    invitation_id uuid,
    role          text,
    status        text,
    is_valid      boolean,
    expires_at    timestamptz,
    use_count     integer,
    max_uses      integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_normalized text;
    v_hash       text;
BEGIN
    -- Normalizácia musí byť IDENTICKÁ s TS (src/lib/auth/invitations.service.ts).
    v_normalized := upper(regexp_replace(btrim(coalesce(p_code, '')), '[^A-Za-z0-9-]', '', 'g'));
    v_hash := encode(digest(v_normalized::bytea, 'sha256'::text), 'hex');

    RETURN QUERY
    SELECT
        i.id,
        i.role,
        i.status,
        (i.status = 'active'
         AND i.use_count < i.max_uses
         AND i.expires_at > now()) AS is_valid,
        i.expires_at,
        i.use_count,
        i.max_uses
    FROM public.invitations i
    WHERE i.code_hash = v_hash
    LIMIT 1;

    RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_invitation_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_invitation_code(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6.3 claim_invitation_code(p_code, p_user_id, p_email)
--     Atomické uplatnenie kódu (jednorazovosť vynútená DB):
--       UPDATE ... WHERE use_count < max_uses AND status='active' AND expires_at > now()
--     → 0 riadkov = kód nepoužiteľný.
--     Po úspešnom claim sa pridá role do public.user_roles (INSERT, nie UPDATE)
--     a rola pochádza IBA z pozvánky.
--
--     BEZPEČNOSŤ: p_user_id sa NIKDY nesmie dôverovať klientovi.
--     Používateľ musí byť prihlásený (auth.uid()) a p_user_id musí s ním
--     súhlasiť – inak by útočník s kódom mohol prideliť rolu inému účtu
--     (privilege escalation). Anonymné volanie je povolené IBA pre
--     service_role (serverová integrácia).
--
--     Vracia JSON: { success, invitation_id, role, error }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_invitation_code(
    p_code    text,
    p_user_id uuid,
    p_email   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_normalized text;
    v_hash       text;
    v_invitation uuid;
    v_role       text;
    v_role_id    uuid;
    v_uid        uuid := auth.uid();
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
    END IF;

    -- Používateľ MUSÍ byť prihlásený a p_user_id musí byť jeho vlastný id.
    -- (service_role fallback – bez prihláseného používateľa sa nič neudialo.)
    IF v_uid IS NOT NULL THEN
        IF p_user_id <> v_uid THEN
            RAISE EXCEPTION 'Forbidden: user id mismatch'
                USING ERRCODE = '42501';
        END IF;
    ELSIF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Not authenticated'
            USING ERRCODE = '42501';
    END IF;

    v_normalized := upper(regexp_replace(btrim(coalesce(p_code, '')), '[^A-Za-z0-9-]', '', 'g'));
    v_hash := encode(digest(v_normalized::bytea, 'sha256'::text), 'hex');

    -- 1) Atomická rezervácia: iba jeden súbežný pokus získa riadok.
    UPDATE public.invitations i
       SET use_count = i.use_count + 1
     WHERE i.code_hash = v_hash
       AND i.status = 'active'
       AND i.use_count < i.max_uses
       AND i.expires_at > now()
    RETURNING i.id, i.role INTO v_invitation, v_role;

    IF v_invitation IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.invitations i WHERE i.code_hash = v_hash
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'code_unusable');
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
    END IF;

    -- 2) Rola pochádza IBA z pozvánky.
    SELECT r.id INTO v_role_id
    FROM public.roles r
    WHERE r.code = v_role;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Role does not exist' USING ERRCODE = '23503';
    END IF;

    -- 3) Idempotentné priradenie roly (INSERT – user_roles nemá id stĺpec).
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (p_user_id, v_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;

    -- 4) Evidencia uplatnenia.
    INSERT INTO public.invitation_claims (invitation_id, user_id, email)
    VALUES (v_invitation, p_user_id, lower(btrim(coalesce(p_email, ''))));

    -- 5) Audit (bez kódu a bez hashu).
    INSERT INTO public.audit_log (
        user_id, action, module, entity_type, entity_id, new_data
    ) VALUES (
        p_user_id, 'invitation.consumed', 'auth', 'invitation', v_invitation,
        jsonb_build_object('role', v_role)
    );

    INSERT INTO public.audit_log (
        user_id, action, module, entity_type, entity_id, new_data
    ) VALUES (
        p_user_id, 'invitation.role_assigned', 'auth', 'invitation', v_invitation,
        jsonb_build_object('role', v_role)
    );

    RETURN jsonb_build_object(
        'success', true,
        'invitation_id', v_invitation,
        'role', v_role
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invitation_code(text, uuid, text) FROM PUBLIC;
-- 'anon' NEDOSTAVA execute – uplatnenie kódu vyžaduje prihláseného používateľa
-- (auth.uid() musí sedieť s p_user_id).
GRANT EXECUTE ON FUNCTION public.claim_invitation_code(text, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6.4 revoke_invitation(p_invitation_id) → void
--     Zrušenie kódu (soft delete): status='revoked'. DELETE je zámerne
--     nedostupné (auditácia).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission(v_uid, 'admin.users') THEN
        RAISE EXCEPTION 'Forbidden: admin.users permission required'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.invitations
    SET status = 'revoked'
    WHERE id = p_invitation_id
      AND status = 'active';
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6.5 list_invitations(p_limit, p_offset) → tabuľka
--     Prehľad pozvánok pre admina. Vracia IBA sanitizované údaje –
--     code_hash sa do výsledku NIKDY nedostáva.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_invitations(
    p_limit  integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id           uuid,
    role         text,
    status       text,
    use_count    integer,
    max_uses     integer,
    expires_at   timestamptz,
    target_email text,
    member_id    uuid,
    notes        text,
    created_at   timestamptz,
    updated_at   timestamptz,
    created_by   uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission(v_uid, 'admin.users') THEN
        RAISE EXCEPTION 'Forbidden: admin.users permission required'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        i.id, i.role, i.status, i.use_count, i.max_uses, i.expires_at,
        i.target_email, i.member_id, i.notes, i.created_at, i.updated_at, i.created_by
    FROM public.invitations i
    ORDER BY i.created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 100), 1), 500)
    OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.list_invitations(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_invitations(integer, integer) TO authenticated, service_role;

-- ============================================================================
-- 7. KONTROLNÉ ÚPRAVY GRANTS pre tabuľky
-- ============================================================================

REVOKE ALL ON public.invitations FROM anon;
REVOKE ALL ON public.invitation_claims FROM anon;

-- Raw kód ani hash sa nesmie dostať do tabuľky cez anon role.
REVOKE ALL ON FUNCTION public.verify_invitation_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_invitation_code(text) TO anon, authenticated, service_role;

-- ============================================================================
-- 8. POZNÁMKY (nezmenené existujúce tabuľky)
-- ============================================================================
-- * public.member_access_codes sa NEMENÍ – je to iný koncept (heslo člena).
-- * public.user_roles má PK (user_id, role_id) a NEMÁ stĺpec 'id'
--   ⇒ role sa priraďuje INSERT ... ON CONFLICT DO NOTHING.
-- * is_email_login_allowed rozšírenie o „účet s rolou z pozývacej“ je
--   samostatný krok (§8.2 O1 v pláne) – v tejto migrácii sa NEMENÍ.
-- ============================================================================
