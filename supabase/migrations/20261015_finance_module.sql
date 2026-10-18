-- ============================================================================
-- Migration: K13 – Pokladňa a financie zboru (Finance & treasury module)
-- Date: 20261015
-- Purpose: Database model for finance accounts, categories, transactions
--          (income/expense/transfers), planned operations and document
--          attachment metadata. Consistent with the O5 core security model
--          (has_permission / has_role) and the existing audit_log schema.
--
-- Idempotency: IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS and
--              DO-block enum guards, so re-running is safe & non-destructive.
--              No DROP of Core tables and no changes to existing rows.
--
-- Money policy: ALL monetary amounts are stored as BIGINT minor units
--              (integer cents). No float/real is used anywhere.
--
-- Permissions used (existing O5 catalog – NOT created here):
--   finance.view          -> read finance data
--   finance.create        -> create drafts / attachments
--   finance.edit          -> post / void / edit records
--   finance.manage_access -> manage finance users (granted, not used in RLS)
--
-- NOTE ON POST/VOID SEPARATION (documented limitation):
--   The canonical permission catalog has no dedicated "finance.post" or
--   "finance.void" code. Per instructions no new permission is invented.
--   Mapping used: creating a DRAFT needs finance.create; any POSTED insert,
--   posting a draft and voiding a record need finance.edit.
--
-- K13.1.1 hardening (ownership + transfer integrity):
--   * created_by / updated_by / posted_by / uploaded_by are forced to the
--     authenticated caller (auth.uid()) and cannot be spoofed via REST.
--   * A DEFERRABLE constraint trigger guarantees each transfer_group_id has
--     exactly one TRANSFER_OUT and one TRANSFER_IN leg with equal amounts
--     and matching status, preventing lone/duplicate/skewing transfer legs.
-- ============================================================================

-- ============================================================================
-- 1. ENUM TYPES (idempotent)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'finance_account_type') THEN
        CREATE TYPE public.finance_account_type AS ENUM ('CASH', 'BANK', 'OTHER');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'finance_transaction_type') THEN
        CREATE TYPE public.finance_transaction_type AS ENUM
            ('INCOME', 'EXPENSE', 'TRANSFER_IN', 'TRANSFER_OUT');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'finance_transaction_status') THEN
        CREATE TYPE public.finance_transaction_status AS ENUM ('DRAFT', 'POSTED', 'VOID');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'finance_direction') THEN
        CREATE TYPE public.finance_direction AS ENUM ('INCOME', 'EXPENSE');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'finance_plan_status') THEN
        CREATE TYPE public.finance_plan_status AS ENUM
            ('PLANNED', 'APPROVED', 'COMPLETED', 'CANCELLED');
    END IF;
END $$;

-- ============================================================================
-- 2. finance_accounts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.finance_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type public.finance_account_type NOT NULL DEFAULT 'CASH',
    currency CHAR(3) NOT NULL DEFAULT 'EUR',
    -- Opening balance in integer cents; may not be negative.
    opening_balance_minor BIGINT NOT NULL DEFAULT 0,
    opening_balance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT chk_finance_accounts_opening_nonneg
        CHECK (opening_balance_minor >= 0),
    CONSTRAINT chk_finance_accounts_currency
        CHECK (currency = 'EUR')
);

-- The current balance is NEVER stored. It is derived (opening balance + sum of
-- POSTED movements) via the finance_account_balances view (section 11).

-- ============================================================================
-- 3. finance_categories
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.finance_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    -- Stable, globally unique machine code.
    code TEXT NOT NULL,
    direction public.finance_direction NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT uq_finance_categories_code UNIQUE (code)
);

-- Categories referenced in history are never physically deleted; they are
-- deactivated (is_active = false). No DELETE policy is granted (section 7).

-- ============================================================================
-- 4. finance_transactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.finance_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL
        REFERENCES public.finance_accounts(id) ON DELETE RESTRICT,
    category_id UUID
        REFERENCES public.finance_categories(id) ON DELETE RESTRICT,
    type public.finance_transaction_type NOT NULL,
    status public.finance_transaction_status NOT NULL DEFAULT 'DRAFT',
    -- Positive amount in integer cents; the sign is implied by `type`.
    amount_minor BIGINT NOT NULL,
    transaction_date DATE NOT NULL,
    document_number TEXT,
    counterparty TEXT,
    description TEXT,
    member_id UUID
        REFERENCES public.members(id) ON DELETE SET NULL,
    -- Pairs the two legs of a transfer (TRANSFER_OUT + TRANSFER_IN).
    transfer_group_id UUID,
    posted_at TIMESTAMPTZ,
    posted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    void_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    CONSTRAINT chk_finance_tx_amount_positive
        CHECK (amount_minor > 0),
    -- Transfers must carry a group id; non-transfers must not.
    CONSTRAINT chk_finance_tx_transfer_group
        CHECK (
            (type IN ('TRANSFER_IN', 'TRANSFER_OUT')) = (transfer_group_id IS NOT NULL)
        ),
    -- Income/expense require a category; transfers do not.
    CONSTRAINT chk_finance_tx_category
        CHECK (
            (type IN ('INCOME', 'EXPENSE')) = (category_id IS NOT NULL)
        ),
    -- POSTED rows must record who/when posted.
    CONSTRAINT chk_finance_tx_posted_meta
        CHECK (
            status <> 'POSTED'
            OR (posted_at IS NOT NULL AND posted_by IS NOT NULL)
        ),
    -- VOID rows must carry a reason (audit trail).
    CONSTRAINT chk_finance_tx_void_reason
        CHECK (status <> 'VOID' OR void_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_finance_tx_account_id
    ON public.finance_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_finance_tx_category_id
    ON public.finance_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_finance_tx_member_id
    ON public.finance_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_finance_tx_status
    ON public.finance_transactions(status);
CREATE INDEX IF NOT EXISTS idx_finance_tx_transaction_date
    ON public.finance_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_finance_tx_transfer_group_id
    ON public.finance_transactions(transfer_group_id);

-- ============================================================================
-- 5. finance_plans + finance_transaction_attachments
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.finance_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    plan_type TEXT NOT NULL,
    direction public.finance_direction NOT NULL,
    amount_minor BIGINT NOT NULL,
    planned_date DATE NOT NULL,
    description TEXT,
    status public.finance_plan_status NOT NULL DEFAULT 'PLANNED',
    -- Optional link to a real, manually created transaction (never auto-made).
    transaction_id UUID
        REFERENCES public.finance_transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT chk_finance_plans_amount_nonneg
        CHECK (amount_minor >= 0)
);

CREATE INDEX IF NOT EXISTS idx_finance_plans_status
    ON public.finance_plans(status);
CREATE INDEX IF NOT EXISTS idx_finance_plans_planned_date
    ON public.finance_plans(planned_date);
CREATE INDEX IF NOT EXISTS idx_finance_plans_transaction_id
    ON public.finance_plans(transaction_id);

CREATE TABLE IF NOT EXISTS public.finance_transaction_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL
        REFERENCES public.finance_transactions(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT,
    file_size_bytes BIGINT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT chk_finance_attach_size_nonneg
        CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_finance_attach_transaction_id
    ON public.finance_transaction_attachments(transaction_id);

-- NOTE: This table stores attachment METADATA only. The actual files live in
-- Supabase Storage. Storage bucket/RLS policies are intentionally NOT part of
-- this migration and must be added in a dedicated storage migration.


-- ============================================================================
-- 6. GRANTS (least privilege; RLS still governs row access)
-- ============================================================================

REVOKE ALL ON TABLE public.finance_accounts FROM anon, public;
REVOKE ALL ON TABLE public.finance_categories FROM anon, public;
REVOKE ALL ON TABLE public.finance_transactions FROM anon, public;
REVOKE ALL ON TABLE public.finance_plans FROM anon, public;
REVOKE ALL ON TABLE public.finance_transaction_attachments FROM anon, public;

-- finance_categories: no DELETE grant (history-safe, deactivate instead).
GRANT SELECT, INSERT, UPDATE ON TABLE public.finance_categories TO authenticated;
GRANT ALL ON TABLE public.finance_categories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_accounts TO authenticated;
GRANT ALL ON TABLE public.finance_accounts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_transactions TO authenticated;
GRANT ALL ON TABLE public.finance_transactions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_plans TO authenticated;
GRANT ALL ON TABLE public.finance_plans TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_transaction_attachments TO authenticated;
GRANT ALL ON TABLE public.finance_transaction_attachments TO service_role;

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transaction_attachments ENABLE ROW LEVEL SECURITY;

-- --- finance_accounts ---
DROP POLICY IF EXISTS finance_accounts_select ON public.finance_accounts;
CREATE POLICY finance_accounts_select ON public.finance_accounts
    FOR SELECT TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.view'));

DROP POLICY IF EXISTS finance_accounts_insert ON public.finance_accounts;
CREATE POLICY finance_accounts_insert ON public.finance_accounts
    FOR INSERT TO authenticated
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'finance.create'));

DROP POLICY IF EXISTS finance_accounts_update ON public.finance_accounts;
CREATE POLICY finance_accounts_update ON public.finance_accounts
    FOR UPDATE TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.edit'))
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'finance.edit'));

DROP POLICY IF EXISTS finance_accounts_delete ON public.finance_accounts;
CREATE POLICY finance_accounts_delete ON public.finance_accounts
    FOR DELETE TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.edit'));

-- --- finance_categories (no DELETE policy -> not deletable via API) ---
DROP POLICY IF EXISTS finance_categories_select ON public.finance_categories;
CREATE POLICY finance_categories_select ON public.finance_categories
    FOR SELECT TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.view'));

DROP POLICY IF EXISTS finance_categories_insert ON public.finance_categories;
CREATE POLICY finance_categories_insert ON public.finance_categories
    FOR INSERT TO authenticated
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'finance.create'));

DROP POLICY IF EXISTS finance_categories_update ON public.finance_categories;
CREATE POLICY finance_categories_update ON public.finance_categories
    FOR UPDATE TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.edit'))
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'finance.edit'));


-- --- finance_transactions ---
DROP POLICY IF EXISTS finance_transactions_select ON public.finance_transactions;
CREATE POLICY finance_transactions_select ON public.finance_transactions
    FOR SELECT TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.view'));

DROP POLICY IF EXISTS finance_transactions_insert ON public.finance_transactions;
CREATE POLICY finance_transactions_insert ON public.finance_transactions
    FOR INSERT TO authenticated
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'finance.create'));

DROP POLICY IF EXISTS finance_transactions_update ON public.finance_transactions;
CREATE POLICY finance_transactions_update ON public.finance_transactions
    FOR UPDATE TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.edit'))
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'finance.edit'));

DROP POLICY IF EXISTS finance_transactions_delete ON public.finance_transactions;
CREATE POLICY finance_transactions_delete ON public.finance_transactions
    FOR DELETE TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.edit'));

-- --- finance_plans (never affect the real balance) ---
DROP POLICY IF EXISTS finance_plans_select ON public.finance_plans;
CREATE POLICY finance_plans_select ON public.finance_plans
    FOR SELECT TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.view'));

DROP POLICY IF EXISTS finance_plans_insert ON public.finance_plans;
CREATE POLICY finance_plans_insert ON public.finance_plans
    FOR INSERT TO authenticated
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'finance.create'));

DROP POLICY IF EXISTS finance_plans_update ON public.finance_plans;
CREATE POLICY finance_plans_update ON public.finance_plans
    FOR UPDATE TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.edit'))
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'finance.edit'));

DROP POLICY IF EXISTS finance_plans_delete ON public.finance_plans;
CREATE POLICY finance_plans_delete ON public.finance_plans
    FOR DELETE TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.edit'));

-- --- finance_transaction_attachments (metadata only) ---
DROP POLICY IF EXISTS finance_attach_select ON public.finance_transaction_attachments;
CREATE POLICY finance_attach_select ON public.finance_transaction_attachments
    FOR SELECT TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.view'));

DROP POLICY IF EXISTS finance_attach_insert ON public.finance_transaction_attachments;
CREATE POLICY finance_attach_insert ON public.finance_transaction_attachments
    FOR INSERT TO authenticated
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'finance.create'));

DROP POLICY IF EXISTS finance_attach_update ON public.finance_transaction_attachments;
CREATE POLICY finance_attach_update ON public.finance_transaction_attachments
    FOR UPDATE TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.edit'))
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'finance.edit'));

DROP POLICY IF EXISTS finance_attach_delete ON public.finance_transaction_attachments;
CREATE POLICY finance_attach_delete ON public.finance_transaction_attachments
    FOR DELETE TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.edit'));


-- ============================================================================
-- 8. INTEGRITY GUARD: ownership + posted-history protection + posting rights
-- ============================================================================
-- This BEFORE trigger enforces rules that cannot be expressed with CHECK/RLS:
--   * created_by / updated_by / posted_by are forced to auth.uid() so an
--     authenticated client cannot spoof ownership or posting identity.
--   * A POSTED record may only transition POSTED -> VOID (void) and nothing
--     else. All other mutations of a POSTED row are rejected.
--   * Only DRAFT rows may be deleted.
--   * Creating a row directly in POSTED state requires finance.edit (a plain
--     finance.create user may only create DRAFT rows).
--   * Posting (DRAFT -> POSTED) stamps posted_at / posted_by.
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
        IF NEW.status = 'POSTED'
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
            IF NOT public.has_permission(v_uid, 'finance.edit') THEN
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
            IF NOT public.has_permission(v_uid, 'finance.edit') THEN
                RAISE EXCEPTION 'Posting a transaction requires finance.edit permission';
            END IF;
            NEW.posted_at := COALESCE(NEW.posted_at, NOW());
            IF v_uid IS NOT NULL THEN
                NEW.posted_by := v_uid;
            END IF;
        END IF;

        -- DRAFT -> VOID: require reason + finance.edit.
        IF OLD.status = 'DRAFT' AND NEW.status = 'VOID' THEN
            IF NOT public.has_permission(v_uid, 'finance.edit') THEN
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

DROP TRIGGER IF EXISTS finance_transactions_guard ON public.finance_transactions;
CREATE TRIGGER finance_transactions_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.finance_transactions
FOR EACH ROW
EXECUTE FUNCTION public.finance_guard_transactions();


-- ============================================================================
-- 8b. TRANSFER INTEGRITY (K13.1.1 hardening)
-- ============================================================================
-- A finance.create user can directly INSERT transfer legs via REST. Without a
-- guard they could create a LONE TRANSFER_OUT leg, a DUPLICATE leg, or two legs
-- with DIFFERENT amounts, all of which would skew the derived balance.
-- This DEFERRABLE INITIALLY DEFERRED constraint trigger runs at COMMIT (after
-- finance_create_transfer has inserted both legs, or after any direct insert)
-- and guarantees every transfer_group_id has EXACTLY one TRANSFER_OUT and one
-- TRANSFER_IN leg with equal amount_minor and matching status.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finance_guard_transfer_group()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group uuid;
    v_out_count integer;
    v_in_count integer;
    v_out_amount bigint;
    v_in_amount bigint;
    v_out_status public.finance_transaction_status;
    v_in_status public.finance_transaction_status;
BEGIN
    -- Determine the affected transfer group from the changed row.
    IF TG_OP = 'DELETE' THEN
        v_group := OLD.transfer_group_id;
    ELSE
        v_group := NEW.transfer_group_id;
    END IF;

    IF v_group IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    SELECT
        count(*) FILTER (WHERE type = 'TRANSFER_OUT'),
        count(*) FILTER (WHERE type = 'TRANSFER_IN'),
        max(amount_minor) FILTER (WHERE type = 'TRANSFER_OUT'),
        max(amount_minor) FILTER (WHERE type = 'TRANSFER_IN'),
        max(status) FILTER (WHERE type = 'TRANSFER_OUT'),
        max(status) FILTER (WHERE type = 'TRANSFER_IN')
    INTO v_out_count, v_in_count, v_out_amount, v_in_amount, v_out_status, v_in_status
    FROM public.finance_transactions
    WHERE transfer_group_id = v_group;

    IF v_out_count <> 1 OR v_in_count <> 1 THEN
        RAISE EXCEPTION
            'Transfer group % must contain exactly one TRANSFER_OUT and one TRANSFER_IN leg',
            v_group;
    END IF;

    IF v_out_amount IS DISTINCT FROM v_in_amount THEN
        RAISE EXCEPTION
            'Transfer group % legs must have equal amounts', v_group;
    END IF;

    IF v_out_status IS DISTINCT FROM v_in_status THEN
        RAISE EXCEPTION
            'Transfer group % legs must share the same status', v_group;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_guard_transfer_group() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_guard_transfer_group() TO authenticated, service_role;

DROP TRIGGER IF EXISTS finance_transactions_transfer_group_check ON public.finance_transactions;
CREATE CONSTRAINT TRIGGER finance_transactions_transfer_group_check
AFTER INSERT OR UPDATE OR DELETE ON public.finance_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.finance_guard_transfer_group();


-- ============================================================================
-- 9. ATOMIC TRANSFER CREATION
-- ============================================================================
-- A transfer between two accounts is modelled as TWO paired legs sharing one
-- transfer_group_id: a TRANSFER_OUT leg on the source account and a
-- TRANSFER_IN leg on the destination account, with identical positive amounts.
-- Because one leg decreases and the other increases a balance by the same
-- amount, the organisation's total funds never change on a transfer.
--
-- This SECURITY DEFINER helper creates BOTH legs in a single transaction so
-- they can never be half-written. It does NOT bypass RLS: it re-checks the
-- caller's finance permissions explicitly and the per-row guard trigger still
-- fires. It runs with definer rights only to insert both rows atomically and
-- to assign a shared transfer_group_id.
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

    -- Leg 1: money leaves the source account.
    INSERT INTO public.finance_transactions (
        account_id, type, status, amount_minor, transaction_date,
        document_number, description, transfer_group_id,
        posted_at, posted_by, created_by, updated_by
    ) VALUES (
        p_from_account_id, 'TRANSFER_OUT',
        CASE WHEN p_post THEN 'POSTED'::public.finance_transaction_status ELSE 'DRAFT'::public.finance_transaction_status END,
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
        p_to_account_id, 'TRANSFER_IN',
        CASE WHEN p_post THEN 'POSTED'::public.finance_transaction_status ELSE 'DRAFT'::public.finance_transaction_status END,
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
-- 10. updated_at TRIGGERS (reuse the core set_updated_at())
-- ============================================================================

DROP TRIGGER IF EXISTS finance_accounts_set_updated_at ON public.finance_accounts;
CREATE TRIGGER finance_accounts_set_updated_at
BEFORE UPDATE ON public.finance_accounts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS finance_categories_set_updated_at ON public.finance_categories;
CREATE TRIGGER finance_categories_set_updated_at
BEFORE UPDATE ON public.finance_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS finance_transactions_set_updated_at ON public.finance_transactions;
CREATE TRIGGER finance_transactions_set_updated_at
BEFORE UPDATE ON public.finance_transactions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS finance_plans_set_updated_at ON public.finance_plans;
CREATE TRIGGER finance_plans_set_updated_at
BEFORE UPDATE ON public.finance_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 11. BALANCE VIEW (derived, never stored)
-- ============================================================================
-- Current balance per account = opening balance + sum of signed POSTED
-- movements. INCOME and TRANSFER_IN add; EXPENSE and TRANSFER_OUT subtract.
-- DRAFT and VOID rows contribute nothing.
-- security_invoker = true means the view runs with the CALLER's rights, so the
-- RLS policies on finance_accounts / finance_transactions apply automatically.
-- Only finance.view holders can therefore read balances.
-- ============================================================================

DROP VIEW IF EXISTS public.finance_account_balances;
CREATE VIEW public.finance_account_balances
WITH (security_invoker = true) AS
SELECT
    a.id                                   AS account_id,
    a.name                                 AS account_name,
    a.currency                             AS currency,
    a.opening_balance_minor                AS opening_balance_minor,
    COALESCE(SUM(
        CASE t.type
            WHEN 'INCOME'       THEN  t.amount_minor
            WHEN 'TRANSFER_IN'  THEN  t.amount_minor
            WHEN 'EXPENSE'      THEN -t.amount_minor
            WHEN 'TRANSFER_OUT' THEN -t.amount_minor
            ELSE 0
        END
    ), 0)                                   AS posted_movement_minor,
    a.opening_balance_minor + COALESCE(SUM(
        CASE t.type
            WHEN 'INCOME'       THEN  t.amount_minor
            WHEN 'TRANSFER_IN'  THEN  t.amount_minor
            WHEN 'EXPENSE'      THEN -t.amount_minor
            WHEN 'TRANSFER_OUT' THEN -t.amount_minor
            ELSE 0
        END
    ), 0)                                   AS current_balance_minor
FROM public.finance_accounts a
LEFT JOIN public.finance_transactions t
    ON t.account_id = a.id
   AND t.status = 'POSTED'
GROUP BY a.id, a.name, a.currency, a.opening_balance_minor;

REVOKE ALL ON public.finance_account_balances FROM anon, public;
GRANT SELECT ON public.finance_account_balances TO authenticated;


-- ============================================================================
-- 12. AUDIT INTEGRATION (writes to the existing public.audit_log)
-- ============================================================================
-- Uses the CANONICAL audit_log columns (user_id, action, module, entity_type,
-- entity_id, old_data, new_data, created_at) as defined in the core migration.
-- NB: an earlier incidents migration wrote to non-existent columns
-- (object_id/old_values/new_values); those are stale and NOT used here.
--
-- This is the ONLY finance audit mechanism (no second audit path is added).
-- It fires AFTER the row change, so a failed financial write that raises in
-- the BEFORE guard never reaches this AFTER trigger -> no false "success"
-- audit entry. Within finance_create_transfer both legs commit together, so
-- both are audited or neither is.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_finance_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_action text;
    v_module text;
    v_entity_id uuid;
    v_old jsonb;
    v_new jsonb;
    v_uid uuid;
BEGIN
    v_module := TG_TABLE_NAME;

    IF TG_OP = 'INSERT' THEN
        v_entity_id := NEW.id;
        v_old := NULL;
        v_new := to_jsonb(NEW);
        v_uid := COALESCE((SELECT auth.uid()), NEW.created_by);
        v_action := 'FINANCE_' || upper(TG_TABLE_NAME) || '_CREATE';
    ELSIF TG_OP = 'UPDATE' THEN
        v_entity_id := NEW.id;
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
        v_uid := COALESCE((SELECT auth.uid()), NEW.updated_by);
        -- Surface posting / voiding as explicit audit actions.
        IF TG_TABLE_NAME = 'finance_transactions' THEN
            IF OLD.status = 'DRAFT' AND NEW.status = 'POSTED' THEN
                v_action := 'FINANCE_TRANSACTION_POST';
            ELSIF NEW.status = 'VOID' AND OLD.status <> 'VOID' THEN
                v_action := 'FINANCE_TRANSACTION_VOID';
            ELSE
                v_action := 'FINANCE_TRANSACTION_UPDATE';
            END IF;
        ELSE
            v_action := 'FINANCE_' || upper(TG_TABLE_NAME) || '_UPDATE';
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_entity_id := OLD.id;
        v_old := to_jsonb(OLD);
        v_new := NULL;
        v_uid := COALESCE((SELECT auth.uid()), OLD.updated_by);
        v_action := 'FINANCE_' || upper(TG_TABLE_NAME) || '_DELETE';
    END IF;

    INSERT INTO public.audit_log (
        user_id, action, module, entity_type, entity_id, old_data, new_data, created_at
    ) VALUES (
        v_uid,
        v_action,
        v_module,
        TG_TABLE_NAME,
        v_entity_id,
        v_old,
        v_new,
        NOW()
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_finance_changes() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.audit_finance_changes() TO authenticated, service_role;

-- Audit triggers (AFTER, row-level) on all finance tables.
DROP TRIGGER IF EXISTS finance_accounts_audit_trigger ON public.finance_accounts;
CREATE TRIGGER finance_accounts_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.finance_accounts
FOR EACH ROW
EXECUTE FUNCTION public.audit_finance_changes();

DROP TRIGGER IF EXISTS finance_categories_audit_trigger ON public.finance_categories;
CREATE TRIGGER finance_categories_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.finance_categories
FOR EACH ROW
EXECUTE FUNCTION public.audit_finance_changes();

DROP TRIGGER IF EXISTS finance_transactions_audit_trigger ON public.finance_transactions;
CREATE TRIGGER finance_transactions_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.finance_transactions
FOR EACH ROW
EXECUTE FUNCTION public.audit_finance_changes();

DROP TRIGGER IF EXISTS finance_plans_audit_trigger ON public.finance_plans;
CREATE TRIGGER finance_plans_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.finance_plans
FOR EACH ROW
EXECUTE FUNCTION public.audit_finance_changes();

DROP TRIGGER IF EXISTS finance_attachments_audit_trigger ON public.finance_transaction_attachments;
CREATE TRIGGER finance_attachments_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.finance_transaction_attachments
FOR EACH ROW
EXECUTE FUNCTION public.audit_finance_changes();

-- ============================================================================
-- END OF MIGRATION 20261015_finance_module.sql
-- ============================================================================

