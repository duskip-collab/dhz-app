-- ============================================================================
-- Migrácia: doplnenie kategórií pokladne (príjem/výdaj)
-- Dátum: 2026-11-11
-- Idempotentná dopredná migrácia (iba INSERT ... ON CONFLICT (code) DO NOTHING)
-- ============================================================================

INSERT INTO public.finance_categories (name, code, direction, description, is_active, sort_order)
VALUES
  ('Iné', 'OTHER_INCOME', 'INCOME'::public.finance_direction, 'Ostatné príjmy.', TRUE, 60),
  ('Brigáda', 'BRIGADE_INCOME', 'INCOME'::public.finance_direction, 'Príjmy z brigády.', TRUE, 70),
  ('Nákup', 'PURCHASE_EXPENSE', 'EXPENSE'::public.finance_direction, 'Nákup materiálu a služieb.', TRUE, 80),
  ('Súťaž', 'COMPETITION_EXPENSE', 'EXPENSE'::public.finance_direction, 'Výdavky spojené so súťažami.', TRUE, 90),
  ('Iné', 'OTHER_EXPENSE', 'EXPENSE'::public.finance_direction, 'Ostatné výdavky.', TRUE, 100)
ON CONFLICT (code) DO NOTHING;