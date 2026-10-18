-- ============================================================================
-- Migration: K13.1.3 – Finance Storage hardening (DRAFT-only + path binding)
-- Date: 20261017
-- Purpose: Zatvrdenie Storage RLS pre bucket `finance_documents` tak, aby:
--   * čítanie vyžadovalo finance.view a väzbu na existujúcu transakciu;
--   * nahrávanie (INSERT) vyžadovalo finance.create A rodičovskú transakciu
--     v stave DRAFT (alebo sa vytvárajúcu);
--   * úprava (UPDATE) a mazanie (DELETE) boli povolené IBA keď rodičovská
--     transakcia existuje a je v stave DRAFT (POSTED/VOID chránené);
--   * nebolo možné obísť ochranu premenovaním/presunutím objektu (zmena name).
--
-- Model väzby: storage_path (a storage.objects.name) v tvare
--   <transaction_id>/<file_name>
-- Prvý segment cesty MUSÍ byť UUID existujúcej transakcie. Pomocné funkcie
-- (SECURITY DEFINER, SET search_path = public) túto väzbu overujú.
--
-- Idempotency: CREATE OR REPLACE FUNCTION + DROP POLICY IF EXISTS / CREATE.
-- Non-destructive: nemeníme oprávnenia ani roly, len pridávame helper funkcie
-- a znova vytvárame Storage politiky so prísnejšími podmienkami.
--
-- Predpoklad: migrácie 20261006 (core) a 20261015 (finance) sú aplikované.
-- ============================================================================

-- ============================================================================
-- 1. HELPER: parsovanie transaction_id z cesty objektu
--    Ocekavany format: <uuid>/<file_name>. Vracia UUID alebo NULL.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finance_attachment_tx_id(p_path text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_first text;
    v_id uuid;
BEGIN
    IF p_path IS NULL OR position('/' in p_path) = 0 THEN
        RETURN NULL;
    END IF;

    v_first := split_part(p_path, '/', 1);

    BEGIN
        v_id := v_first::uuid;
    EXCEPTION WHEN others THEN
        -- Prvy segment nie je validne UUID -> zla konvencia cesty.
        RETURN NULL;
    END;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_attachment_tx_id(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_attachment_tx_id(text) TO authenticated, service_role;

-- ============================================================================
-- 2. HELPER: čitanie prílohy
--    Povolené ak má používateľ finance.view A rodičovská transakcia existuje
--    (akýkoľvek status – doklady zaúčtovaných transakcií sa dajú zobrazovať).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_read_finance_attachment(p_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_tx_id uuid;
BEGIN
    IF NOT public.has_permission(v_uid, 'finance.view') THEN
        RETURN false;
    END IF;

    v_tx_id := public.finance_attachment_tx_id(p_path);
    IF v_tx_id IS NULL THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.finance_transactions WHERE id = v_tx_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.can_read_finance_attachment(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_read_finance_attachment(text) TO authenticated, service_role;

-- ============================================================================
-- 3. HELPER: nahrávanie prílohy
--    Povolené ak má používateľ finance.create A rodičovská transakcia existuje
--    a je v stave DRAFT (prílohy sa prikladajú k nevzaúčtovaným transakciám).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_upload_finance_attachment(p_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_tx_id uuid;
    v_status public.finance_transaction_status;
BEGIN
    IF NOT public.has_permission(v_uid, 'finance.create') THEN
        RETURN false;
    END IF;

    v_tx_id := public.finance_attachment_tx_id(p_path);
    IF v_tx_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT status INTO v_status
    FROM public.finance_transactions
    WHERE id = v_tx_id;

    IF v_status IS NULL THEN
        RETURN false;
    END IF;

    RETURN v_status = 'DRAFT';
END;
$$;

REVOKE ALL ON FUNCTION public.can_upload_finance_attachment(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_finance_attachment(text) TO authenticated, service_role;

-- ============================================================================
-- 4. HELPER: modifikácia / mazanie prílohy
--    Povolené IBA ak má používateľ finance.edit A rodičovská transakcia
--    existuje a je v stave DRAFT. Prílohy POSTED/VOID transakcií sú chránené.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_modify_finance_attachment(p_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_tx_id uuid;
    v_status public.finance_transaction_status;
BEGIN
    IF NOT public.has_permission(v_uid, 'finance.edit') THEN
        RETURN false;
    END IF;

    v_tx_id := public.finance_attachment_tx_id(p_path);
    IF v_tx_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT status INTO v_status
    FROM public.finance_transactions
    WHERE id = v_tx_id;

    IF v_status IS NULL THEN
        RETURN false;
    END IF;

    RETURN v_status = 'DRAFT';
END;
$$;

REVOKE ALL ON FUNCTION public.can_modify_finance_attachment(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_modify_finance_attachment(text) TO authenticated, service_role;

-- ============================================================================
-- 5. STORAGE RLS – ZNOVU VYTVORENÉ politiky s DRAFT-only väzbou
-- ============================================================================
-- Nahradzujeme politiky z migrácie 20261016 prísnejšími verziami, ktoré via
-- helper funkcie overujú väzbu objektu na rodičovskú transakciu a jej status.
--
--   SELECT -> finance.view + existujúca transakcia (can_read_finance_attachment)
--   INSERT -> finance.create + transakcia v stave DRAFT (can_upload_...)
--   UPDATE -> finance.edit + transakcia DRAFT, na STAROM aj NOVOM mene
--             (can_modify_...) -> chráni pred premenovaním/presunutím
--   DELETE -> finance.edit + transakcia DRAFT (can_modify_...)
--
-- Ochrana pred obídením premenovaním: UPDATE používa can_modify_finance_attachment
-- v USING (staré meno = zdroj) AJ v WITH CHECK (nové meno = cieľ). Takže:
--   * neda sa premenovať/presunúť objekt patriaci POSTED/VOID transakcii
--     (USING zlyhá), ani
--   * premiestniť objekt pod POSTED/VOID transakciu alebo na cestu bez
--     existujúcej DRAFT transakcie (WITH CHECK zlyhá).
-- ============================================================================

DROP POLICY IF EXISTS finance_documents_select ON storage.objects;
CREATE POLICY finance_documents_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'finance_documents'
    AND public.can_read_finance_attachment(name)
);

DROP POLICY IF EXISTS finance_documents_insert ON storage.objects;
CREATE POLICY finance_documents_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'finance_documents'
    AND public.can_upload_finance_attachment(name)
);

DROP POLICY IF EXISTS finance_documents_update ON storage.objects;
CREATE POLICY finance_documents_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'finance_documents'
    AND public.can_modify_finance_attachment(name)
)
WITH CHECK (
    bucket_id = 'finance_documents'
    AND public.can_modify_finance_attachment(name)
);

DROP POLICY IF EXISTS finance_documents_delete ON storage.objects;
CREATE POLICY finance_documents_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'finance_documents'
    AND public.can_modify_finance_attachment(name)
);

-- ============================================================================
-- POZNÁMKY / HRANICE
-- ============================================================================
-- * Táto migrácia NEVYTVÁRA nové oprávnenia ani roly – používa výhradne
--   existujúci O5 permission model (finance.view / finance.create / finance.edit).
-- * Väzba objekt -> transakcia je založená na KONVENCIÍ CESTY
--   <transaction_id>/<file_name>. Aplikácia (K13.2) MUSÍ dodržiavať túto
--   konvenciu pri uploade, inak pomocné funkcie väzbu nenájdu.
-- * service_role (backend) obchádza RLS z definície; zápisy cez service_role
--   preto treba v K13.2 ešte chrániť aplikačnou validáciou rodičovského stavu.
-- ============================================================================

-- ============================================================================
-- END OF MIGRATION 20261017_finance_storage_hardening.sql
-- ============================================================================

