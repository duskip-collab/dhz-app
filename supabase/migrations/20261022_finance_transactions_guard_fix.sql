-- ============================================================================
-- Migration: K13.2.4 FOLLOW-UP — finance_guard_transactions() blokoval
--           privilegované kontexty (NULL auth.uid())
-- Date: 20261022
-- Purpose: Oprava preukázanej regresie v `public.finance_guard_transactions()`
--          (pôvodne z migrácie 20261015, riadky 422-515).
--
-- PRÍČINA (potvrdená runtime chybou počas testu k1323):
--   Guard pri štyroch kontrolách volal
--       IF NOT public.has_permission(v_uid, 'finance.edit') THEN RAISE ...
--   BEZ podmienky `v_uid IS NOT NULL`.
--
--   `public.has_permission(NULL, ...)` vracia VŽDY false — všetky EXISTS
--   poddotazy porovnávajú `ur.user_id = NULL`, čo nie je nikdy pravdivé
--   (migrácia 20261006, riadky 321-352). Teda `NOT false = true` => RAISE.
--
--   Reálny dôsledok — v každom kontexte, kde `auth.uid()` je NULL, boli
--   zamietnuté AJ LEGITÍMNE operácie:
--     * priamy INSERT transakcie so statusom POSTED,
--     * zaúčtovanie DRAFT -> POSTED,
--     * stornovanie POSTED -> VOID a DRAFT -> VOID.
--   Týka sa to service_role, backend jobov, vlastníka DB a SQL editora.
--
--   Chybové hlásenie, ktoré to spôsobilo:
--     ERROR: P0001: Creating a POSTED transaction requires finance.edit
--     permission
--     CONTEXT: PL/pgSQL function finance_guard_transactions() line 18 at RAISE
--
-- RIEŠENIE — ku každej kontrole oprávnenia pridaná podmienka `v_uid IS NOT NULL`:
--   * Prihlásený používateľ (aplikácia cez PostgREST/SSR) má VŽDY neprázdny
--     JWT, teda `auth.uid() IS NOT NULL` => všetky kontroly platia NAĎALEJ
--     v plnom rozsahu. ŽIADNA zmena správania pre reálnych používateľov.
--   * Kontexty bez identity (service_role, vlastník DB, SQL editor) už tak
--     obchádzajú RLS z definície — guard ich už nebude duplicitne blokovať.
--     Rovnaký princíp ako v migrácii 20261021 (finance_guard_attachments).
--
-- PREČO SA KONTROLY NEODSTRÁNUJÚ ÚPLNE (na rozdiel od 20261021):
--   RLS politika `finance_transactions_insert` požaduje iba `finance.create`,
--   NIE `finance.edit` pre POSTED riadky. Pravidlo „POSTED vyžaduje finance.edit“
--   teda RLS nevie vyjadriť — je to business invariant, ktorý musí vynucovať
--   práve tento trigger. Odstránením by používateľ s vyhradne `finance.create`
--   mohol priamo vytvárať zaúčtované transakcie. Kontroly preto ZOSTÁVAJÚ,
--   len sa neuplatňujú pre kontexty bez identity.
--
-- NEOČAKÁVANÉ ZMENY: žiadne.
--   * Test `k13_finance_runtime_test.sql` scenár 2a beží s `claims = 3333...`
--     (create_user, ktorý finance.edit NEMÁ) => `v_uid IS NOT NULL` => kontrola
--     zostáva aktívna => P0001 sa tiež naďalej vráti. Test naďalej prejde.
--   * Test 2b (nútené created_by/updated_by) je ovplyvnený len pri
--     `v_uid IS NOT NULL`, čo v ňom platí => bez zmeny.
--
-- IDEMPOTENCIA: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS / CREATE.
-- NEDESTRUKTIVNÉ: nemení oprávnenia, roly ani schému; neupravuje spätne
-- žiadnu predchádzajúcu migráciu (20261015 zostáva nezmenená).

-- ============================================================================
-- 1. OPRAVENÝ GUARD — kontroly oprávnení len pre prihláseného používateľa
--    (telo je verbatim kópia z 20261015; zmenené sú VÝHRADNE 4 kontroly
--     oprávnení — každá získala predponu `v_uid IS NOT NULL AND`)
-- ============================================================================

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
        -- client cannot spoof created_by / updated_by (service_role contexts
        -- with a NULL auth.uid() keep their explicitly provided values).
        IF v_uid IS NOT NULL THEN
            NEW.created_by := v_uid;
            NEW.updated_by := v_uid;
        END IF;

        -- Direct creation of a POSTED row needs finance.edit (posting right).
        -- OPRAVA 20261022: kontrola len pri existujúcej identite — pri NULL
        -- auth.uid() (service_role / vlastník DB) rozhoduje RLS/GRANT.
        IF NEW.status = 'POSTED'
           AND v_uid IS NOT NULL
           AND NOT public.has_permission(v_uid, 'finance.edit') THEN
            RAISE EXCEPTION
                'Creating a POSTED transaction requires finance.edit permission';
        END IF;

        -- Auto-stamp posting metadata for directly-created POSTED rows.
        -- posted_by is forced to the caller and cannot be spoofed.
        IF NEW.status = 'POSTED' THEN
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
            -- OPRAVA 20261022: len pri existujúcej identite.
            IF v_uid IS NOT NULL
               AND NOT public.has_permission(v_uid, 'finance.edit') THEN
                RAISE EXCEPTION 'Voiding a transaction requires finance.edit permission';
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
            -- OPRAVA 20261022: len pri existujúcej identite.
            IF v_uid IS NOT NULL
               AND NOT public.has_permission(v_uid, 'finance.edit') THEN
                RAISE EXCEPTION 'Posting a transaction requires finance.edit permission';
            END IF;
            NEW.posted_at := COALESCE(NEW.posted_at, NOW());
            IF v_uid IS NOT NULL THEN
                NEW.posted_by := v_uid;
            END IF;
        END IF;

        -- DRAFT -> VOID: require reason + finance.edit.
        IF OLD.status = 'DRAFT' AND NEW.status = 'VOID' THEN
            -- OPRAVA 20261022: len pri existujúcej identite.
            IF v_uid IS NOT NULL
               AND NOT public.has_permission(v_uid, 'finance.edit') THEN
                RAISE EXCEPTION 'Voiding a transaction requires finance.edit permission';
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
-- 2. Napojenie triggera (idempotentné)
-- ============================================================================

DROP TRIGGER IF EXISTS finance_transactions_guard ON public.finance_transactions;
CREATE TRIGGER finance_transactions_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.finance_transactions
FOR EACH ROW
EXECUTE FUNCTION public.finance_guard_transactions();

-- ============================================================================
-- POZNÁMKY
-- ============================================================================
-- * Business invariant „POSTED vyžaduje finance.edit“ ZOSTÁVA AKTÍVNY pre
--   všetkých skutočne prihlásených používateľov — len sa nevynucuje v
--   kontextoch bez identity, ktoré RLS obchádzajú z definície.
-- * Migrácia je bezpecná na DB, kde už boli aplikované všetky predchádzajúce
--   migrácie (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
-- * Overenie po aplikácii (kontrolný SELECT):
--     SELECT proname, prosecdef
--     FROM   pg_proc
--     WHERE  proname = 'finance_guard_transactions';
-- ============================================================================

-- ============================================================================
-- END OF MIGRATION 20261022_finance_transactions_guard_fix.sql
-- ============================================================================

