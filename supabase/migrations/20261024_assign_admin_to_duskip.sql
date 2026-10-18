-- ============================================================================
-- Migration: Assign ADMIN role to duskip@gmai.com
-- Date: 20261024
-- Purpose:
--   Idempotently assign the existing ADMIN application role to the existing
--   auth user with email duskip@gmai.com.
--
-- Notes:
--   - No application code changes.
--   - No schema changes.
--   - Safe to re-run because of ON CONFLICT DO NOTHING.
--   - If the auth user does not exist yet, the migration emits a NOTICE and
--     performs no write.
-- ============================================================================

do $$
declare
  v_user_id uuid;
  v_role_id uuid;
begin
  select u.id
    into v_user_id
  from auth.users u
  where lower(u.email) = lower('duskip@gmai.com')
  limit 1;

  if v_user_id is null then
    raise notice 'ADMIN assignment skipped: auth user with email % does not exist yet.', 'duskip@gmai.com';
    return;
  end if;

  select r.id
    into v_role_id
  from public.roles r
  where r.code = 'ADMIN'
  limit 1;

  if v_role_id is null then
    raise exception 'ADMIN assignment failed: role ADMIN does not exist in public.roles.';
  end if;

  insert into public.user_roles (user_id, role_id)
  values (v_user_id, v_role_id)
  on conflict (user_id, role_id) do nothing;
end
$$;
