-- ============================================================================
-- Migration: K13.2.3 — Finance attachments identity + path-binding hardening
-- Date: 20261020
-- Purpose: Zatvorenie dvoch medzier, ktoré sa nedajú vyriešiť iba v
--          serverových akciách (K13.2.3 security review):
--
--   1. IDENTITA AUTORA (`uploaded_by`)
--      `public.finance_transaction_attachments.uploaded_by` nebola nútená
--      ničím — jediný existujúci guard trigger (`finance_guard_transactions`)
--      je napojený IBA na `finance_transactions`. Klient s `finance.create`
--      tak mohol cez priamy PostgREST zápis podvrhnúť `uploaded_by` na cudziu
--      identitu, prípadne ho nechať NULL.
--      RIEŠENIE: BEFORE INSERT/UPDATE trigger, ktorý pri existujúcom
--      `auth.uid()` vždy PREPÍŠE `NEW.uploaded_by := auth.uid()`.
--      Kontexty bez `auth.uid()` (service_role, migrácie, backend joby) si
--      držia explicitne zadanú hodnotu — rovnaký princíp ako v
--      `finance_guard_transactions()`.
--
--   2. VÄZBA CESTY NA TRANSAKCIU (`storage_path` <-> `transaction_id`)
--      Storage RLS z migrácie 20261017 viaže objekt na transakciu pomocou
--      KONVENCIE cesty, no metadata tabuľka to nevynucovala. Riadok s
--      `transaction_id = A` a `storage_path = 'B/...'` bol teda možné zapísať.
--      RIEŠENIE: ten istý trigger overí, že prvý segment `storage_path`
--      je UUID a zhoduje sa s `transaction_id` (pomocou existujúcej
--      `public.finance_attachment_tx_id()` z 20261017) a že
--      rodicovská transakcia EXISTUJE a je v stave DRAFT.
--
-- Čo táto migrácia NEROBÍ (vedomé obmedzenia):
--   * Nemení oprávnenia, roly ani katalóg permissions (len dopĺňa existujúci
--     O5 model finance.view / finance.create / finance.edit).
--   * Nemení schému tabuliek ani existujúcu auditnú schému.
--   * NEPRIDÁVA auditné záznamy — audit INSERT/DELETE príloh už robí
--     existujúci trigger `finance_attachments_audit_trigger`
--     (migrácie 20261015 / 20261018) cez `audit_finance_changes()`.
--     Duplikovanie by zdvojalo záznamy.
--   * NEPRIDÁVA audit Storage operácií — Storage nie je auditovatelný
--     existujúcim `audit_log` triggerom bez novej schémy. Presná medzera
--     je zdokumentovaná v K13.2.3 completion reporte.
--
-- IDEMPOTENCIA: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS / CREATE.
-- NEDESTRUKTIVNÉ: neupravuje spätne žiadnu už aplikovanú migráciu.

-- ============================================================================
-- 1. GUARD: identita autora + väzba cesty + DRAFT-only pre metadata príloh
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
        -- Mazanie metadat vyžaduje finance.edit (zrkadlí finance_attach_delete).
        IF NOT public.has_permission(v_uid, 'finance.edit') THEN
            RAISE EXCEPTION
                'Deleting an attachment requires finance.edit permission';
        END IF;

        -- Rodicovská transakcia musí byť DRAFT. Ak transakcia už neexistuje
        -- (kaskádový DELETE z finance_transactions), nič nekontrolujeme.
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
    -- 1) Oprávnenie podľa operácie.
    IF TG_OP = 'INSERT' THEN
        IF NOT public.has_permission(v_uid, 'finance.create') THEN
            RAISE EXCEPTION
                'Creating an attachment requires finance.create permission';
        END IF;
    ELSE
        IF NOT public.has_permission(v_uid, 'finance.edit') THEN
            RAISE EXCEPTION
                'Modifying an attachment requires finance.edit permission';
        END IF;
        -- Väzba na transakciu je nemenná.
        IF NEW.transaction_id <> OLD.transaction_id THEN
            RAISE EXCEPTION 'An attachment cannot be moved to another transaction';
        END IF;
    END IF;

    -- 2) Identita autora sa NEDÁ podvrhnúť. Pri overenom auth.uid() ju
    --    vždy prepíšeme; bez neho (service_role) necháme danú hodnotu.
    IF v_uid IS NOT NULL THEN
        NEW.uploaded_by := v_uid;
    END IF;

    -- 3) Väzba cesty: prvý segment storage_path MUSÍ byť transaction_id.
    --    Používame existujúci helper z migrácie 20261017.
    v_tx_id := public.finance_attachment_tx_id(NEW.storage_path);
    IF v_tx_id IS NULL OR v_tx_id <> NEW.transaction_id THEN
        RAISE EXCEPTION
            'storage_path must start with the attachment transaction_id'
            USING HINT = 'Expected format: <transaction_id>/<file_name>';
    END IF;

    -- 4) Rodicovská transakcia musí EXISTOVAŤ a byť DRAFT (prílohy sa
    --    prikladajú len k nezaúčtovaným transakciám — zhodné so Storage RLS
    --    `can_upload_finance_attachment` / `can_modify_finance_attachment`).
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
-- POZNÁMKY K ODPADU / KONZISTENCIÍ
-- ============================================================================
-- * Tento guard je BEFORE trigger, takže beží ešte PRED auditným AFTER
--   triggerom `finance_attachments_audit_trigger`. Zamietnutá operácia teda
--   nezanechá žiadny auditný záznam (žiadny falošný „úspech“).
-- * Migrácia NEZAUJÍMA existujúce riadky. Ak by v produkčných dátach už bol
--   riadok s nesúladom cesty alebo NULL `uploaded_by`, zostáva nezmenený —
--   oprava histórie je vedená samostatne a NIE je súčasťou tejto migrácie.
-- * Kaskádový DELETE transakcie (ON DELETE CASCADE) prechádza týmto
--   triggerom; vtedy `v_status IS NULL`, čo je vedomé povolenie.
-- ============================================================================

-- ============================================================================
-- END OF MIGRATION 20261020_finance_attachments_guard.sql
-- ============================================================================

