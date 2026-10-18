-- ============================================================================
-- K13.2.3 — INTEGRATION / RUNTIME testy: finance attachments guard
-- Date: 20261020
-- Purpose: Overenie migrácie 20261020_finance_attachments_guard.sql:
--           1. `uploaded_by` sa NEDÁ podvrhhnúť (nútené auth.uid()),
--           2. väzba cesty `<transaction_id>/<file>` je vynútená na metadátach,
--           3. DRAFT-only pravidlo pre INSERT/UPDATE/DELETE metadat,
--           4. auditné záznamy vznikajú PRESNE RAZ na operáciu
--              (guard je BEFORE, audit AFTER trigger -> žiadne duplikáty),
--           5. bucket `finance_documents` je privátny.
--
-- OZNAČENIE: INTEGRATION / RUNTIME. Tieto testy VYŽADUJÚ skutočnú Supabase
--            DB/Storage. Pokiaľ sa na autorizovanej vývojovej DB reálne
--            nevykonali, NESMÚ byť označené PASS — v tomto repozitáre sú
--            pripravené, ale NESPÚŠŤANÉ (stav: BLOCKED).
--
-- AKO SPÚŠŤAŤ:
--   Spustiť CELÝ súbor v Supabase SQL editore / psql ako vlastník DB.
--   Súbor je zabalený do BEGIN ... ROLLBACK — NEZANECHÁ žiadne dáta.
--   Každý scenár vypíše "PASS [n]: ..."; pri zlyhaní hodí "TEST FAILED [...]".
--
-- Predpoklad: migrácie 20261006 (core), 20261015 (finance + audit trigger),
--             20261017 (finance_attachment_tx_id + Storage hardening),
--             20261018 (audit hotfix),
--             20261021 (attachments guard — IBA invarianty integrity).
--
-- DÔLEŽITÉ (K13.2.4): migrácia 20261020 pôvodne robila v triggery AJ
-- autorizáciu. To bola regresia — `RESET ROLE` neresetuje GUC
-- `request.jwt.claims`, takže guard videl `auth.uid()` aj v privilegovanom
-- kontexte a zamietol zápis, ktorý RLS povoľuje (preto by padol existujúci
-- test `k13_finance_runtime_test.sql`, scenár 7a). Migrácia 20261021 to
-- opravila: guard rieši VÝHRADNE invarianty integrity, autorizáciu RLS.
-- Scenáre 5 (oprávnenia) teda overujú RLS, nie guard.
-- ============================================================================

BEGIN;

-- Fixné UUID testovacích používateľov (MUSIA existovať kvôli FK na auth.users):
--   none_user    : žiadne finance oprávnenia      (1111...)
--   create_user  : finance.view + finance.create  (3333...)
--   edit_user    : view + create + edit           (4444...)

-- ===========================================================================
-- 1. PRÍPRAVA — účty, kategórie, DRAFT a POSTED transakcie
--
--    DÔLEŽITÉ — prečo tu explicitne nastavujeme identitu:
--    `finance_guard_transactions()` (migrácia 20261015, riadky 422-427) pri
--    priamom INSERT riadku so statusom POSTED požaduje `finance.edit` pre
--    `auth.uid()`. Kontrózu robí BEZ podmienky `v_uid IS NOT NULL`, a
--    `has_permission(NULL, ...)` je VŽDY false (všetky EXISTS poddotazy
--    porovnávajú `user_id = NULL`). Preto západ padol s:
--      P0001: Creating a POSTED transaction requires finance.edit permission
--
--    RIEŠENIE: pred prípravou explicitne nastavíme identitu edit_user
--    (4444...), ktorý finance.edit MÁ. Rola zostáva vlastník DB (`RESET ROLE`),
--    takže RLS sa neaplikuje — meníme iba `auth.uid()`, nie práva.
--
--    Existujúci `k13_finance_runtime_test.sql` (scenár 6-prep, riadok 523)
--    tento krok robí NEÚMERNE — spolieha sa na „zvyškovú“ hodnotu GUC
--    `request.jwt.claims` = 4444, ktorá prežije `RESET ROLE`. Tu je to
--    explicitné, aby test nezávisel od poradia scenárov.
--
--    VEDĽAJŠÍ EFEKT (žiadny): guard tiež prepíše created_by / updated_by /
--    posted_by na 4444 — čo je presne hodnota, ktorú zápis špecifikuje.
-- ===========================================================================
RESET ROLE;
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
-- ===========================================================================
-- PRÍPRAVA testovacích používateľov – riadiace stĺpce auth.users (FK pre audit_log)
-- ===========================================================================
DO $$
DECLARE
    v_users uuid[] := ARRAY[
        '11111111-1111-1111-1111-111111111111'::uuid, -- none_user
        '33333333-3333-3333-3333-333333333333'::uuid, -- create_user
        '44444444-4444-4444-4444-444444444444'::uuid  -- edit_user
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
            'k1323_' || replace(u::text, '-', '') || '@test.local', '',
            NOW(), NOW(), NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
        )
        ON CONFLICT (id) DO NOTHING;
    END LOOP;
END $$;

-- ===========================================================
-- Oprávnenia testovacích identít (samostatný fixture; O5 katalóg sa nemení).
-- ===========================================================
DELETE FROM public.user_permissions
WHERE user_id IN ('11111111-1111-1111-1111-111111111111',
                  '33333333-3333-3333-3333-333333333333',
                  '44444444-4444-4444-4444-444444444444');
INSERT INTO public.user_permissions (user_id, permission_id)
SELECT '44444444-4444-4444-4444-444444444444', p.id
FROM public.permissions p
WHERE p.code IN ('finance.view', 'finance.create', 'finance.edit');
INSERT INTO public.user_permissions (user_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333333', p.id
FROM public.permissions p
WHERE p.code IN ('finance.view', 'finance.create');
-- none_user (1111...) zámerne NEZÍSKA žiadne oprávnenia.

-- ===========================================================================
-- 1. PRÍPRAVA — účty, kategórie, DRAFT a POSTED transakcie

DO $$
DECLARE
    v_draft  uuid := 'eeeeeeee-0000-0000-0000-000000000001';
    v_posted uuid := 'eeeeeeee-0000-0000-0000-000000000002';
BEGIN
    INSERT INTO public.finance_accounts (id, name, type, opening_balance_minor)
    VALUES ('dddddddd-0000-0000-0000-000000000001', 'K1323 ucet', 'CASH', 0)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.finance_categories (id, name, code, direction)
    VALUES ('cccccccc-0000-0000-0000-000000000001', 'K1323 kat', 'K1323_CAT', 'EXPENSE')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.finance_transactions
        (id, account_id, category_id, type, status, amount_minor, transaction_date)
    VALUES (v_draft, 'dddddddd-0000-0000-0000-000000000001',
            'cccccccc-0000-0000-0000-000000000001', 'EXPENSE', 'DRAFT', 100, CURRENT_DATE)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.finance_transactions
        (id, account_id, category_id, type, status, amount_minor, transaction_date,
         posted_at, posted_by)
    VALUES (v_posted, 'dddddddd-0000-0000-0000-000000000001',
            'cccccccc-0000-0000-0000-000000000001', 'EXPENSE', 'POSTED', 200,
            CURRENT_DATE, NOW(), '44444444-4444-4444-4444-444444444444')
    ON CONFLICT (id) DO NOTHING;

    -- Tretia transakcia (eeee...0003) — DRAFT, slúži výhradne ako fixture pre
    -- scenár 7 (DRAFT-only pri DELETE). V scenári 7 sa k nej vytvorí príloha
    -- a AZ POTOM sa zaúčtuje na POSTED — tak sa dostaneme k stavu
    -- „príloha pri POSTED transakcii“, ktorý priamym INSERTom vzniknúť nemôže.
    INSERT INTO public.finance_transactions
        (id, account_id, category_id, type, status, amount_minor, transaction_date)
    VALUES ('eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001',
                'cccccccc-0000-0000-0000-000000000001', 'EXPENSE', 'DRAFT', 300, CURRENT_DATE)
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'PASS [1-prep]: DRAFT=% POSTED=% pripravené', v_draft, v_posted;
END $$;

-- ===========================================================================
-- 2. IDENTITA AUTORA — `uploaded_by` sa nedá podvrhhnúť
--    create_user (3333) posiela uploaded_by = foreign_user (9999).
--    Guard ho MUSÍ prepísať na 3333 (= auth.uid()).
-- ===========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

DO $$
DECLARE
    v_tx  uuid := 'eeeeeeee-0000-0000-0000-000000000001';
    v_att uuid;
    v_by  uuid;
BEGIN
    INSERT INTO public.finance_transaction_attachments
        (transaction_id, storage_path, file_name, mime_type, file_size_bytes,
         uploaded_by)
    VALUES (v_tx, v_tx::text || '/uctenka.pdf', 'uctenka.pdf',
            'application/pdf', 1024,
            '99999999-9999-9999-9999-999999999999')   -- POKUS O PODVRHNUTIE
    RETURNING id, uploaded_by INTO v_att, v_by;

    IF v_by IS DISTINCT FROM '33333333-3333-3333-3333-333333333333' THEN
        RAISE EXCEPTION 'TEST FAILED [2]: uploaded_by=% (očakávané auth.uid()=3333...)', v_by;
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS _k1323_att2 (att uuid);
    DELETE FROM _k1323_att2;
    INSERT INTO _k1323_att2 (att) VALUES (v_att);

    RAISE NOTICE 'PASS [2]: uploaded_by nútené na auth.uid() (3333...); pokus o 9999... odmietnutý';
END $$;

-- ===========================================================================
-- 3. VÄZBA CESTY — prvý segment storage_path musí byť transaction_id
-- ===========================================================================
DO $$
DECLARE
    v_tx_a uuid := 'eeeeeeee-0000-0000-0000-000000000001';
    v_tx_b uuid := 'eeeeeeee-0000-0000-0000-000000000002';
BEGIN
    -- 3a: cesta patrí inej transakcii -> musí byť zamietnutá.
    BEGIN
        INSERT INTO public.finance_transaction_attachments
            (transaction_id, storage_path, file_name)
        VALUES (v_tx_a, v_tx_b::text || '/cudzia-cesta.pdf', 'cudzia-cesta.pdf');
        RAISE EXCEPTION 'TEST FAILED [3a]: väzba cesty prešlo (storage_path z inej transakcie)';
    EXCEPTION
        WHEN check_violation OR raise_exception THEN
            IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF;
    END;

    -- 3b: prvý segment nie je UUID -> musí byť zamietnuté.
    BEGIN
        INSERT INTO public.finance_transaction_attachments
            (transaction_id, storage_path, file_name)
        VALUES (v_tx_a, 'nie-je-uuid/subor.pdf', 'subor.pdf');
        RAISE EXCEPTION 'TEST FAILED [3b]: ne-UUID prefix cesty prešiel';
    EXCEPTION
        WHEN check_violation OR raise_exception THEN
            IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF;
    END;

    RAISE NOTICE 'PASS [3]: väzba <transaction_id>/<file> je vynútená (3a + 3b zamietnuté)';
END $$;

-- ===========================================================================
-- 4. DRAFT-ONLY — príloha k POSTED transakcii je zamietnutá
-- ===========================================================================
DO $$
DECLARE
    v_posted uuid := 'eeeeeeee-0000-0000-0000-000000000002';
BEGIN
    BEGIN
        INSERT INTO public.finance_transaction_attachments
            (transaction_id, storage_path, file_name)
        VALUES (v_posted, v_posted::text || '/faktura.pdf', 'faktura.pdf');
        RAISE EXCEPTION 'TEST FAILED [4]: príloha k POSTED transakcii prešla';
    EXCEPTION
        WHEN check_violation OR raise_exception THEN
            IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF;
    END;

    RAISE NOTICE 'PASS [4]: INSERT metadat k POSTED transakcii zamietnutý';
END $$;

-- ===========================================================================
-- 5. OPRÁVNENIA — none_user nemôže zapisovať ani vidieť metadácie
--    POZNÁMKA: autorizáciu tu vynucuje RLS (finance_attach_insert/select),
--    NIE guard trigger. Guard bol v 20261021 zbavený autorizácie — guard rieši
--    len invarianty integrity (väzba cesty, DRAFT-only, existencia rodiča).
--    Tento scenár teda overuje RLS, čo je správna a jediná vrstva prístupu.
-- ===========================================================================
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE
    v_tx   uuid := 'eeeeeeee-0000-0000-0000-000000000001';
    v_seen integer;
BEGIN
    -- 5a: INSERT bez finance.create -> odmietnutý RLS politikou.
    --     (ak by guard ešte robil autorizáciu, výnimka by prišla z neho;
    --      obidve vety sú pre test prijateľné — rozhodujúce je, že PREJDE.)
    BEGIN
        INSERT INTO public.finance_transaction_attachments
            (transaction_id, storage_path, file_name)
        VALUES (v_tx, v_tx::text || '/none.pdf', 'none.pdf');
        RAISE EXCEPTION 'TEST FAILED [5a]: none_user vytvoril prílohu';
    EXCEPTION
        WHEN check_violation OR raise_exception OR insufficient_privilege THEN
            IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF;
    END;

    -- 5b: SELECT -> none_user nevidí žiadny riadok (RLS finance.view).
    SELECT count(*) INTO v_seen FROM public.finance_transaction_attachments;
    IF v_seen <> 0 THEN
        RAISE EXCEPTION 'TEST FAILED [5b]: none_user vidí % riadkov príloh (očakávané 0)', v_seen;
    END IF;

    RAISE NOTICE 'PASS [5]: none_user nemôže zapisovať ani vidieť prílohy';
END $$;

-- ===========================================================================
-- 6. AUDIT — presne JEDEN záznam na operáciu, identita = auth.uid()
--    Guard (BEFORE) + audit trigger (AFTER): zamietnutá operácia nezanechá
--    žiadny auditný záznam; úspešná vznikne presne raz.
-- ===========================================================================
RESET ROLE;

DO $$
DECLARE
    v_att   uuid;
    v_total integer;
BEGIN
    SELECT att INTO v_att FROM _k1323_att2;

    SELECT count(*) INTO v_total
    FROM public.audit_log
    WHERE entity_type = 'finance_transaction_attachments'
      AND entity_id   = v_att;

    IF v_total <> 1 THEN
        RAISE EXCEPTION
            'TEST FAILED [6a]: % auditných záznamov pre JEDNU prílohu (očakávané 1 — žiadne duplikáty)',
            v_total;
    END IF;

    RAISE NOTICE 'PASS [6a]: audit CREATE existuje presne raz, entita=%', v_att;
END $$;

-- 6b: identita autora v audit_log zodpovedá auth.uid(), nie podvrhnutému 9999.
DO $$
DECLARE
    v_att uuid;
    v_uid uuid;
BEGIN
    SELECT att INTO v_att FROM _k1323_att2;

    SELECT user_id INTO v_uid
    FROM public.audit_log
    WHERE entity_type = 'finance_transaction_attachments'
      AND entity_id   = v_att;

    IF v_uid IS DISTINCT FROM '33333333-3333-3333-3333-333333333333' THEN
        RAISE EXCEPTION 'TEST FAILED [6b]: audit_log.user_id=% (očakávané 3333...)', v_uid;
    END IF;

    RAISE NOTICE 'PASS [6b]: audit_log.user_id = auth.uid() (3333...), nie podvrhnutá identita';
END $$;

-- 6c: DELETE cez edit_user (4444) -> audit DELETE presne raz.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

DO $$
DECLARE
    v_att uuid;
BEGIN
    SELECT att INTO v_att FROM _k1323_att2;
    DELETE FROM public.finance_transaction_attachments WHERE id = v_att;
    RAISE NOTICE 'PASS [6c-prep]: DELETE metadat prešiel pre edit_user (4444...)';
END $$;

RESET ROLE;

DO $$
DECLARE
    v_att uuid;
    v_del integer;
BEGIN
    SELECT att INTO v_att FROM _k1323_att2;

    SELECT count(*) INTO v_del
    FROM public.audit_log
    WHERE entity_type = 'finance_transaction_attachments'
      AND entity_id   = v_att
      AND action LIKE '%DELETE%';

    IF v_del <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED [6c]: % auditných DELETE záznamov (očakávané 1)', v_del;
    END IF;

    RAISE NOTICE 'PASS [6c]: audit DELETE existuje presne raz';
END $$;

-- ===========================================================================
-- 7. DRAFT-ONLY pri DELETE — príloha POSTED transakcie sa nedá zmazať
--
--    POSTUP (dvoj-krokový, NEMOŽNO skrátiť):
--      a) vytvoríme prílohu, kým je transakcia ešte DRAFT — guard to povoľuje,
--      b) AZ POTOM transakciu zaúčtujeme (DRAFT -> POSTED),
--      c) pokus o DELETE prílohy musí byť zamietnutý.
--
--    Príkaz `INSERT ... WHERE transaction_id = <POSTED>` by priamo padol:
--    guard `finance_guard_attachments` (20261021) vyžaduje, aby rodicovská
--    transakcia bola DRAFT — teda „prílohu k POSTED transakcii“ jednoducho
--    nevytvoríš. Presne to je invariant, ktorý tento scenár overuje, takže
--    fixture ho musí obísť dátovou cestou, nie porušiť.
-- ===========================================================================
RESET ROLE;
-- Identita edit_user (4444...) — potrebná pre zaúčtovanie transakcie v kroku b),
-- pretoze `finance_guard_transactions()` pri DRAFT -> POSTED požaduje finance.edit.
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

DO $$
DECLARE
    v_tx     uuid := 'eeeeeeee-0000-0000-0000-000000000003';
    v_att    uuid;
BEGIN
    -- (a) Príloha k ešte DRAFT transakcii — guard to povoľuje.
    INSERT INTO public.finance_transaction_attachments
        (transaction_id, storage_path, file_name, uploaded_by)
    VALUES (v_tx, v_tx::text || '/faktura-posted.pdf', 'faktura-posted.pdf',
            '44444444-4444-4444-4444-444444444444')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_att;

    IF v_att IS NULL THEN
        SELECT id INTO v_att FROM public.finance_transaction_attachments
        WHERE transaction_id = v_tx
          AND storage_path   = v_tx::text || '/faktura-posted.pdf';
    END IF;

    -- (b) Zaúčtovanie transakcie: DRAFT -> POSTED.
    UPDATE public.finance_transactions
    SET status    = 'POSTED',
        posted_at = NOW(),
        posted_by = '44444444-4444-4444-4444-444444444444'
    WHERE id = v_tx AND status = 'DRAFT';

    CREATE TEMP TABLE IF NOT EXISTS _k1323_att7 (att uuid);
    DELETE FROM _k1323_att7;
    INSERT INTO _k1323_att7 (att) VALUES (v_att);

    RAISE NOTICE 'PASS [7-prep]: príloha=% vytvorená pri DRAFT, transakcia=% zaúčtovaná na POSTED', v_att, v_tx;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

DO $$
DECLARE
    v_att  uuid;
    v_left integer;
BEGIN
    SELECT att INTO v_att FROM _k1323_att7;

    BEGIN
        DELETE FROM public.finance_transaction_attachments WHERE id = v_att;
        RAISE EXCEPTION 'TEST FAILED [7]: mazanie prílohy POSTED transakcie prešlo';
    EXCEPTION
        WHEN check_violation OR raise_exception THEN
            IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF;
    END;

    SELECT count(*) INTO v_left FROM public.finance_transaction_attachments WHERE id = v_att;
    IF v_left <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED [7]: riadok prílohy POSTED tx zmizol (%)', v_left;
    END IF;

    RAISE NOTICE 'PASS [7]: DELETE metadat prílohy POSTED transakcie zamietnutý (riadok zachovaný)';
END $$;

RESET ROLE;

-- ===========================================================================
-- 8. STORAGE — bucket `finance_documents` musí byť PRIVÁTNY
--    (Storage RLS scenáre kryje supabase/tests/k13_finance_runtime_test.sql)
-- ===========================================================================
DO $$
DECLARE
    v_public boolean;
BEGIN
    SELECT public INTO v_public FROM storage.buckets WHERE id = 'finance_documents';

    IF v_public IS NULL THEN
        RAISE EXCEPTION 'TEST FAILED [8]: bucket finance_documents neexistuje';
    END IF;
    IF v_public THEN
        RAISE EXCEPTION 'TEST FAILED [8]: bucket finance_documents je PUBLIC (musí byť private)';
    END IF;

    RAISE NOTICE 'PASS [8]: bucket finance_documents je privátny (public = false)';
END $$;

ROLLBACK;

-- ============================================================================
-- END OF k1323_finance_attachments_guard_test.sql
--
-- STAV V TOMTO REPOZITÁRE: PRIPRAVENÉ, ALE NESPÚŠŤANÉ (RUNTIME = BLOCKED) —
-- autorizovaná vývojová Supabase DB nebola v session dostupná. Tieto testy
-- NESMÚ byť označené PASS, kým sa reálne nevykonajú.
-- ============================================================================



