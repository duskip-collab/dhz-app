-- ============================================================================
-- K13.1.2 – Runtime validácia & RLS testy pre modul K13 (Financie)
-- Date: 20261016
-- Purpose: Overenie fungovania migrácie 20261015_finance_module.sql:
--          RLS izolácia, nútené vlastníctvo (R1), immutabilita POSTED/VOID,
--          integrita prevodov (R2 DEFERRABLE trigger), atomický RPC prevodu
--          a auditných záznamov.
--
-- AKO SPÚŠŤAŤ:
--   Spustiť CELÝ súbor v Supabase SQL editore / psql ako vlastník DB.
--   Súbor je zabalený do BEGIN ... ROLLBACK — NEZANECHÁ žiadne dáta.
--   Každý scenár vypíše "PASS: ..." pri úspechu; pri zlyhaní očakávaného
--   výsledku sa prejde výnimkou "TEST FAILED: ...".
--
-- Kontext autentifikácie simulujeme pomocou:
--   SET LOCAL ROLE authenticated;
--   SET LOCAL "request.jwt.claims" = '{"sub":"<uuid>","role":"authenticated"}';
-- aby auth.uid() a RLS politiky (TO authenticated) pracovali so skúmaným
-- používateľom. public.has_permission je SECURITY DEFINER, takže číta
-- user_permissions bez ohľadu na aktuálnu rolu.
--
-- Predpoklad: migrácie 20261006 (core), 20261015 (finance), 20261016 (bucket)
--            a 20261017 (storage hardening) sú aplikované. Scenár 6 vyžaduje
--            bucket finance_documents + helper funkcie z 20261017.
-- ============================================================================

BEGIN;

-- POZNÁMKA k auditným testom (5, 7b, 7c):
--   Audit overujeme KORELÁCIOU podľa konkrétnej entity, NIE časovým filtrom.
--   audit_finance_changes() zapisuje created_at = NOW(), ktoré je v rámci jednej
--   transakcie ZAMRZNUTÉ (= čas štártu transakcie). Časový filter
--   (created_at >= <marker>) je preto nespoľahlivý:
--     * clock_timestamp() marker > NOW  -> vylúči VŠETKY riadky tohto behu;
--     * now()/NOW() marker = NOW         -> zahrne AJ cudzie operácie (napr.
--       legitímny CREATE používateľa 3333 zo scenára 2b) -> falošné zlyhanie 7c.
--   Preto:
--     * sc. 5 / 7b: filtrujeme podľa entity_id = <id konkrétnej testovacej tx>
--       + presná akcia (FINANCE_TRANSACTION_POST / _VOID / _CREATE);
--     * sc. 7c:     delta počtu auditných záznamov používateľa pred/po zlyhanom
--       pokuse (before = after), čo je časovo nezávislé.

-- ---------------------------------------------------------------------------
-- 0. FIXNÉ UUID testovacích používateľov (foreign_uuid MUSÍ existovať kvôli FK)
-- ---------------------------------------------------------------------------
-- none_user    : žiadne finance oprávnenia
-- view_user    : finance.view
-- create_user  : finance.view + finance.create
-- edit_user    : finance.view + finance.create + finance.edit
-- foreign_user : cudzia identita na podvrhnutie (R1)

DO $$
DECLARE
    v_users uuid[] := ARRAY[
        '11111111-1111-1111-1111-111111111111'::uuid, -- none
        '22222222-2222-2222-2222-222222222222'::uuid, -- view
        '33333333-3333-3333-3333-333333333333'::uuid, -- create
        '44444444-4444-4444-4444-444444444444'::uuid, -- edit
        '99999999-9999-9999-9999-999999999999'::uuid  -- foreign
    ];
    u uuid;
BEGIN
    FOREACH u IN ARRAY v_users LOOP
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, created_at, updated_at,
            raw_app_meta_data, raw_user_meta_data
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
            'k13_' || replace(u::text, '-', '') || '@test.local', '',
            NOW(), NOW(), NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
        )
        ON CONFLICT (id) DO NOTHING;
    END LOOP;
END $$;

-- Priame priradenie oprávnení (user_permissions) — presné a izolované.
INSERT INTO public.user_permissions (user_id, permission_id)
SELECT '22222222-2222-2222-2222-222222222222', p.id FROM public.permissions p
WHERE p.code = 'finance.view'
ON CONFLICT DO NOTHING;

INSERT INTO public.user_permissions (user_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333333', p.id FROM public.permissions p
WHERE p.code IN ('finance.view', 'finance.create')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_permissions (user_id, permission_id)
SELECT '44444444-4444-4444-4444-444444444444', p.id FROM public.permissions p
WHERE p.code IN ('finance.view', 'finance.create', 'finance.edit')
ON CONFLICT DO NOTHING;

-- none_user (1111...) zámerne NEZÍSKA žiadne oprávnenia.

-- Referencovaný člen (members.id) pre nepovinný member_id testu.
INSERT INTO public.members (id, first_name, last_name)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Test', 'Clen')
ON CONFLICT (id) DO NOTHING;

-- Kategória príjmu.
INSERT INTO public.finance_categories (id, name, code, direction)
VALUES ('cccccccc-0000-0000-0000-000000000001', 'Príspevok', 'K13_TEST_INCOME', 'INCOME')
ON CONFLICT (code) DO NOTHING;

-- Dva účty s nulovým počiatočným zostatkom (vytvorené ako postgres/definer).
INSERT INTO public.finance_accounts (id, name, type, opening_balance_minor)
VALUES
    ('dddddddd-0000-0000-0000-000000000001', 'Pokladňa A', 'CASH', 0),
    ('dddddddd-0000-0000-0000-000000000002', 'Účet B', 'BANK', 0)
ON CONFLICT (id) DO NOTHING;

-- ===========================================================================
-- 1. RLS IZOLÁCIA – používateľ bez finance.view nevidí žiadne riadky
-- ===========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
    v_accounts integer;
    v_balances integer;
BEGIN
    SELECT count(*) INTO v_accounts FROM public.finance_accounts;
    SELECT count(*) INTO v_balances FROM public.finance_account_balances;

    IF v_accounts <> 0 THEN
        RAISE EXCEPTION 'TEST FAILED [1]: finance_accounts vracia % riadkov pre používateľa bez finance.view (očakávané 0)', v_accounts;
    END IF;
    IF v_balances <> 0 THEN
        RAISE EXCEPTION 'TEST FAILED [1]: finance_account_balances vracia % riadkov pre používateľa bez finance.view (očakávané 0)', v_balances;
    END IF;
    RAISE NOTICE 'PASS [1]: RLS izolácia – bez finance.view je počet riadkov 0 (accounts=%, balances=%)', v_accounts, v_balances;
END $$;

RESET ROLE;

-- ===========================================================================
-- 2. R1 – ochrana pred podvrhnutím identity (created_by / posted_by)
--    create_user (3333...) sa pokúsi vložiť POSTED transakciu s cudzími
--    created_by/posted_by = foreign_user (9999...). Musí to zlyhať už na
--    oprávnení (create_user nemá finance.edit → POSTED insert zakázaný).
--    Následne vloží DRAFT (povolené s finance.create) a overíme, že
--    created_by/updated_by boli NÚTENE nastavené na auth.uid() (3333...),
--    nie na podvrhnutú hodnotu.
-- ===========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

-- 2a: priamy POSTED insert bez finance.edit -> musí zlyhať.
--     Guard trigger finance_guard_transactions odmietne výnimkou (SQLSTATE
--     P0001). Overujeme presný SQLSTATE, aby neočakávaná chyba nebola braná
--     ako PASS; neočakávaný úspech vynútime výnimkou MIMO vnútorný blok.
DO $$
DECLARE
    v_blocked boolean := false;
    v_sqlstate text;
BEGIN
    BEGIN
        INSERT INTO public.finance_transactions
            (account_id, category_id, type, status, amount_minor, transaction_date,
             created_by, posted_by)
        VALUES
            ('dddddddd-0000-0000-0000-000000000001',
             'cccccccc-0000-0000-0000-000000000001',
             'INCOME', 'POSTED', 5000, CURRENT_DATE,
             '99999999-9999-9999-9999-999999999999',
             '99999999-9999-9999-9999-999999999999');
    EXCEPTION
        WHEN OTHERS THEN
            v_blocked := true;
            GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    END;

    IF NOT v_blocked THEN
        RAISE EXCEPTION 'TEST FAILED [2a]: POSTED insert bez finance.edit prešiel (mal by byť zamietnutý)';
    END IF;
    IF v_sqlstate <> 'P0001' THEN
        RAISE EXCEPTION 'TEST FAILED [2a]: odmietnutie mala byť výnimkou guard triggera (P0001), dostali sme SQLSTATE=%', v_sqlstate;
    END IF;
    RAISE NOTICE 'PASS [2a]: priamy POSTED insert bez finance.edit zamietnutý guard triggerom (P0001) (SQLSTATE=%)', v_sqlstate;
END $$;

-- 2b: DRAFT insert s pokusom o podvrhnutie created_by/updated_by cudzím UUID.
DO $$
DECLARE
    v_created_by uuid;
    v_updated_by uuid;
    v_new_id uuid;
BEGIN
    INSERT INTO public.finance_transactions
        (account_id, category_id, type, status, amount_minor, transaction_date,
         created_by, updated_by)
    VALUES
        ('dddddddd-0000-0000-0000-000000000001',
         'cccccccc-0000-0000-0000-000000000001',
         'INCOME', 'DRAFT', 12345, CURRENT_DATE,
         '99999999-9999-9999-9999-999999999999',
         '99999999-9999-9999-9999-999999999999')
    RETURNING id, created_by, updated_by INTO v_new_id, v_created_by, v_updated_by;

    IF v_created_by <> '33333333-3333-3333-3333-333333333333' THEN
        RAISE EXCEPTION 'TEST FAILED [2b]: created_by=% nie je auth.uid() (3333...); identita bola podvrhnutá', v_created_by;
    END IF;
    IF v_updated_by <> '33333333-3333-3333-3333-333333333333' THEN
        RAISE EXCEPTION 'TEST FAILED [2b]: updated_by=% nie je auth.uid() (3333...)', v_updated_by;
    END IF;
    RAISE NOTICE 'PASS [2b]: created_by/updated_by boli nútene na auth.uid() (podvrhnutie ignorované); id=%', v_new_id;
END $$;

RESET ROLE;


-- ===========================================================================
-- 3. IMMUTABILITA POSTED & STORNO
--    edit_user (4444...) vytvorí a zaúčtuje príjmovú transakciu, overí:
--      a) priama zmena sumy/účtu na POSTED riadku -> výnimka,
--      b) prechod POSTED -> VOID s void_reason -> úspech, suma vypadne
--         z finance_account_balances, ale záznam zostáva v DB.
-- ===========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

DO $$
DECLARE
    v_tx uuid;
    v_bal_before bigint;
    v_bal_after bigint;
    v_status public.finance_transaction_status;
BEGIN
    -- Vytvor a zaúčtaj príjem 10 000 centov (DRAFT -> POSTED).
    INSERT INTO public.finance_transactions
        (account_id, category_id, type, status, amount_minor, transaction_date)
    VALUES
        ('dddddddd-0000-0000-0000-000000000001',
         'cccccccc-0000-0000-0000-000000000001',
         'INCOME', 'DRAFT', 10000, CURRENT_DATE)
    RETURNING id INTO v_tx;

    UPDATE public.finance_transactions
    SET status = 'POSTED'
    WHERE id = v_tx;

    SELECT current_balance_minor INTO v_bal_before
    FROM public.finance_account_balances
    WHERE account_id = 'dddddddd-0000-0000-0000-000000000001';

    IF v_bal_before <> 10000 THEN
        RAISE EXCEPTION 'TEST FAILED [3]: zostatok po zaúčtovaní = % (očakávané 10000)', v_bal_before;
    END IF;

    -- 3a: pokus o priamu zmenu sumy na POSTED riadku -> musí zlyhať (P0001).
    DECLARE
        v_blocked boolean := false;
        v_sqlstate text;
    BEGIN
        BEGIN
            UPDATE public.finance_transactions
            SET amount_minor = 99999
            WHERE id = v_tx;
        EXCEPTION
            WHEN OTHERS THEN
                v_blocked := true;
                GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
        END;

        IF NOT v_blocked THEN
            RAISE EXCEPTION 'TEST FAILED [3a]: zmena sumy POSTED transakcie prešla (musela by zlyhať)';
        END IF;
        IF v_sqlstate <> 'P0001' THEN
            RAISE EXCEPTION 'TEST FAILED [3a]: očakávaný guard trigger (P0001), dostali sme SQLSTATE=%', v_sqlstate;
        END IF;
        RAISE NOTICE 'PASS [3a]: priama zmena sumy POSTED transakcie zamietnutá guard triggerom (P0001) (SQLSTATE=%)', v_sqlstate;
    END;

    -- 3a2: pokus o zmenu účtu na POSTED riadku -> musí zlyhať (P0001).
    DECLARE
        v_blocked boolean := false;
        v_sqlstate text;
    BEGIN
        BEGIN
            UPDATE public.finance_transactions
            SET account_id = 'dddddddd-0000-0000-0000-000000000002'
            WHERE id = v_tx;
        EXCEPTION
            WHEN OTHERS THEN
                v_blocked := true;
                GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
        END;

        IF NOT v_blocked THEN
            RAISE EXCEPTION 'TEST FAILED [3a2]: zmena účtu POSTED transakcie prešla (musela by zlyhať)';
        END IF;
        IF v_sqlstate <> 'P0001' THEN
            RAISE EXCEPTION 'TEST FAILED [3a2]: očakávaný guard trigger (P0001), dostali sme SQLSTATE=%', v_sqlstate;
        END IF;
        RAISE NOTICE 'PASS [3a2]: zmena účtu POSTED transakcie zamietnutá guard triggerom (P0001) (SQLSTATE=%)', v_sqlstate;
    END;

    -- 3b: storno POSTED -> VOID s dôvodom.
    UPDATE public.finance_transactions
    SET status = 'VOID', void_reason = 'Testovacie storno'
    WHERE id = v_tx;

    SELECT current_balance_minor INTO v_bal_after
    FROM public.finance_account_balances
    WHERE account_id = 'dddddddd-0000-0000-0000-000000000001';

    SELECT status INTO v_status
    FROM public.finance_transactions
    WHERE id = v_tx;

    IF v_bal_after <> 0 THEN
        RAISE EXCEPTION 'TEST FAILED [3b]: zostatok po storne = % (očakávané 0)', v_bal_after;
    END IF;
    IF v_status <> 'VOID' THEN
        RAISE EXCEPTION 'TEST FAILED [3b]: status po storne = % (očakávané VOID)', v_status;
    END IF;

    -- Uložíme id tejto transakcie, aby scenár 5 overil audit PRESNE pre ňu
    -- (korelácia podľa entity_id, nie podľa času).
    CREATE TEMP TABLE IF NOT EXISTS _k13_tx3 (tx uuid);
    DELETE FROM _k13_tx3;
    INSERT INTO _k13_tx3 (tx) VALUES (v_tx);

    RAISE NOTICE 'PASS [3b]: storno OK – zostatok klesol na 0, záznam zostáva ako VOID (tx=%)', v_tx;
END $$;

RESET ROLE;

-- ===========================================================================
-- 4. INTEGRITA PREVODOV (R2 DEFERRABLE trigger) + ATOMICKÝ RPC
-- ===========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

-- 4a: manuálny INSERT iba jednej TRANSFER_OUT nohy -> musí zlyhať.
--     DEFERRABLE trigger (finance_guard_transfer_group) je predvolene DEFERRED,
--     takže by sa kontroloval až pri COMMIT. Pre izolované otestovanie ho
--     prepneme na IMMEDIATE PRED vkladaním, aby sa spustil hneď na konci
--     INSERT príkazu (párová TRANSFER_IN noha chýba -> výnimka P0001).
--     Overujeme presný SQLSTATE a odmietame neočakávaný úspech.
DO $$
DECLARE
    v_grp uuid := gen_random_uuid();
    v_blocked boolean := false;
    v_sqlstate text;
BEGIN
    SET CONSTRAINTS ALL IMMEDIATE;

    BEGIN
        INSERT INTO public.finance_transactions
            (account_id, type, status, amount_minor, transaction_date, transfer_group_id)
        VALUES
            ('dddddddd-0000-0000-0000-000000000001',
             'TRANSFER_OUT', 'DRAFT', 7000, CURRENT_DATE, v_grp);
    EXCEPTION
        WHEN OTHERS THEN
            v_blocked := true;
            GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    END;

    -- Návrat deferred režimu na predvolený pre zvyšok testu.
    SET CONSTRAINTS ALL DEFERRED;

    IF NOT v_blocked THEN
        RAISE EXCEPTION 'TEST FAILED [4a]: osamotená TRANSFER_OUT noha prešla (trigger nesklamal)';
    END IF;
    IF v_sqlstate <> 'P0001' THEN
        RAISE EXCEPTION 'TEST FAILED [4a]: očakávaný finance_guard_transfer_group (P0001), dostali sme SQLSTATE=%', v_sqlstate;
    END IF;
    RAISE NOTICE 'PASS [4a]: osamotená TRANSFER_OUT noha zamietnutá finance_guard_transfer_group (P0001) (SQLSTATE=%)', v_sqlstate;
END $$;

RESET ROLE;


-- 4b: RPC finance_create_transfer vytvorí OBE nohy atomicky.
DO $$
DECLARE
    v_grp uuid;
    v_out_count integer;
    v_in_count integer;
    v_out_acct uuid;
    v_in_acct uuid;
    v_out_amt bigint;
    v_in_amt bigint;
    v_total_before bigint;
    v_total_after bigint;
BEGIN
    -- Celkový súčet prostriedkov zboru pred prevodom.
    SELECT COALESCE(SUM(current_balance_minor), 0) INTO v_total_before
    FROM public.finance_account_balances;

    -- Zaúčtovaný prevod 7 000 centov A -> B.
    v_grp := public.finance_create_transfer(
        p_from_account_id := 'dddddddd-0000-0000-0000-000000000001',
        p_to_account_id   := 'dddddddd-0000-0000-0000-000000000002',
        p_amount_minor    := 7000,
        p_transaction_date:= CURRENT_DATE,
        p_description     := 'Testovací prevod',
        p_post            := true
    );

    SELECT count(*) INTO v_out_count FROM public.finance_transactions
    WHERE transfer_group_id = v_grp AND type = 'TRANSFER_OUT';
    SELECT count(*) INTO v_in_count FROM public.finance_transactions
    WHERE transfer_group_id = v_grp AND type = 'TRANSFER_IN';

    SELECT account_id, amount_minor INTO v_out_acct, v_out_amt FROM public.finance_transactions
    WHERE transfer_group_id = v_grp AND type = 'TRANSFER_OUT';
    SELECT account_id, amount_minor INTO v_in_acct, v_in_amt FROM public.finance_transactions
    WHERE transfer_group_id = v_grp AND type = 'TRANSFER_IN';

    IF v_out_count <> 1 OR v_in_count <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED [4b]: neplatný počet nôh (OUT=%, IN=%)', v_out_count, v_in_count;
    END IF;
    IF v_out_acct <> 'dddddddd-0000-0000-0000-000000000001'
       OR v_in_acct <> 'dddddddd-0000-0000-0000-000000000002' THEN
        RAISE EXCEPTION 'TEST FAILED [4b]: nesprávne účty nôh (OUT=%, IN=%)', v_out_acct, v_in_acct;
    END IF;
    IF v_out_amt <> v_in_amt OR v_out_amt <> 7000 THEN
        RAISE EXCEPTION 'TEST FAILED [4b]: sumy nôh sa nezhodujú (OUT=%, IN=%)', v_out_amt, v_in_amt;
    END IF;

    SELECT COALESCE(SUM(current_balance_minor), 0) INTO v_total_after
    FROM public.finance_account_balances;

    IF v_total_before <> v_total_after THEN
        RAISE EXCEPTION 'TEST FAILED [4b]: prevod zmenil celkový súčet prostriedkov (% -> %)', v_total_before, v_total_after;
    END IF;
    RAISE NOTICE 'PASS [4b]: RPC prevod OK – 2 nohy, zhodný group=%, rovnaká suma 7000, celkový súčet nezmenený (total_after=%)', v_grp, v_total_after;
END $$;

RESET ROLE;

-- ===========================================================================
-- 5. AUDIT LOG VERIFIKÁCIA
--    Overíme, že kľúčové operácie vytvorili presne jeden auditný záznam
--    so správnou akciou a identitou (FINANCE_TRANSACTION_POST / _VOID).
--    Auditný trigger je AFTER, takže pri zamietnutých zápisoch nevzniká
--    žiadny záznam.
--
--    POZNÁMKA: public.audit_log má RLS SELECT politiku len pre roli ADMIN,
--    preto čítame audit ako vlastník DB (postgres = predvolená rola relácie),
--    ktorý RLS obchádza. Zápisy triggera (SECURITY DEFINER) prebehli počas
--    scenárov 3/4 ako autentifikovaný používateľ a user_id bol správne
--    nastavený na auth.uid() vtedy.
-- ===========================================================================
RESET ROLE;

DO $$
DECLARE
    v_tx uuid;
    v_post_count integer;
    v_void_count integer;
    v_identity_ok integer;
BEGIN
    SELECT tx INTO v_tx FROM _k13_tx3;

    -- Korelácia PRESNE podľa entity_id (konkrétna testovacia transakcia) a akcie.
    -- ŽIADNY časový filter – ten je v rámci jednej transakcie nespoľahlivý
    -- (NOW() je zamrznutý na štarte transakcie, takže created_at >= v_started
    --  by buď vylúčil všetko, alebo zahrnulo cudzie operácie). entity_id je
    -- jednoznačný korelačný kľúč.
    SELECT count(*) INTO v_post_count
    FROM public.audit_log
    WHERE action = 'FINANCE_TRANSACTION_POST'
      AND entity_id = v_tx
      AND user_id = '44444444-4444-4444-4444-444444444444'
      AND module = 'finance_transactions';

    SELECT count(*) INTO v_void_count
    FROM public.audit_log
    WHERE action = 'FINANCE_TRANSACTION_VOID'
      AND entity_id = v_tx
      AND user_id = '44444444-4444-4444-4444-444444444444'
      AND module = 'finance_transactions';

    SELECT count(*) INTO v_identity_ok
    FROM public.audit_log
    WHERE action = 'FINANCE_TRANSACTION_POST'
      AND entity_id = v_tx
      AND user_id = '44444444-4444-4444-4444-444444444444';

    IF v_post_count <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED [5]: FINANCE_TRANSACTION_POST count=% pre tx=% (očakávané 1)', v_post_count, v_tx;
    END IF;
    IF v_void_count <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED [5]: FINANCE_TRANSACTION_VOID count=% pre tx=% (očakávané 1)', v_void_count, v_tx;
    END IF;
    IF v_identity_ok <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED [5]: auditná identita POST nie je auth.uid() (count=%)', v_identity_ok;
    END IF;

    RAISE NOTICE 'PASS [5]: audit OK – POST=1, VOID=1, identita=auth.uid() (4444...)';
END $$;


-- ===========================================================================
-- 6. STORAGE DRAFT-ONLY OCHRANA (K13.1.3)
--    Overuje helper funkcie a RLS politiky bucketu finance_documents.
--    Predpoklad: migrácia 20261016 (bucket) a 20261017 (hardening) aplikované.
--
--    Vytvoríme dve transakcie: DRAFT (eeee...0001) a POSTED (eeee...0002).
--    Overíme helper can_upload_/can_modify_/can_read_ a reálne správanie
--    storage.objects RLS (INSERT/UPDATE/DELETE) pod jednotlivými používateľmi.
--    Neúspešné operácie odchytíme cez SQLSTATE; neočakávaný úspech odmietneme.
-- ===========================================================================
RESET ROLE;

-- Priprava: DRAFT a POSTED transakcia (vytvorené ako vlastník DB).
DO $$
DECLARE
    v_draft uuid := 'eeeeeeee-0000-0000-0000-000000000001';
    v_posted uuid := 'eeeeeeee-0000-0000-0000-000000000002';
BEGIN
    INSERT INTO public.finance_transactions (id, account_id, category_id, type, status, amount_minor, transaction_date)
    VALUES (v_draft, 'dddddddd-0000-0000-0000-000000000001',
            'cccccccc-0000-0000-0000-000000000001', 'INCOME', 'DRAFT', 100, CURRENT_DATE)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.finance_transactions (id, account_id, category_id, type, status, amount_minor, transaction_date, posted_at, posted_by)
    VALUES (v_posted, 'dddddddd-0000-0000-0000-000000000001',
            'cccccccc-0000-0000-0000-000000000001', 'INCOME', 'POSTED', 200, CURRENT_DATE, NOW(), '44444444-4444-4444-4444-444444444444')
    ON CONFLICT (id) DO NOTHING;

    -- Objekt pre POSTED tx vložíme ako vlastník DB (RLS obchádza), aby 6b/6c
    -- mali existujúci cieľ na otestovanie UPDATE/DELETE odmietnutia.
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
    VALUES ('finance_documents', 'eeeeeeee-0000-0000-0000-000000000002/faktura.pdf',
            '44444444-4444-4444-4444-444444444444', NULL, '{}'::jsonb)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'PASS [6-prep]: pripravené DRAFT=% a POSTED=% transakcie + objekt pod POSTED', v_draft, v_posted;
END $$;

-- 6a: create_user môže nahrávať (INSERT) len pod DRAFT tx.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

DO $$
DECLARE
    v_upload_ok boolean := false;
    v_post_blocked boolean := false;
    v_state text;
BEGIN
    IF NOT public.can_upload_finance_attachment('eeeeeeee-0000-0000-0000-000000000001/x.pdf') THEN
        RAISE EXCEPTION 'TEST FAILED [6a]: can_upload_finance_attachment pre DRAFT tx mal vrátiť true';
    END IF;
    v_upload_ok := true;

    -- INSERT do storage.objects pod DRAFT tx -> prejde.
    BEGIN
        INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
        VALUES ('finance_documents', 'eeeeeeee-0000-0000-0000-000000000001/uctenka.pdf',
                '33333333-3333-3333-3333-333333333333', NULL, '{}'::jsonb);
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'TEST FAILED [6a]: INSERT pod DRAFT tx bol zamietnutý (%)', SQLERRM;
    END;

    -- INSERT do storage.objects pod POSTED tx -> musí byť zamietnutý RLS.
    BEGIN
        INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
        VALUES ('finance_documents', 'eeeeeeee-0000-0000-0000-000000000002/faktura2.pdf',
                '33333333-3333-3333-3333-333333333333', NULL, '{}'::jsonb);
    EXCEPTION WHEN OTHERS THEN
        v_post_blocked := true;
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    END;

    IF NOT v_post_blocked THEN
        RAISE EXCEPTION 'TEST FAILED [6a]: INSERT pod POSTED tx prešiel (mal by byť zamietnutý RLS)';
    END IF;
    RAISE NOTICE 'PASS [6a]: upload len pod DRAFT tx; upload pod POSTED tx zamietnutý (SQLSTATE=%)', v_state;
END $$;

RESET ROLE;

-- 6b: edit_user NEmôže meniť/mazať prílohu POSTED tx; DRAFT tx môže.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

DO $$
DECLARE
    v_update_blocked boolean := false;
    v_delete_blocked boolean := false;
    v_state text;
BEGIN
    -- Helper logika.
    IF public.can_modify_finance_attachment('eeeeeeee-0000-0000-0000-000000000002/faktura.pdf') THEN
        RAISE EXCEPTION 'TEST FAILED [6b]: can_modify pre POSTED tx vracia true (malo by byť false)';
    END IF;
    IF NOT public.can_modify_finance_attachment('eeeeeeee-0000-0000-0000-000000000001/uctenka.pdf') THEN
        RAISE EXCEPTION 'TEST FAILED [6b]: can_modify pre DRAFT tx vracia false (malo by byť true)';
    END IF;

    -- UPDATE (premenovanie) objektu pod POSTED tx -> RLS USING odmietne (0 riadkov).
    -- Ak by RLS zlyhalo, UPDATE by neovplyvnilo žiadny riadok. Overujeme GET DIAGNOSTICS.
    BEGIN
        UPDATE storage.objects
        SET name = 'eeeeeeee-0000-0000-0000-000000000002/premenovane.pdf'
        WHERE bucket_id = 'finance_documents'
          AND name = 'eeeeeeee-0000-0000-0000-000000000002/faktura.pdf';
        -- Ak by prešlo, objekt by sa premenoval -> vynutíme zlyhanie nižšie.
        IF EXISTS (
            SELECT 1 FROM storage.objects
            WHERE bucket_id = 'finance_documents'
              AND name = 'eeeeeeee-0000-0000-0000-000000000002/premenovane.pdf'
        ) THEN
            v_update_blocked := false;
        ELSE
            v_update_blocked := true; -- 0 riadkov = RLS blokovalo (ochrana funguje)
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_update_blocked := true;
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    END;

    IF NOT v_update_blocked THEN
        RAISE EXCEPTION 'TEST FAILED [6b]: premenovanie objektu POSTED tx prešlo (RLS nemalo dovoliť)';
    END IF;

    -- DELETE objektu pod POSTED tx -> RLS odmietne.
    BEGIN
        DELETE FROM storage.objects
        WHERE bucket_id = 'finance_documents'
          AND name = 'eeeeeeee-0000-0000-0000-000000000002/faktura.pdf';
        IF EXISTS (
            SELECT 1 FROM storage.objects
            WHERE bucket_id = 'finance_documents'
              AND name = 'eeeeeeee-0000-0000-0000-000000000002/faktura.pdf'
        ) THEN
            v_delete_blocked := true; -- objekt stále existuje = RLS blokovalo
        ELSE
            v_delete_blocked := false;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_delete_blocked := true;
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    END;

    IF NOT v_delete_blocked THEN
        RAISE EXCEPTION 'TEST FAILED [6b]: mazanie objektu POSTED tx prešlo (RLS nemalo dovoliť)';
    END IF;

    RAISE NOTICE 'PASS [6b]: UPDATE/DELETE objektu POSTED tx odmietnuté; DRAFT tx cez helper povolené';
END $$;

RESET ROLE;

-- 6c: none_user nemá žiadny prístup k prílohám.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
    v_cnt integer;
BEGIN
    IF public.can_read_finance_attachment('eeeeeeee-0000-0000-0000-000000000001/uctenka.pdf') THEN
        RAISE EXCEPTION 'TEST FAILED [6c]: none_user môže čítať prílohu (malo by byť false)';
    END IF;
    IF public.can_upload_finance_attachment('eeeeeeee-0000-0000-0000-000000000001/uctenka.pdf') THEN
        RAISE EXCEPTION 'TEST FAILED [6c]: none_user môže nahrávať prílohu (malo by byť false)';
    END IF;

    SELECT count(*) INTO v_cnt
    FROM storage.objects
    WHERE bucket_id = 'finance_documents';
    IF v_cnt <> 0 THEN
        RAISE EXCEPTION 'TEST FAILED [6c]: none_user vidí % objektov (očakávané 0)', v_cnt;
    END IF;

    RAISE NOTICE 'PASS [6c]: none_user nemá prístup k prílohám (helper=false, SELECT=0 riadkov)';
END $$;

RESET ROLE;



-- ===========================================================================
-- 7. AUDIT HOTFIX (K13.1.4) – overenie, že audit_finance_changes() NEhodí
--    SQLSTATE 42703 na tabuľkách bez status/created_by/updated_by a že akcie
--    CREATE/POST/VOID sú správne.
--    Predpoklad: migrácia 20261018 (hotfix) je aplikovaná.
-- ===========================================================================
RESET ROLE;

-- 7a: Operácie na tabuľkách BEZ status (accounts, categories, plans) a na
--     attachments (bez created_by/updated_by) nesmú hodit 42703.
DO $$
DECLARE
    v_acct uuid;
    v_cat  uuid;
    v_plan uuid;
    v_att  uuid;
    v_tx   uuid := 'eeeeeeee-0000-0000-0000-000000000001'; -- DRAFT tx z 6-prep
BEGIN
    -- finance_accounts: bez status.
    INSERT INTO public.finance_accounts (name, type, opening_balance_minor)
    VALUES ('K13 audit účet', 'CASH', 0) RETURNING id INTO v_acct;
    UPDATE public.finance_accounts SET notes = 'uprava' WHERE id = v_acct;

    -- finance_categories: bez status.
    INSERT INTO public.finance_categories (name, code, direction)
    VALUES ('K13 audit kat', 'K13_AUDIT_CAT', 'EXPENSE') RETURNING id INTO v_cat;
    UPDATE public.finance_categories SET description = 'uprava' WHERE id = v_cat;

    -- finance_plans: bez status (finance_plans má status, ale iný enum) –
    --              audit ho musí čítať bezpečne.
    INSERT INTO public.finance_plans (name, plan_type, direction, amount_minor, planned_date)
    VALUES ('K13 audit plan', 'BUDGET', 'EXPENSE', 100, CURRENT_DATE) RETURNING id INTO v_plan;
    UPDATE public.finance_plans SET description = 'uprava' WHERE id = v_plan;

    -- finance_transaction_attachments: bez created_by/updated_by (len uploaded_by).
    INSERT INTO public.finance_transaction_attachments (transaction_id, storage_path, file_name, uploaded_by)
    VALUES (v_tx, v_tx::text || '/doc.pdf', 'doc.pdf', '44444444-4444-4444-4444-444444444444')
    RETURNING id INTO v_att;

    RAISE NOTICE 'PASS [7a]: INSERT/UPDATE na accounts/categories/plans/attachments prebehli bez 42703 (acct=%, cat=%, plan=%, att=%)', v_acct, v_cat, v_plan, v_att;
END $$;

-- 7b: FINANCE_TRANSACTION_CREATE / _POST / _VOID správne podľa stavu a operácie.
--     Zápisy idú cez authenticated (rovnaké RLS/triggery ako v aplikácii);
--     čítanie audit_log ide ako vlastník DB (audit_log SELECT RLS = len ADMIN).
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

DO $$
DECLARE
    v_tx uuid;
BEGIN
    -- CREATE (DRAFT).
    INSERT INTO public.finance_transactions
        (account_id, category_id, type, status, amount_minor, transaction_date)
    VALUES ('dddddddd-0000-0000-0000-000000000001',
            'cccccccc-0000-0000-0000-000000000001',
            'INCOME', 'DRAFT', 333, CURRENT_DATE)
    RETURNING id INTO v_tx;

    -- POST (DRAFT -> POSTED).
    UPDATE public.finance_transactions SET status = 'POSTED' WHERE id = v_tx;

    -- VOID (POSTED -> VOID).
    UPDATE public.finance_transactions SET status = 'VOID', void_reason = 'audit hotfix test' WHERE id = v_tx;

    -- Uložíme id do temp tabuľky, aby sme ho mohli čítať po RESET ROLE.
    CREATE TEMP TABLE IF NOT EXISTS _k13_tx7b (tx uuid);
    DELETE FROM _k13_tx7b;
    INSERT INTO _k13_tx7b (tx) VALUES (v_tx);
END $$;

RESET ROLE;

DO $$
DECLARE
    v_tx uuid;
    v_create integer; v_post integer; v_void integer;
BEGIN
    SELECT tx INTO v_tx FROM _k13_tx7b;

    -- Korelácia podľa entity_id (konkrétna testovacia transakcia) – bez časového
    -- filtra (NOW() je v rámci transakcie zamrznutý, časový filter je nespoľahlivý).
    SELECT count(*) INTO v_create FROM public.audit_log
    WHERE action = 'FINANCE_TRANSACTION_CREATE' AND entity_id = v_tx;
    SELECT count(*) INTO v_post FROM public.audit_log
    WHERE action = 'FINANCE_TRANSACTION_POST' AND entity_id = v_tx;
    SELECT count(*) INTO v_void FROM public.audit_log
    WHERE action = 'FINANCE_TRANSACTION_VOID' AND entity_id = v_tx;

    IF v_create <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED [7b]: FINANCE_TRANSACTION_CREATE count=% (očakávané 1)', v_create;
    END IF;
    IF v_post <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED [7b]: FINANCE_TRANSACTION_POST count=% (očakávané 1)', v_post;
    END IF;
    IF v_void <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED [7b]: FINANCE_TRANSACTION_VOID count=% (očakávané 1)', v_void;
    END IF;

    RAISE NOTICE 'PASS [7b]: audit akcie CREATE=1, POST=1, VOID=1 (bez duplikátov) pre tx=%', v_tx;
END $$;

RESET ROLE;

-- 7c: Zlyhaná operácia (blokovaná guard triggerom) nevytvorí auditný záznam.
--     Prisný dôkaz: zaznamenáme počet auditných záznamov PRE neúspešný pokus
--     (do temp tabuľky) a po ňom; delta MUSÍ byť 0. Časový filter by bol
--     nespoľahlivý – NOW() je v rámci transakcie zamrznutý a používateľ 3333
--     už v scenári 2b legitímne vytvoril jeden CREATE záznam, ktorý by
--     now()-marker zahrnul. Korelácia preto ide cez delta počtu záznamov.
RESET ROLE;

-- Snapshot PRED neúspešným pokusom (čítame ako vlastník DB).
DO $$
DECLARE
    v_before integer;
BEGIN
    SELECT count(*) INTO v_before
    FROM public.audit_log
    WHERE user_id = '33333333-3333-3333-3333-333333333333'
      AND module = 'finance_transactions';

    CREATE TEMP TABLE IF NOT EXISTS _k13_audit7c (before_cnt integer);
    DELETE FROM _k13_audit7c;
    INSERT INTO _k13_audit7c (before_cnt) VALUES (v_before);
END $$;

-- Neúspešný pokus ako create_user (bez finance.edit) -> guard trigger zlyhá.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

DO $$
DECLARE
    v_blocked boolean := false;
BEGIN
    BEGIN
        INSERT INTO public.finance_transactions
            (account_id, category_id, type, status, amount_minor, transaction_date)
        VALUES ('dddddddd-0000-0000-0000-000000000001',
                'cccccccc-0000-0000-0000-000000000001',
                'INCOME', 'POSTED', 444, CURRENT_DATE);
    EXCEPTION WHEN OTHERS THEN
        v_blocked := true;
    END;

    IF NOT v_blocked THEN
        RAISE EXCEPTION 'TEST FAILED [7c]: POSTED insert bez finance.edit prešiel';
    END IF;
END $$;

RESET ROLE;

-- Porovnanie: počet auditných záznamov sa nesmie zmeniť.
DO $$
DECLARE
    v_before integer;
    v_after integer;
BEGIN
    SELECT before_cnt INTO v_before FROM _k13_audit7c;

    SELECT count(*) INTO v_after
    FROM public.audit_log
    WHERE user_id = '33333333-3333-3333-3333-333333333333'
      AND module = 'finance_transactions';

    IF v_after <> v_before THEN
        RAISE EXCEPTION 'TEST FAILED [7c]: zlyhaná operácia pridala auditné záznamy (before=%, after=%)', v_before, v_after;
    END IF;

    RAISE NOTICE 'PASS [7c]: zlyhaná operácia nepridala auditný záznam (before=% = after=%)', v_before, v_after;
END $$;

RESET ROLE;


-- ===========================================================================
-- KONIEC – zrušíme všetky zmeny, testovacie dáta sa nepersistujú.
-- ===========================================================================
ROLLBACK;

