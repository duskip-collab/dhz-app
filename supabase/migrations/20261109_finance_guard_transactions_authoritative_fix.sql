-- ============================================================================
-- FORWARD-ONLY MIGRATION: 20261109_finance_guard_transactions_authoritative_fix.sql
-- Fáza: FINANCE MODULE SPEC AUDIT (K13.4.5 follow-up)
--
-- ÚČEL:
--   Deterministicky nastaviť FINÁLNU bezpečnú definíciu
--   public.finance_guard_transactions() a public.finance_pti_enable(),
--   nezávisle od poradia dvoch historických migrácií:
--     * 20261022_finance_transactions_guard_fix.sql (K13.2.4 — NULL-identity bypass)
--     * 20261023_finance_transaction_guard_fix.sql (K13.2.5 — hardening, ALE OBSAHUJE
--       SYNTAXOVÚ CHYBU: chýbajúci END IF pre blok DRAFT->POSTED (~riadok 155);
--       staticky potvrdené K13.4.5 §4.2 aj opakovanou kontrolou IF=24 / END IF=23)
--
-- PRÍČINA:
--   K13.2.5 súbor zlyhá pri CREATE FUNCTION (plpgsql: unterminated IF) =>
--   akákoľvek `supabase db push` by zlyhala a NEDOSIAHLA by neskoršiu opravu.
--   Táto migrácia sa aplikuje AŽ PO úspešnej oprave/odstránení poškodeného
--   súboru (rozhodnutie B1 z K13.4.5 §7.3 — schvaľovateľ; históriu NEMENÍ).
--
-- ZNAČKA: 20261109 > 20261028 (posledná existujúca 20261108) — aplikuje sa po
--   oboch konfliktných 20261022/20261023 súboroch bez ohľadu na ich poradie.
--
-- SEMANTIKA (K13.2.5 hardening + OPRAVENÁ štruktúra IF/END IF):
--   * auth.uid() IS NOT NULL → POSTED/VOID operácie vyžadujú finance.edit.
--   * auth.uid() IS NULL → NIKDY samo o sebe neobchádza autorizáciu; privilégium
--     len cez GUC app.finance_pti_enabled = 'on' (finance_pti_enable() iba
--     pre service_role / postgres).
--
-- IDEMPOTENTNÉ: CREATE OR REPLACE + DROP TRIGGER IF EXISTS / CREATE TRIGGER.
-- NEMENÍ: RLS, granty, audit, transfer guard, historické migrácie.
-- NEAPLIKUJE SA BEZ SCHVÁLENIA POUŽÍVATEĽA.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Explicitná hranica dôvery pre kontexty bez identity (service_role / vlastník).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_pti_enable()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF session_user <> 'service_role' AND session_user <> 'postgres' THEN
        RAISE EXCEPTION 'finance_pti_enable() je volná iba pre service_role alebo DB vlastníka';
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
        IF v_uid IS NOT NULL THEN
            NEW.created_by := v_uid;
            NEW.updated_by := v_uid;
        END IF;

        -- Priama tvorba POSTED riadku: finance.edit ABO explicitná hranica dôvery.
        -- Chýbajúca identita NIKDY sama o sebe autorizáciu nepreskočí.
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
            NEW.posted_at := COALESCE(NEW.posted_at, NOW());
            IF v_uid IS NOT NULL THEN
                NEW.posted_by := v_uid;
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    -- ---------------- UPDATE ----------------
    IF TG_OP = 'UPDATE' THEN
        IF v_uid IS NOT NULL THEN
            NEW.updated_by := v_uid;
        END IF;

        -- POSTED riadok možno len stornovať a len s finance.edit / GUC hranicou.
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
            -- Nemennosť finančnej identity POSTED riadku.
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

        -- VOID riadok je finálny.
        IF OLD.status = 'VOID' THEN
            RAISE EXCEPTION 'A VOID transaction is immutable';
        END IF;

        -- DRAFT -> POSTED: finance.edit alebo explicitná hranica dôvery.
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
        END IF;   -- << OPRAVENÝ CHÝBAJÚCI END IF (K13.2.5 syntax fix)

        -- DRAFT -> VOID: finance.edit alebo explicitná hranica dôvery.
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

-- ----------------------------------------------------------------------------
-- 3) Napojenie triggera (idempotentné).
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS finance_transactions_guard ON public.finance_transactions;
CREATE TRIGGER finance_transactions_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.finance_transactions
FOR EACH ROW
EXECUTE FUNCTION public.finance_guard_transactions();

-- ============================================================================
-- KONTROLNÉ DOTAZY PO APLIKÁCII (autorizovaný DEV; NEBOLI SPUSTENÉ):
--   SELECT proname, prosecdef FROM pg_proc
--    WHERE proname IN ('finance_guard_transactions','finance_pti_enable');
--   SELECT pg_get_triggerdef(oid) FROM pg_trigger
--    WHERE tgname = 'finance_transactions_guard' AND NOT tgisinternal;
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 2) Autoritatívna definícia guardu (semantika K13.2.5 + OPRAVENÝ IF/END IF).
--    Štruktúra: 24x `IF ... THEN` / 24x `END IF;` (vyvážené — K13.4.5 §8).
--    Signatúra sa NEMENÍ → trigger väzby zostávajú platné.
-- ----------------------------------------------------------------------------
