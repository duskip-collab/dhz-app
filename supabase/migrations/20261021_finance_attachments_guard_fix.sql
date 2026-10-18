-- ============================================================================
-- Migration: K13.2.4 HOTFIX — finance_guard_attachments() nesmie robiť
--           autorizáciu (regresia z migrácie 20261020)
-- Date: 20261021
-- Purpose: Oprava preukázanej regresie v `public.finance_guard_attachments()`.
--          Nahradzuje funkciu z migrácie 20261020 úplne novým telom.
--
-- PRÍČINA (potvrdená čítaním kódu a testov):
--   Guard z 20261020 volal
--       IF NOT public.has_permission(v_uid, 'finance.create') THEN RAISE ...
--   čím robil AUTORIZÁCIU v triggery. To je chybné z dvoch dôvodov:
--
--   (a) `public.has_permission(NULL, ...)` je VŽDY false — všetky EXISTS poddotazy
--       porovnávajú `ur.user_id = NULL`, čo nie je nikdy pravdivé
--       (migrácia 20261006, riadky 321-352). Teda `NOT false = true` => RAISE.
--       V každom kontexte s NULL `auth.uid()` (service_role, vlastník DB,
--       SQL editor) bol teda zápis VŽDY zamietnutý.
--
--   (b) Horší prípad — aj keď `auth.uid()` NIE JE NULL, guard môže odmietnuť
--       operáciu, ktorú RLS povoľuje. Dôkaz: existujúci test
--       `supabase/tests/k13_finance_runtime_test.sql`, scenár 7a (riadky 687-718).
--       Po `RESET ROLE` sa resetuje IBA rola — custom GUC
--       `request.jwt.claims` ZOSTÁVA nastavené z riadku 654
--       (`sub = 1111...` = none_user, ktorý nemá žiadne finance oprávnenia).
--       Po `RESET ROLE` beží zápis ako vlastník DB (RLS sa neaplikuje), ale
--       trigger VIDÍ `auth.uid() = 1111...` => has_permission = false => RAISE.
--       Takže po aplikácii 20261020 by EXISTUJÚCI test 7a zlyhal.
--
-- RIEŠENIE — separácia zodpovedností:
--   * AUTORIZÁCIU robí VÝHRADNE RLS. Politiky `finance_attach_select/insert/
--     update/delete` (migrácia 20261015, riadky 367-386) už kontrolujú
--     `finance.view` / `finance.create` / `finance.edit` pre rolu
--     `authenticated`. Guard ich preto **úplne odstraňuje** — duplicita je
--     nielen zbytočná, ale aktivne škodlivá (môže byť prísnejšia ako RLS).
--   * Guard si necháva IBA to, čo RLS vyjadriť NEVÍ — invarianty integrity dát:
--       1. identita autora: pri existujúcom `auth.uid()` sa `uploaded_by`
--          VŽDY prepíše (anti-spoofing),
--       2. väzba cesty: prvý segment `storage_path` musí byť `transaction_id`,
--       3. rodicovská transakcia musí EXISTOVAŤ a byť DRAFT,
--       4. `transaction_id` je nemenný.
--     Tieto invarianty platia BEZPODMIENECNE pre každú rolu — sú to pravidlá
--     dát, nie pravidlá prístupu.
--
-- VÝSLEDOK:
--   * Aplikácia (vždy s platným JWT => auth.uid() IS NOT NULL): autorizáciu
--     robí RLS, identitu núti guard => žiadna zmena bezpečnostného efektu.
--   * service_role / vlastník DB / SQL editor: RLS ich obchádza z definície,
--     guard ich už neblokuje => legitímne privilegované operácie prejdú.
--   * Súbežne zostávajú aktívne VŠETKY invarianty integrity.
--
-- IDEMPOTENCIA: CREATE OR REPLACE FUNCTION (funguje či 20261020 bola
-- aplikovaná, alebo nie) + DROP TRIGGER IF EXISTS / CREATE.
-- NEDESTRUKTIVNÉ: nemení oprávnenia, roly ani schému; neupravuje spätne
-- žiadnu predchádzajúcu migráciu.

-- ============================================================================
-- 1. OPRAVENÝ GUARD — iba invarianty integrity, ŽIADNA autorizácia
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finance_guard_attachments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid    uuid := auth.uid();
    v_tx_id  uuid;
    v_status public.finance_transaction_status;
BEGIN
    -- ------------------------------------------------------------------ DELETE
    IF TG_OP = 'DELETE' THEN
        -- RODIČ: musí existovať a byť DRAFT. Ak transakcia už neexistuje
        -- (kaskádový DELETE z finance_transactions), nič nekontrolujeme.
        -- POZNÁMKA: oprávnenie finance.edit tu ZAMERNE nekontrolujeme —
        -- rieši ho RLS politika `finance_attach_delete`.
        SELECT status INTO v_status
        FROM public.finance_transactions
        WHERE id = OLD.transaction_id;

        IF v_status IS NOT NULL AND v_status <> 'DRAFT' THEN
            RAISE EXCEPTION
                'Attachments of a % transaction cannot be deleted', v_status;
        END IF;

        RETURN OLD;
    END IF;

    -- ------------------------------------------------------- INSERT / UPDATE
    -- 1) IDENTITA AUTORA SA NEDÁ PODVRHNÚŤ.
    --    Pri existujúcom auth.uid() ho vždy prepíšeme. Bez auth.uid()
    --    (service_role / vlastník DB) necháme explicitne zadanú hodnotu.
    IF v_uid IS NOT NULL THEN
        NEW.uploaded_by := v_uid;
    END IF;

    -- 2) Väzba na transakciu je nemenná (len pri UPDATE).
    IF TG_OP = 'UPDATE' AND NEW.transaction_id <> OLD.transaction_id THEN
        RAISE EXCEPTION 'An attachment cannot be moved to another transaction';
    END IF;

    -- 3) VÄZBA CESTY: prvý segment storage_path MUSÍ byť transaction_id.
    --    Invarianta integrity dát — platí pre každú rolu, vrátane service_role.
    v_tx_id := public.finance_attachment_tx_id(NEW.storage_path);
    IF v_tx_id IS NULL OR v_tx_id <> NEW.transaction_id THEN
        RAISE EXCEPTION
            'storage_path must start with the attachment transaction_id'
            USING HINT = 'Expected format: <transaction_id>/<file_name>';
    END IF;

    -- 4) RODIČOVSKÁ TRANSAKCIA MUSÍ EXISTOVAŤ A BYŤ DRAFT.
    --    Invarianta integrity dát — platí pre každú rolu.
    SELECT status INTO v_status
    FROM public.finance_transactions
    WHERE id = NEW.transaction_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Parent finance transaction does not exist';
    END IF;

    IF v_status <> 'DRAFT' THEN
        RAISE EXCEPTION
            'Attachments of a % transaction are immutable', v_status;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_guard_attachments() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_guard_attachments() TO authenticated, service_role;

-- ============================================================================
-- 2. Napojenie triggera (idempotentné)
-- ============================================================================

DROP TRIGGER IF EXISTS finance_attachments_guard_trigger
    ON public.finance_transaction_attachments;
CREATE TRIGGER finance_attachments_guard_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.finance_transaction_attachments
FOR EACH ROW
EXECUTE FUNCTION public.finance_guard_attachments();

-- ============================================================================
-- 3. OVERENIE, ŽE RLS SKUTOČNE KRYJE AUTORIZÁCIU (kontrolný SELECT)
--    Po aplikácii by mal vrátiť 4 politiky na finance_transaction_attachments
--    s príkazmi SELECT / INSERT / UPDATE / DELETE.
-- ============================================================================
-- SELECT policyname, cmd, qual, with_check
-- FROM   pg_policies
-- WHERE  schemaname = 'public'
--   AND  tablename  = 'finance_transaction_attachments'
-- ORDER  BY cmd;

-- ============================================================================
-- POZNÁMKY
-- ============================================================================
-- * Bezpecnostny efekt je ZACHOVANY (a v jednom bode ZLEPŠENÝ):
--   autorizaciu robí RLS — presne tak, ako to je v tomto projekte koncipované
--   pre všetky ostatné tabulky. Guard neduplikuje a neprekračuje RLS.
-- * Anti-spoofing identity (`uploaded_by`) zostáva AKTÍVNY pre všetkých
--   skutočne prihlásených používateľov — to bol pôvodný cieľ migrácie 20261020
--   a je naplnený.
-- * Invarianty integrity (väzba cesty, DRAFT-only, existencia rodiča,
--   nemennosť transaction_id) platia NAĎALEJ bezpodmienecne.
-- * Migrácia je bezpecná na databáze, kde 20261020 nebola aplikovaná
--   (CREATE OR REPLACE + DROP TRIGGER IF EXISTS), aj na takej, kde bola.
-- ============================================================================

-- ============================================================================
-- END OF MIGRATION 20261021_finance_attachments_guard_fix.sql
-- ============================================================================

-- ============================================================================
