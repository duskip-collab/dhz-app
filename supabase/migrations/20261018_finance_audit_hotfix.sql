-- ============================================================================
-- Migration: K13.1.4 HOTFIX – audit_finance_changes() SQLSTATE 42703
-- Date: 20261018
-- Purpose: Oprava runtime chyby
--            ERROR 42703: record "new" has no field "status"
--          ktorá vznikla, pretože univerzálna trigger funkcia
--          public.audit_finance_changes() je pripojená k 5 finančným tabuľkám,
--          ale priamo čítala polia NEW.status / NEW.created_by / NEW.updated_by,
--          ktoré NEEXISTUJÚ na všetkých týchto tabuľkách.
--
-- PRÍČINA (potvrdené):
--   * finance_accounts, finance_categories, finance_plans -> bez stĺpca status
--   * finance_transaction_attachments -> bez stĺpcov created_by / updated_by
--     (má iba uploaded_by)
--   Priamy prístup typu NEW.<stĺpec> na recordu tabuľky bez daného stĺpca
--   vyhadzuje v PL/pgSQL za behu SQLSTATE 42703.
--
-- RIEŠENIE:
--   * ŽIADNY priamy prístup k voliteľným poliam (NEW.status, NEW.created_by,
--     NEW.updated_by, ...). Všetky voliteľné polia čítame bezpečne cez
--     to_jsonb(NEW) ->> 'col' (vracia NULL, ak stĺpec neexistuje).
--   * Transakčno-špecifické akcie FINANCE_TRANSACTION_CREATE / _POST / _VOID
--     / _UPDATE / _DELETE sa určujú IBA pre finance_transactions podľa
--     skutočného stavu (status) a operácie (TG_OP).
--   * Ostatné tabuľky dostávajú generické FINANCE_<TABUĽKA>_<OP> akcie
--     (žiadne falošné transakčné udalosti).
--   * Identita autora: primárne auth.uid(), inak fallback na existujúci
--     ownership stĺpec v danom recordu (created_by / updated_by / uploaded_by).
--   * Nevyužívame žiadne nové stĺpce audit_log – zapisujeme do existujúcich
--     (user_id, action, module, entity_type, entity_id, old_data, new_data,
--     created_at).
--
-- IDEMPOTENCIA / NASADENIE:
--   CREATE OR REPLACE FUNCTION prepíše rozbitú verziu na existujúcej DB bez
--   straty dát. Existujúce triggery odkazujú na funkciu podľa mena, takže
--   automaticky použijú opravené telo. Triggery sú tu znova vytvorené
--   idempotentne (DROP ... IF EXISTS + CREATE), aby bola migrácia samostatne
--   bezpečná aj v prípade, že by niektorý trigger chýbal.
--
-- Táto migrácia NEMENÍ oprávnenia ani roly ani schému tabuliek.
-- Predpoklad: migrácia 20261006 (core) je aplikovaná.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_finance_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_action text;
    v_module text;
    v_entity_id uuid;
    v_old jsonb;
    v_new jsonb;
    v_uid uuid;
    v_old_status text;
    v_new_status text;
BEGIN
    v_module := TG_TABLE_NAME;

    -- Príprava dát a identity autora. VŠETKO cez to_jsonb(), aby sme nikdy
    -- nepristupovali priamo k poliu, ktoré nemusí na danej tabuľke existovať.
    IF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW);
        v_old := NULL;
        v_entity_id := (v_new ->> 'id')::uuid;
        v_uid := COALESCE(
            auth.uid(),
            (v_new ->> 'created_by')::uuid,
            (v_new ->> 'uploaded_by')::uuid
        );
    ELSIF TG_OP = 'UPDATE' THEN
        v_new := to_jsonb(NEW);
        v_old := to_jsonb(OLD);
        v_entity_id := (v_new ->> 'id')::uuid;
        v_uid := COALESCE(
            auth.uid(),
            (v_new ->> 'updated_by')::uuid,
            (v_new ->> 'uploaded_by')::uuid
        );
    ELSIF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD);
        v_new := NULL;
        v_entity_id := (v_old ->> 'id')::uuid;
        v_uid := COALESCE(
            auth.uid(),
            (v_old ->> 'updated_by')::uuid,
            (v_old ->> 'uploaded_by')::uuid
        );
    END IF;

    -- Určenie akcie. Transakčné akcie LEN pre finance_transactions.
    -- status čítame bezpečne z jsonb (nikdy NEW.status).
    IF TG_TABLE_NAME = 'finance_transactions' THEN
        v_new_status := v_new ->> 'status';
        v_old_status := v_old ->> 'status';

        IF TG_OP = 'INSERT' THEN
            v_action := 'FINANCE_TRANSACTION_CREATE';
        ELSIF TG_OP = 'UPDATE' THEN
            IF v_old_status = 'DRAFT' AND v_new_status = 'POSTED' THEN
                v_action := 'FINANCE_TRANSACTION_POST';
            ELSIF v_new_status = 'VOID' AND v_old_status IS DISTINCT FROM 'VOID' THEN
                v_action := 'FINANCE_TRANSACTION_VOID';
            ELSE
                v_action := 'FINANCE_TRANSACTION_UPDATE';
            END IF;
        ELSIF TG_OP = 'DELETE' THEN
            v_action := 'FINANCE_TRANSACTION_DELETE';
        END IF;
    ELSE
        -- Ostatné finančné tabuľky: generická akcia podľa tabuľky a operácie.
        v_action := 'FINANCE_' || upper(TG_TABLE_NAME) || '_' ||
            CASE TG_OP
                WHEN 'INSERT' THEN 'CREATE'
                WHEN 'UPDATE' THEN 'UPDATE'
                WHEN 'DELETE' THEN 'DELETE'
            END;
    END IF;

    -- Zápis do existujúceho audit_log (bez nových stĺpcov). Tento AFTER trigger
    -- sa vykonáva LEN ak predchádzajúci zápis (vrátane BEFORE guard triggera)
    -- prešiel – zlyhaná operácia tak nezanechá nesprávnu "úspešnú" udalosť.
    INSERT INTO public.audit_log (
        user_id, action, module, entity_type, entity_id, old_data, new_data, created_at
    ) VALUES (
        v_uid,
        v_action,
        v_module,
        TG_TABLE_NAME,
        v_entity_id,
        v_old,
        v_new,
        NOW()
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_finance_changes() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.audit_finance_changes() TO authenticated, service_role;

-- ============================================================================
-- Znova vytvorenie audit triggerov (idempotentné) – zabezpečí správne napojenie
-- opravenej funkcie na všetky finančné tabuľky.
-- ============================================================================

DROP TRIGGER IF EXISTS finance_accounts_audit_trigger ON public.finance_accounts;
CREATE TRIGGER finance_accounts_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.finance_accounts
FOR EACH ROW
EXECUTE FUNCTION public.audit_finance_changes();

DROP TRIGGER IF EXISTS finance_categories_audit_trigger ON public.finance_categories;
CREATE TRIGGER finance_categories_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.finance_categories
FOR EACH ROW
EXECUTE FUNCTION public.audit_finance_changes();

DROP TRIGGER IF EXISTS finance_transactions_audit_trigger ON public.finance_transactions;
CREATE TRIGGER finance_transactions_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.finance_transactions
FOR EACH ROW
EXECUTE FUNCTION public.audit_finance_changes();

DROP TRIGGER IF EXISTS finance_plans_audit_trigger ON public.finance_plans;
CREATE TRIGGER finance_plans_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.finance_plans
FOR EACH ROW
EXECUTE FUNCTION public.audit_finance_changes();

DROP TRIGGER IF EXISTS finance_attachments_audit_trigger ON public.finance_transaction_attachments;
CREATE TRIGGER finance_attachments_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.finance_transaction_attachments
FOR EACH ROW
EXECUTE FUNCTION public.audit_finance_changes();

-- ============================================================================
-- END OF MIGRATION 20261018_finance_audit_hotfix.sql
-- ============================================================================

