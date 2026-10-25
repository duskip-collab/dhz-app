-- ============================================================================
-- FORWARD-ONLY MIGRATION: 20261110_finance_cash_checks_dues.sql
-- Fáza: FINANCE MODULE SPEC AUDIT — sekcie 6, 10/11, 13 (FIXED RLS WITH CHECK)
-- ============================================================================

-- 1. POKLADNIČNÉ KONTROLY
CREATE TABLE IF NOT EXISTS public.finance_cash_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.finance_accounts(id) ON DELETE RESTRICT,
    check_datetime TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_balance_minor BIGINT NOT NULL,
    actual_cash_minor BIGINT NOT NULL,
    difference_minor BIGINT GENERATED ALWAYS AS (actual_cash_minor - expected_balance_minor) STORED,
    reason TEXT NOT NULL
        CHECK (reason IN ('PERIODIC', 'MONTHLY_CLOSING', 'HANDOVER', 'DIFFERENCE', 'OTHER')),
    note TEXT,
    attachment_path TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_finance_cash_checks_account_distinct
        CHECK (account_id IS NOT NULL)
);

COMMENT ON TABLE public.finance_cash_checks IS
    'Evidencia manuálnych kontrol hotovosti (skutočný vs. evidovaný stav). Záznam je nemenný; nikdy nemení evidovaný finančný zostatok.';

CREATE INDEX IF NOT EXISTS idx_finance_cash_checks_account
    ON public.finance_cash_checks(account_id);
CREATE INDEX IF NOT EXISTS idx_finance_cash_checks_datetime
    ON public.finance_cash_checks(check_datetime DESC);


-- 2. ČLENSKÉ PRÍSPEVKY
CREATE TABLE IF NOT EXISTS public.finance_membership_dues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
    year INT NOT NULL
        CONSTRAINT chk_finance_dues_year CHECK (year >= 2000 AND year <= 2100),
    due_date DATE NOT NULL,
    amount_due_minor BIGINT NOT NULL
        CONSTRAINT chk_finance_dues_amount_due_positive CHECK (amount_due_minor > 0),
    amount_paid_minor BIGINT NOT NULL DEFAULT 0
        CONSTRAINT chk_finance_dues_amount_paid_nonneg CHECK (amount_paid_minor >= 0),
    status TEXT NOT NULL DEFAULT 'PENDING'
        CONSTRAINT chk_finance_dues_status
            CHECK (status IN ('PENDING', 'PARTIAL', 'PAID', 'WAIVED')),
    waiver_reason TEXT
        CONSTRAINT chk_finance_dues_waiver_reason
            CHECK (status <> 'WAIVED' OR waiver_reason IS NOT NULL),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_finance_dues_member_year UNIQUE (member_id, year)
);

COMMENT ON TABLE public.finance_membership_dues IS
    'Predpisy členských príspevkov viazané na členov DHZ.';

CREATE INDEX IF NOT EXISTS idx_finance_dues_year ON public.finance_membership_dues(year);
CREATE INDEX IF NOT EXISTS idx_finance_dues_status ON public.finance_membership_dues(status);
CREATE INDEX IF NOT EXISTS idx_finance_dues_due_date ON public.finance_membership_dues(due_date);


-- 3. ÚHRADY ČLENSKÝCH PRÍSPEVKOV
CREATE TABLE IF NOT EXISTS public.finance_membership_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dues_id UUID NOT NULL REFERENCES public.finance_membership_dues(id) ON DELETE RESTRICT,
    transaction_id UUID REFERENCES public.finance_transactions(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES public.finance_accounts(id) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL
        CONSTRAINT chk_finance_pay_amount_positive CHECK (amount_minor > 0),
    payment_date DATE NOT NULL,
    method TEXT NOT NULL DEFAULT 'CASH'
        CONSTRAINT chk_finance_pay_method
            CHECK (method IN ('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER')),
    note TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_finance_pay_transaction_required
        CHECK (transaction_id IS NOT NULL)
);

COMMENT ON TABLE public.finance_membership_payments IS
    'Allocácie úhrad členských príspevkov na predpisy.';

CREATE INDEX IF NOT EXISTS idx_finance_pay_dues ON public.finance_membership_payments(dues_id);
CREATE INDEX IF NOT EXISTS idx_finance_pay_transaction ON public.finance_membership_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_finance_pay_date ON public.finance_membership_payments(payment_date DESC);


-- 4. UZÁVIERKY
CREATE TABLE IF NOT EXISTS public.finance_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.finance_accounts(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    opening_balance_minor BIGINT NOT NULL,
    income_minor BIGINT NOT NULL DEFAULT 0
        CONSTRAINT chk_finance_closings_income CHECK (income_minor >= 0),
    expense_minor BIGINT NOT NULL DEFAULT 0
        CONSTRAINT chk_finance_closings_expense CHECK (expense_minor >= 0),
    transfer_in_minor BIGINT NOT NULL DEFAULT 0
        CONSTRAINT chk_finance_closings_tin CHECK (transfer_in_minor >= 0),
    transfer_out_minor BIGINT NOT NULL DEFAULT 0
        CONSTRAINT chk_finance_closings_tout CHECK (transfer_out_minor >= 0),
    expected_balance_minor BIGINT NOT NULL,
    actual_cash_minor BIGINT,
    difference_minor BIGINT
        CONSTRAINT chk_finance_closings_diff
            CHECK (actual_cash_minor IS NULL OR difference_minor = actual_cash_minor - expected_balance_minor),
    supersedes_id UUID REFERENCES public.finance_closings(id) ON DELETE SET NULL,
    note TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_finance_closings_period CHECK (period_end >= period_start)
);

COMMENT ON TABLE public.finance_closings IS
    'Uzávierky období (nemenné snapshoty).';

CREATE INDEX IF NOT EXISTS idx_finance_closings_account_period
    ON public.finance_closings(account_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_finance_closings_supersedes
    ON public.finance_closings(supersedes_id);


-- 5. TRIGGER & SEED
CREATE OR REPLACE FUNCTION public.finance_dues_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dues_id uuid;
    v_paid bigint;
    v_due bigint;
    v_status text;
BEGIN
    v_dues_id := COALESCE(NEW.dues_id, OLD.dues_id);

    SELECT amount_due_minor, status
      INTO v_due, v_status
      FROM public.finance_membership_dues
     WHERE id = v_dues_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT COALESCE(SUM(amount_minor), 0)
      INTO v_paid
      FROM public.finance_membership_payments
     WHERE dues_id = v_dues_id;

    IF v_status = 'WAIVED' THEN
        UPDATE public.finance_membership_dues
           SET amount_paid_minor = v_paid,
               updated_at = NOW()
         WHERE id = v_dues_id;
    ELSIF v_paid >= v_due THEN
        UPDATE public.finance_membership_dues
           SET amount_paid_minor = v_paid,
               status = 'PAID',
               updated_at = NOW()
         WHERE id = v_dues_id;
    ELSIF v_paid > 0 THEN
        UPDATE public.finance_membership_dues
           SET amount_paid_minor = v_paid,
               status = 'PARTIAL',
               updated_at = NOW()
         WHERE id = v_dues_id;
    ELSE
        UPDATE public.finance_membership_dues
           SET amount_paid_minor = 0,
               status = 'PENDING',
               updated_at = NOW()
         WHERE id = v_dues_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.finance_dues_sync() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_dues_sync() TO authenticated, service_role;

DROP TRIGGER IF EXISTS finance_payments_dues_sync ON public.finance_membership_payments;
CREATE TRIGGER finance_payments_dues_sync
AFTER INSERT OR UPDATE OR DELETE ON public.finance_membership_payments
FOR EACH ROW
EXECUTE FUNCTION public.finance_dues_sync();

INSERT INTO public.finance_categories (name, code, direction, description, is_active, sort_order)
VALUES (
    'Členské príspevky',
    'MEMBERSHIP_DUES',
    'INCOME'::public.finance_direction,
    'Príjmy z členských príspevkov (predpisy a úhrady).',
    TRUE,
    50
)
ON CONFLICT (code) DO NOTHING;


-- 6. RLS + GRANT
ALTER TABLE public.finance_cash_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_membership_dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_membership_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_closings ENABLE ROW LEVEL SECURITY;

-- cash_checks
DROP POLICY IF EXISTS cash_checks_select ON public.finance_cash_checks;
CREATE POLICY cash_checks_select ON public.finance_cash_checks
    FOR SELECT TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.view'));

DROP POLICY IF EXISTS cash_checks_insert ON public.finance_cash_checks;
CREATE POLICY cash_checks_insert ON public.finance_cash_checks
    FOR INSERT TO authenticated
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'finance.create'));

-- dues
DROP POLICY IF EXISTS dues_select ON public.finance_membership_dues;
CREATE POLICY dues_select ON public.finance_membership_dues
    FOR SELECT TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.view'));

DROP POLICY IF EXISTS dues_insert ON public.finance_membership_dues;
CREATE POLICY dues_insert ON public.finance_membership_dues
    FOR INSERT TO authenticated
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'finance.create'));

DROP POLICY IF EXISTS dues_update ON public.finance_membership_dues;
CREATE POLICY dues_update ON public.finance_membership_dues
    FOR UPDATE TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.edit'))
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'finance.edit'));

-- payments (OPRAVENÁ RLS POLITIKA BEZ NEW.)
DROP POLICY IF EXISTS payments_select ON public.finance_membership_payments;
CREATE POLICY payments_select ON public.finance_membership_payments
    FOR SELECT TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.view'));

DROP POLICY IF EXISTS payments_insert ON public.finance_membership_payments;
CREATE POLICY payments_insert ON public.finance_membership_payments
    FOR INSERT TO authenticated
    WITH CHECK (
        public.has_permission((SELECT auth.uid()), 'finance.create')
        AND EXISTS (
            SELECT 1 FROM public.finance_membership_dues d
             WHERE d.id = dues_id
               AND (
                   d.status = 'WAIVED'
                   OR d.amount_paid_minor + amount_minor <= d.amount_due_minor
               )
        )
    );

-- closings
DROP POLICY IF EXISTS closings_select ON public.finance_closings;
CREATE POLICY closings_select ON public.finance_closings
    FOR SELECT TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'finance.view'));

DROP POLICY IF EXISTS closings_insert ON public.finance_closings;
CREATE POLICY closings_insert ON public.finance_closings
    FOR INSERT TO authenticated
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'finance.edit'));

-- GRANTY
REVOKE ALL ON TABLE public.finance_cash_checks FROM anon, public;
REVOKE ALL ON TABLE public.finance_membership_dues FROM anon, public;
REVOKE ALL ON TABLE public.finance_membership_payments FROM anon, public;
REVOKE ALL ON TABLE public.finance_closings FROM anon, public;

GRANT SELECT, INSERT ON TABLE public.finance_cash_checks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.finance_membership_dues TO authenticated;
GRANT SELECT, INSERT ON TABLE public.finance_membership_payments TO authenticated;
GRANT SELECT, INSERT ON TABLE public.finance_closings TO authenticated;

GRANT ALL ON TABLE public.finance_cash_checks TO service_role;
GRANT ALL ON TABLE public.finance_membership_dues TO service_role;
GRANT ALL ON TABLE public.finance_membership_payments TO service_role;
GRANT ALL ON TABLE public.finance_closings TO service_role;


-- 7. AUDIT TRIGGERY
DROP TRIGGER IF EXISTS finance_cash_checks_audit_trigger ON public.finance_cash_checks;
CREATE TRIGGER finance_cash_checks_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.finance_cash_checks
FOR EACH ROW
EXECUTE FUNCTION public.audit_finance_changes();

DROP TRIGGER IF EXISTS finance_dues_audit_trigger ON public.finance_membership_dues;
CREATE TRIGGER finance_dues_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.finance_membership_dues
FOR EACH ROW
EXECUTE FUNCTION public.audit_finance_changes();

DROP TRIGGER IF EXISTS finance_payments_audit_trigger ON public.finance_membership_payments;
CREATE TRIGGER finance_payments_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.finance_membership_payments
FOR EACH ROW
EXECUTE FUNCTION public.audit_finance_changes();

DROP TRIGGER IF EXISTS finance_closings_audit_trigger ON public.finance_closings;
CREATE TRIGGER finance_closings_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.finance_closings
FOR EACH ROW
EXECUTE FUNCTION public.audit_finance_changes();