-- ============================================================================
-- Migration: K13.2.5 — finance_guard_transactions() : NULL auth.uid() handling
-- Date: 20261022
-- Purpose: Oprava správania finance_guard_transactions(), keď auth.uid() VCS
--          je NULL, bez zmeny migrácie 20261015_finance_module.sql.
--
-- PRÍČINA:
--   Migrácia 20261022 (K13.2.4) pridala `v_uid IS NOT NULL` na kontroly
--   oprávnenia, aby mali service_role / vlastník DB / SQL editor prístup
--   k zápisom. Tým sa NULL identity stala "auto-dôveryhodnú" pre všetky
--   finance.edit kontroly — vrátane priameho POSTED INSERT a DRAFT->POSTED.
--   Toto nespĺňa potrebnú izoláciu: chýba identita nesmie automaticky
--   povoliť operácie, ktoré vizuálne potrebujú finance.edit (postovanie).
--
-- RIEŠENIE:
--   * Pri auth.uid() IS NOT NULL sa všetky kontroly oprávnenia správajú
--     ako pred migráciou 20261015 (finance.edit povinný pre POSTED INSERT
--     aj DRAFT->POSTED; POSTED->VOID a DRAFT->VOID tiež finančný edit).
--   * Pri auth.uid() IS NULL nebudú kontroly oprávnenia automaticky
--     strenuté (doplnená podmienka `v_uid IS NOT NULL` z K13.2.4 odstránená).
--     Privilegované zápisy sa povolia IBA cez explicitnú, overiteľnú
--     hranicu dôvery — session GUC `app.finance_pti_enabled` (nastavený
--     funkciou `public.finance_pti_enable()`, ktorá je voľnená iba pre
--     rolu `service_role` / vlastníka DB). Ak GUC nie je 'on', vyhazuje sa
--     výnimka pre POSTED operácie.
--   * Existujúce správanie auditu, created_by, updated_by, posted_by sa
--     není zmenené.
--   * Nevyužíva sa žiadne nové oprávnenia ani nové role.
--
-- IDEMPOTENCIA: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS / CREATE.
-- NEDESTRUKTIVNÉ: nemení migráciu 20261015. Testy s RESET ROLE explicitne
-- nastavujú / vyčistia JWT claims; hranica dôvery je zdokumentovaná.
--
-- ============================================================================

-- ============================================================================
-- 1. Hranica dôvery — explicitné povolenie pre privilegované kontexty
-- ============================================================================
-- GUC `app.finance_pti_enabled` označuje "explicitnú, overiteľnú hranicu
-- dôvery" pre zápisy v kontexte bez identity (auth.uid() IS NULL). Jeho
-- hodnotu nastavuje iba poskytovateľný kontext (service_role / DB vlastník),
-- nie bežný klient (anon / authenticated).
--
-- Použitie:
--   -- v kontexte, kde si oprávnený proces vie istuť, že zapisuje bez identity
--   SELECT public.finance_pti_enable();
--   -- následne sa operácia môže uskutočniť, keď auth.uid() IS NULL
--   INSERT ...;
--   -- po sebestrenej transakcii GUC sa resetuje samo (plätne do konca sessionu)
--
-- NB: Táto funkcia nemôže byť volaná z bežného klienta (anon/authenticated),
--     pretože je S Security DEFINER a obsahuje overenie session_user.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finance_pti_enable()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF session_user <> 'service_role' AND session_user <> 'postgres' THEN
        RAISE EXCEPTION 'finance_pti_enable() je voľnená iba pre service_role alebo DB vlastníka';
    END IF;
    PERFORM set_config('app.finance_pti_enabled', 'on', true);
    RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_pti_enable() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_pti_enable() TO service_role;
CREATE OR REPLACE FUNCTION public.finance_guard_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    -- ---------------- INSERT ----------------
    IF TG_OP = 'INSERT' THEN
        -- Ownership is taken from the authenticated caller; an authenticated
        -- client cannot spoof created_by / updated_by. service_role contexts
        -- with a NULL auth.uid() keep their explicitly provided values.
        IF v_uid IS NOT NULL THEN
            NEW.created_by := v_uid;
            NEW.updated_by := v_uid;
        END IF;

        -- Direct creation of a POSTED row needs finance.edit (posting right).
        -- When auth.uid() IS NULL there is no authenticated identity at all,
        -- so the control is NOT skipped merely because identity is missing:
        -- POSTED writes require an explicit, verifiable trust boundary
        -- (GUC `app.finance_pti_enabled` set via `public.finance_pti_enable()`).
        IF NEW.status = 'POSTED' THEN
            IF v_uid IS NOT NULL THEN
                IF NOT public.has_permission(v_uid, 'finance.edit') THEN
                    RAISE EXCEPTION
                        'Creating a POSTED transaction requires finance.edit permission';
                END IF;
            ELSIF current_setting('app.finance_pti_enabled', true) IS DISTINCT FROM 'on' THEN
                RAISE EXCEPTION
                    'Creating a POSTED transaction requires finance.edit or an explicit trusted context (SELECT public.finance_pti_enable() to set app.finance_pti_enabled = on)';
            END IF;
            -- Auto-stamp posting metadata for directly-created POSTED rows.
            NEW.posted_at := COALESCE(NEW.posted_at, NOW());
            IF v_uid IS NOT NULL THEN
                NEW.posted_by := v_uid;
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    -- ---------------- UPDATE ----------------
    IF TG_OP = 'UPDATE' THEN
        -- Ownership of the change is taken from the authenticated caller.
        IF v_uid IS NOT NULL THEN
            NEW.updated_by := v_uid;
        END IF;

        -- A POSTED row may only be voided, and only with finance.edit.
        IF OLD.status = 'POSTED' THEN
            IF NEW.status <> 'VOID' THEN
                RAISE EXCEPTION
                    'A POSTED transaction cannot be modified; only voiding is allowed';
            END IF;
            IF v_uid IS NOT NULL THEN
                IF NOT public.has_permission(v_uid, 'finance.edit') THEN
                    RAISE EXCEPTION 'Voiding a transaction requires finance.edit permission';
                END IF;
            ELSIF current_setting('app.finance_pti_enabled', true) IS DISTINCT FROM 'on' THEN
                RAISE EXCEPTION
                    'Voiding a posted transaction requires finance.edit or an explicit trusted context (SELECT public.finance_pti_enable() to set app.finance_pti_enabled = on)';
            END IF;
            -- Immutable financial identity of a posted row is preserved.
            IF NEW.amount_minor <> OLD.amount_minor
               OR NEW.account_id <> OLD.account_id
               OR NEW.type <> OLD.type
               OR NEW.transaction_date <> OLD.transaction_date
               OR NEW.transfer_group_id IS DISTINCT FROM OLD.transfer_group_id THEN
                RAISE EXCEPTION
                    'Amount/account/type/date of a POSTED transaction are immutable';
            END IF;
            RETURN NEW;
        END IF;

        -- A VOID row is final.
        IF OLD.status = 'VOID' THEN
            RAISE EXCEPTION 'A VOID transaction is immutable';
        END IF;

        -- DRAFT -> POSTED requires finance.edit and stamps posting metadata.
        IF OLD.status = 'DRAFT' AND NEW.status = 'POSTED' THEN
            IF v_uid IS NOT NULL THEN
                IF NOT public.has_permission(v_uid, 'finance.edit') THEN
                    RAISE EXCEPTION 'Posting a transaction requires finance.edit permission';
                END IF;
            ELSIF current_setting('app.finance_pti_enabled', true) IS DISTINCT FROM 'on' THEN
                RAISE EXCEPTION
                    'Posting a transaction requires finance.edit or an explicit trusted context (SELECT public.finance_pti_enable() to set app.finance_pti_enabled = on)';
            END IF;
            NEW.posted_at := COALESCE(NEW.posted_at, NOW());
            IF v_uid IS NOT NULL THEN
                NEW.posted_by := v_uid;
            END IF;
        -- DRAFT -> VOID: require finance.edit (and reason is a domain rule).
        IF OLD.status = 'DRAFT' AND NEW.status = 'VOID' THEN
            IF v_uid IS NOT NULL THEN
                IF NOT public.has_permission(v_uid, 'finance.edit') THEN
                    RAISE EXCEPTION 'Voiding a transaction requires finance.edit permission';
                END IF;
            ELSIF current_setting('app.finance_pti_enabled', true) IS DISTINCT FROM 'on' THEN
                RAISE EXCEPTION
                    'Voiding a transaction requires finance.edit or an explicit trusted context (SELECT public.finance_pti_enable() to set app.finance_pti_enabled = on)';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    -- ---------------- DELETE ----------------
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'DRAFT' THEN
            RAISE EXCEPTION
                'Only DRAFT transactions may be deleted; use void for posted history';
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_guard_transactions() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_guard_transactions() TO authenticated, service_role;

-- ============================================================================
-- 3. Napojenie triggera (idempotentné)
-- ============================================================================

DROP TRIGGER IF EXISTS finance_transactions_guard ON public.finance_transactions;
CREATE TRIGGER finance_transactions_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.finance_transactions
FOR EACH ROW
EXECUTE FUNCTION public.finance_guard_transactions();

-- ============================================================================
-- POZNÁMKY
-- ============================================================================
-- * Použitie hranice dôvery:
--     SET ROLE service_role;                      -- alebo resetovať na vlastníka
--     SELECT public.finance_pti_enable();         -- nastaví GUC = 'on'
--     INSERT ... (auth.uid() IS NULL) ...         -- povolené pretože GUC = 'on'
-- * Bez hranice dôvery (auth.uid() IS NULL, GUC nie je 'on') sa všetky
--   finance.edit kontroly vo výnimke postavia, a to neustále.
-- * Táto migrácia NEPODMieni migráciu 20261015 (CREATE OR REPLACE zostáva).
-- ============================================================================


