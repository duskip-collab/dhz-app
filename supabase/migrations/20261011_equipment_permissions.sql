-- Migration: Equipment module permission seed (inventory.manage)
-- Date: 20261013
-- Purpose: Add the 'inventory.manage' permission to the O5 catalog and grant
--          it to the managing roles. Required by the K11.1 RLS policies which
--          gate category writes and equipment disposal on 'inventory.manage'.
--
-- Role mapping note: the task references logical roles "admin" and "commander".
-- In this project's canonical O5 role catalog these are:
--   - admin      -> 'ADMIN'
--   - commander  -> 'VELITEL' (veliteľ = fire brigade commander)
--
-- Idempotency: ON CONFLICT DO NOTHING everywhere; non-destructive.

-- 1) Permission catalog entry
INSERT INTO public.permissions (code, name, description)
VALUES (
    'inventory.manage',
    'Správa kategórií a vyraďovanie majetku',
    'Správa kategórií majetku a vyraďovanie/odstraňovanie položiek inventára.'
)
ON CONFLICT (code) DO NOTHING;

-- 2) Grant to ADMIN
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.code = 'ADMIN' AND p.code = 'inventory.manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3) Grant to VELITEL (commander)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.code = 'VELITEL' AND p.code = 'inventory.manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;
