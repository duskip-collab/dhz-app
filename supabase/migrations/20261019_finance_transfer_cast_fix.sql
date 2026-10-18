-- ============================================================================
-- Migration: K13 HOTFIX – finance_create_transfer() enum cast (SQLSTATE 42804)
-- Date: 20261019
-- Purpose: Oprava runtime chyby
--            ERROR 42804: column "status" is of type finance_transaction_status
--                         but expression is of type text
--          v funkcii public.finance_create_transfer(...).
--
-- PRÍČINA (potvrdené):
--   Stĺpec finance_transactions.status je ENUM public.finance_transaction_status.
--   Výraz
--       CASE WHEN p_post THEN 'POSTED' ELSE 'DRAFT' END
--   má odvodený typ text (CASE nedokáže odvodzť enum), pričom INSERT do enum
--   stĺpca neakceptuje text bez explicitného castu. Holý reťazec ('POSTED') je
--   priamo priraditeľný na enum, ale výsledok CASE už nie.
--
-- RIEŠENIE:
--   Celý CASE výraz explicitne pretypujeme na enum:
--       (CASE WHEN p_post THEN 'POSTED' ELSE 'DRAFT' END)
--           ::public.finance_transaction_status
--   Obe nohy prevodu používajú identický, bezpečný cast. Zvyšok logiky funkcie
--   (validácia účtov, oprávnenia finance.create/finance.edit, atomické vloženie
--   oboch nôh so spoločným transfer_group_id) zostáva nezmenený.
--
-- IDEMPOTENCIA / NASADENIE:
--   CREATE OR REPLACE FUNCTION prepíše rozbitú verziu na existujúcej DB bez
--   straty dát. Nemení oprávnenia, roly ani schému tabuliek.
--   (Aplikovanú migráciu 20261015 neupravujeme – táto hotfix ju dopĺňa.)
--
-- Predpoklad: migrácie 20261006 (core) a 20261015 (finance) sú aplikované.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finance_create_transfer(
    p_from_account_id uuid,
    p_to_account_id   uuid,
    p_amount_minor    bigint,
    p_transaction_date date,
    p_description     text DEFAULT NULL,
    p_document_number text DEFAULT NULL,
    p_post            boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_group uuid := gen_random_uuid();
    -- Status nôh je ENUM – počítame ho raz a používame v oboch INSERToch.
    v_status public.finance_transaction_status;
BEGIN
    IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
        RAISE EXCEPTION 'Transfer amount must be a positive number of minor units';
    END IF;

    IF p_from_account_id = p_to_account_id THEN
        RAISE EXCEPTION 'Transfer source and destination accounts must differ';
    END IF;

    -- Ensure both accounts exist and are active.
    IF NOT EXISTS (
        SELECT 1 FROM public.finance_accounts
        WHERE id = p_from_account_id AND is_active
    ) THEN
        RAISE EXCEPTION 'Source account does not exist or is inactive';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.finance_accounts
        WHERE id = p_to_account_id AND is_active
    ) THEN
        RAISE EXCEPTION 'Destination account does not exist or is inactive';
    END IF;

    -- Permission: creating needs finance.create; posting needs finance.edit.
    IF NOT public.has_permission(v_uid, 'finance.create') THEN
        RAISE EXCEPTION 'Creating a transfer requires finance.create permission';
    END IF;

    IF p_post AND NOT public.has_permission(v_uid, 'finance.edit') THEN
        RAISE EXCEPTION 'Posting a transfer requires finance.edit permission';
    END IF;

    -- Odvodíme enum status nôh (bezpečný cast výsledku CASE na enum).
    v_status := (CASE WHEN p_post THEN 'POSTED' ELSE 'DRAFT' END)
        ::public.finance_transaction_status;

    -- Leg 1: money leaves the source account.
    INSERT INTO public.finance_transactions (
        account_id, type, status, amount_minor, transaction_date,
        document_number, description, transfer_group_id,
        posted_at, posted_by, created_by, updated_by
    ) VALUES (
        p_from_account_id, 'TRANSFER_OUT', v_status,
        p_amount_minor, p_transaction_date,
        p_document_number, p_description, v_group,
        CASE WHEN p_post THEN NOW() ELSE NULL END,
        CASE WHEN p_post THEN v_uid ELSE NULL END,
        v_uid, v_uid
    );

    -- Leg 2: money enters the destination account.
    INSERT INTO public.finance_transactions (
        account_id, type, status, amount_minor, transaction_date,
        document_number, description, transfer_group_id,
        posted_at, posted_by, created_by, updated_by
    ) VALUES (
        p_to_account_id, 'TRANSFER_IN', v_status,
        p_amount_minor, p_transaction_date,
        p_document_number, p_description, v_group,
        CASE WHEN p_post THEN NOW() ELSE NULL END,
        CASE WHEN p_post THEN v_uid ELSE NULL END,
        v_uid, v_uid
    );

    RETURN v_group;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_create_transfer(uuid, uuid, bigint, date, text, text, boolean)
    FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_create_transfer(uuid, uuid, bigint, date, text, text, boolean)
    TO authenticated, service_role;

-- ============================================================================
-- END OF MIGRATION 20261019_finance_transfer_cast_fix.sql
-- ============================================================================
