-- Idempotent insert of two accounts if missing (by name)
INSERT INTO public.finance_accounts (name, type, currency, opening_balance_minor, opening_balance_date, is_active)
SELECT 'Bankový prevod', 'BANK'::public.finance_account_type, 'EUR', 0, CURRENT_DATE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.finance_accounts WHERE name = 'Bankový prevod');

INSERT INTO public.finance_accounts (name, type, currency, opening_balance_minor, opening_balance_date, is_active)
SELECT 'Hotovosť', 'CASH'::public.finance_account_type, 'EUR', 0, CURRENT_DATE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.finance_accounts WHERE name = 'Hotovosť');

-- Verification (read-only)
SELECT id, name, type, is_active FROM public.finance_accounts WHERE name IN ('Bankový prevod','Hotovosť');