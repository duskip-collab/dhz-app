-- ============================================================================
-- K13.2.4 — DIAGNOSTICKÉ (READ-ONLY) DOTAZY pre finance_transaction_attachments
-- Date: 20261021
-- Purpose: Identifikácia historických záznamov, ktoré by po aplikácii migrácie
--          20261020/20261021 mohli porušovať invarianty:
--            * zlá väzba cesty (storage_path nezodpovedá transaction_id),
--            * NULL `uploaded_by` (neznáma identita autora),
--            * rodicovská transakcia neexistuje (orphan),
--            * príloha pripojená k POSTED/VOID transakcii (porušuje DRAFT-only).
--
-- *** TENTO SÚBOR NIČ NEMENÍ. ***
-- Iba SELECT / COUNT. Žiadny INSERT/UPDATE/DELETE/ALTER.
-- Automatická oprava histórie je ZAMYSLENE VYLÚČENÁ — pozri poznámku na konci.
--
-- AKO SPÚŠŤAŤ:
--   V Supabase SQL editore alebo psql. Bezpecné spustiť aj na produkcii,
--   je to cisté citanie. Nevyžaduje transakciu ani ROLLBACK.
--
-- Predpoklad: migrácie 20261006, 20261015 (tabuľka), 20261017
--             (`finance_attachment_tx_id` helper).
-- ============================================================================

-- D0. PREHŁAD — koľko riadkov celkom a koľko z nich je „problematických“.
--      Ocakávany zdravý stav: vsetky počty = 0.
-- ---------------------------------------------------------------------------
WITH evaluated AS (
    SELECT
        a.id,
        a.transaction_id,
        a.storage_path,
        a.uploaded_by,
        a.uploaded_at,
        -- Prvý segment cesty (zrkadlí public.finance_attachment_tx_id()).
        split_part(a.storage_path, '/', 1)                     AS path_prefix,
        (t.id IS NOT NULL)                                     AS tx_exists,
        t.status::text                                         AS tx_status
    FROM public.finance_transaction_attachments a
    LEFT JOIN public.finance_transactions t ON t.id = a.transaction_id
)
SELECT
    count(*)                                                     AS total_rows,
    count(*) FILTER (WHERE uploaded_by IS NULL)                 AS null_uploaded_by,
    count(*) FILTER (WHERE NOT tx_exists)                       AS orphan_no_tx,
    count(*) FILTER (WHERE tx_status IS NOT NULL
                       AND tx_status <> 'DRAFT')                AS attached_to_non_draft,
    -- Zlá väzba cesty: prefix nie je UUID, alebo nezodpovedá transaction_id.
    count(*) FILTER (WHERE path_prefix !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       OR lower(path_prefix) <> lower(transaction_id::text))
                                                                 AS bad_path_binding,
    count(*) FILTER (WHERE storage_path IS NULL OR storage_path = '')
                                                                 AS empty_storage_path
FROM evaluated;

-- D1. DETAIL — iba problematické riadky (pre manuálny review).
--      Ak vráti 0 riadkov, história je konzistentná.
-- ---------------------------------------------------------------------------
SELECT
    a.id,
    a.transaction_id,
    a.storage_path,
    split_part(a.storage_path, '/', 1)                 AS path_prefix,
    a.file_name,
    a.mime_type,
    a.file_size_bytes,
    a.uploaded_by,
    a.uploaded_at,
    t.status::text                                     AS tx_status,
    (t.id IS NULL)                                     AS orphan_no_tx,
    (a.uploaded_by IS NULL)                            AS missing_author,
    (split_part(a.storage_path, '/', 1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR lower(split_part(a.storage_path, '/', 1)) <> lower(a.transaction_id::text))
                                                       AS bad_path_binding
FROM public.finance_transaction_attachments a
LEFT JOIN public.finance_transactions t ON t.id = a.transaction_id
WHERE a.uploaded_by IS NULL
   OR t.id IS NULL
   OR t.status IS DISTINCT FROM 'DRAFT'
   OR split_part(a.storage_path, '/', 1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR lower(split_part(a.storage_path, '/', 1)) <> lower(a.transaction_id::text)
ORDER BY a.uploaded_at DESC;

-- ---------------------------------------------------------------------------
-- D2. ODPORÚČANIE NA ZÁKLAD VÝSLEDKU
-- ---------------------------------------------------------------------------
--  total_rows             = 0  -> tabulka je prázdna; migrácia je bezriziková.
--  vsetky ostatne pocity  = 0  -> historia je konzistentna; migracia prejde.
--
--  null_uploaded_by      > 0   -> autorska identita je neznama. Migracia
--                                 NEOBSPLUVA existujuce riadky (len nove), takze
--                                 aplikacia prejde. Na doplnenie identity treba
--                                 SAMOSTATNU rozhodnutu migraciu (nie automaticky:
--                                 nie je mozne spatne dedukovat, kto nahral).
--
--  bad_path_binding      > 0   -> riadok ma storage_path z inej transakcie.
--                                 Aplikacia migracie PREJDE (nove riadky sa
--                                 nekontroluju), no taky riadok sa uz neda
--                                 UPDATE (trigger by ho zamietol). Vyzaduje
--                                 manualny review pred/po aplikacii.
--
--  orphan_no_tx          > 0   -> FK by nemal dovolit (ON DELETE CASCADE);
--                                 ak sa vyskytuje, datovy model je poruseny.
--
--  attached_to_non_draft > 0   -> priloha existuje pri POSTED/VOID transakcii.
--                                 Legitimny stav pre historii (pred DRAFT-only
--                                 hardeningom). Migracia prejde, ale DELETE
--                                 takeho riadku bude zamietnuty — co je
--                                 zamyslane spravanie (chranena zaucetovana
--                                 historia). Zvazit, ci je to pozadovane.
--
--  *** ZAMYSLENE NIE JE ZIADNA AUTOMATICKA OPRAVA. ***
--  Akukolvek upravu historie treba riesit samostatnou, vedome schvalenou
--  migraciou s vlastnym auditnym zaznamom — nie ako sucast tejto.
-- ============================================================================

-- END OF DIAGNOSTICS (READ-ONLY)


