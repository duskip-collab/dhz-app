-- ============================================================================
-- K13.2.5 — finance_guard_transactions() NULL identity handling tests
-- Date: 20261022
-- Purpose: Overenie správania finance_guard_transactions(), keď auth.uid()
--          vracia NULL, cez migráciu 20261022_finance_transaction_guard_fix.sql.
--
-- ŠTAT: BLOCKED — prebežné runtime testy vyžadujú autorizovanú vývojovú
-- Supabase DB. Statická kontrola syntaxu: prebehne lokalne (ak je psql dostupný).
--
-- AKO SPÚŠŤAŤ:
--   Supabase SQL editore / psql (ako vlastník DB) v rámci transakcie
--   (BEGIN ... ROLLBACK). Každý scenár explicitne nastaví alebo vyčistí
--   JWT claims cez RESET ROLE + RESET "request.jwt.claims". Nevyrovnáva sa
--   náhodne zachované claims z predchádzajúcich scenárov.
--
-- ============================================================

BEGIN;

-- ============================================================
-- Príprava testovacích používateľov (FK na auth.users) + oprávnenia
-- ============================================================
DO $$
DECLARE
    v_users uuid[] := ARRAY[
        '44444444-4444-4444-4444-444444444444'::uuid, -- finance.edit
        '33333333-3333-3333-3333-333333333333'::uuid  -- bezo finance.edit
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
            'k1325_' || replace(u::text, '-', '') || '@test.local', '',
            NOW(), NOW(), NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
        )
        ON CONFLICT (id) DO NOTHING;
    END LOOP;
END $$;

-- Oprávnenie finance.edit pre edit_user (4444...). Deterministicky: najprv
-- odstránime existujúce riadky testovacích identít, aby staršie granty
-- (napr. finance.edit pre 3333...) nemohli prežiť cez ON CONFLICT DO NOTHING.
DELETE FROM public.user_permissions
WHERE user_id IN ('44444444-4444-4444-4444-444444444444',
                  '33333333-3333-3333-3333-333333333333');
INSERT INTO public.user_permissions (user_id, permission_id)
SELECT '44444444-4444-4444-4444-444444444444', p.id
FROM public.permissions p
WHERE p.code IN ('finance.view', 'finance.create', 'finance.edit');

-- create_user (3333...) má view + create, zámerne BEZ finance.edit.
INSERT INTO public.user_permissions (user_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333333', p.id
FROM public.permissions p
WHERE p.code IN ('finance.view', 'finance.create');

-- none_user (1111...) zámerne NEZÍSKA žiadne oprávnenia.

-- Testovacie účty a kategórie.
INSERT INTO public.finance_accounts (id, name, type, opening_balance_minor)
VALUES ('dddddddd-0000-0000-0000-000000000001', 'K13.2.5 Test Account', 'CASH', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.finance_categories (id, name, code, direction)
VALUES ('cccccccc-0000-0000-0000-000000000001', 'K13.2.5 Test Category', 'K13_25_CAT', 'EXPENSE')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 1. Autentifikovaný používateľ S finance.edit môže vykonať DRAFT -> POSTED.
-- ============================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

DO $$
DECLARE
    v_tx           uuid;
    v_status       public.finance_transaction_status;
BEGIN
    INSERT INTO public.finance_transactions
        (account_id, category_id, type, status, amount_minor, transaction_date)
    VALUES
        ('dddddddd-0000-0000-0000-000000000001',
         'cccccccc-0000-0000-0000-000000000001',
         'INCOME', 'DRAFT', 1000, CURRENT_DATE)
    RETURNING id INTO v_tx;

    UPDATE public.finance_transactions
    SET status = 'POSTED'
    WHERE id = v_tx;

    SELECT status INTO v_status
    FROM public.finance_transactions
    WHERE id = v_tx;

    IF v_status <> 'POSTED' THEN
        RAISE EXCEPTION 'TEST FAILED [1]: zaúčtovanie nefunguje (status=%)', v_status;
    END IF;

    RAISE NOTICE 'PASS [1]: finančný edit povolený pri auth.uid() IS NOT NULL (4444... = finance.edit)';
END $$;

RESET ROLE;

-- ============================================================
-- 2. Autentifikovaný používateľ BEZ finance.edit je odmietnutý (P0001).
-- ============================================================
RESET ROLE;
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

DO $$
DECLARE
    v_blocked  boolean := false;
    v_sqlstate text;
    v_tx       uuid;
BEGIN
    INSERT INTO public.finance_transactions
        (account_id, category_id, type, status, amount_minor, transaction_date)
    VALUES
        ('dddddddd-0000-0000-0000-000000000001',
         'cccccccc-0000-0000-0000-000000000001',
         'INCOME', 'DRAFT', 777, CURRENT_DATE)
    RETURNING id INTO v_tx;

    BEGIN
        UPDATE public.finance_transactions
        SET status = 'POSTED'
        WHERE id = v_tx;
    EXCEPTION WHEN OTHERS THEN
        v_blocked := true;
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    END;

    IF NOT v_blocked THEN
        RAISE EXCEPTION 'TEST FAILED [2]: používateľ bez finance.edit prešiel (mal by zlyhať)';
    END IF;
    IF v_sqlstate <> 'P0001' THEN
        RAISE EXCEPTION 'TEST FAILED [2]: očakávané SQLSTATE P0001, dostali sme %', v_sqlstate;
    END IF;

    RAISE NOTICE 'PASS [2]: používateľ BEZ finance.edit (3333...) je odmietnutý (SQLSTATE=%)', v_sqlstate;

END $$;

RESET ROLE;

-- ============================================================
-- 3. auth.uid() IS NULL bez trust boundary NEMOZE obist autorizaciu.
-- ============================================================
RESET ROLE;
RESET "request.jwt.claims";

DO $$
DECLARE
    v_blocked  boolean := false;
    v_sqlstate text;
    v_tx       uuid;
BEGIN
    BEGIN
        INSERT INTO public.finance_transactions
            (account_id, category_id, type, status, amount_minor, transaction_date)
        VALUES ('dddddddd-0000-0000-0000-000000000001',
                'cccccccc-0000-0000-0000-000000000001',
                'INCOME', 'POSTED', 1000, CURRENT_DATE);
    EXCEPTION WHEN OTHERS THEN
        v_blocked := true;
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'TEST FAILED [3a]: priamy POSTED insert pri NULL identite presiel';
    END IF;
    IF v_sqlstate <> 'P0001' THEN
        RAISE EXCEPTION 'TEST FAILED [3a]: ocakavane P0001, dostali sme %', v_sqlstate;
    END IF;

    SELECT id INTO v_tx FROM public.finance_transactions
    WHERE account_id = 'dddddddd-0000-0000-0000-000000000001' AND status = 'DRAFT' LIMIT 1;

    v_blocked := false;
    v_sqlstate := NULL;
    BEGIN
        UPDATE public.finance_transactions SET status = 'POSTED' WHERE id = v_tx;
    EXCEPTION WHEN OTHERS THEN
        v_blocked := true;
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'TEST FAILED [3b]: DRAFT->POSTED pri NULL identite bez trust boundary preslo';
    END IF;
    IF v_sqlstate <> 'P0001' THEN
        RAISE EXCEPTION 'TEST FAILED [3b]: ocakavane P0001, dostali sme %', v_sqlstate;
    END IF;
    RAISE NOTICE 'PASS [3]: auth.uid() IS NULL nemoze obist autorizaciu bez trust boundary (%)', v_sqlstate;
END $$;

RESET ROLE;

-- ============================================================
-- 4. Privilegovana operacia funguje IBA s explicitnou cestou (trust boundary).
-- ============================================================
RESET ROLE;
RESET "request.jwt.claims";

DO $$
DECLARE
    v_tx     uuid;
    v_status public.finance_transaction_status;
BEGIN
    INSERT INTO public.finance_transactions
        (account_id, category_id, type, status, amount_minor, transaction_date)
    VALUES ('dddddddd-0000-0000-0000-000000000001',
            'cccccccc-0000-0000-0000-000000000001',
            'INCOME', 'DRAFT', 2000, CURRENT_DATE)
    RETURNING id INTO v_tx;

    PERFORM public.finance_pti_enable();

    UPDATE public.finance_transactions SET status = 'POSTED' WHERE id = v_tx;
    SELECT status INTO v_status FROM public.finance_transactions WHERE id = v_tx;
    IF v_status <> 'POSTED' THEN
        RAISE EXCEPTION 'TEST FAILED [4]: posting s trust boundary nefunguje (status=%)', v_status;
    END IF;
    RAISE NOTICE 'PASS [4]: privilegovana operacia s trust boundary uspesna';
END $$;

RESET ROLE;

-- ============================================================
-- 5. DRAFT / POSTED / VOID pravidla a auditne polia su zachovane.
-- ============================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

DO $$
DECLARE
    v_tx uuid;
    v_st public.finance_transaction_status;
    v_cnt integer := 0;
BEGIN
    INSERT INTO public.finance_transactions
        (account_id, category_id, type, status, amount_minor, transaction_date)
    VALUES ('dddddddd-0000-0000-0000-000000000001',
            'cccccccc-0000-0000-0000-000000000001',
            'EXPENSE', 'DRAFT', 500, CURRENT_DATE)
    RETURNING id INTO v_tx;

    UPDATE public.finance_transactions SET status = 'POSTED' WHERE id = v_tx;
    UPDATE public.finance_transactions SET status = 'VOID', void_reason = 'K13.2.5 test' WHERE id = v_tx;

    SELECT status INTO v_st FROM public.finance_transactions WHERE id = v_tx;
    IF v_st <> 'VOID' THEN
        RAISE EXCEPTION 'TEST FAILED [5a]: VOID prechod nefunguje (status=%)', v_st;
    END IF;

    SELECT count(*) INTO v_cnt FROM public.audit_log
    WHERE entity_id = v_tx AND module = 'finance_transactions';
    IF v_cnt < 2 THEN
        RAISE EXCEPTION 'TEST FAILED [5b]: audit pocet=% (ocakavane >= 2)', v_cnt;
    END IF;
    RAISE NOTICE 'PASS [5]: DRAFT/POSTED/VOID pravidla zachovane, audit zapisy=%', v_cnt;
END $$;

RESET ROLE;

ROLLBACK;


