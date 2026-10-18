-- ============================================================================
-- Migration: Fix ADMIN role assignment for duskip@gmail.com
-- Date: 20261031
-- Purpose:
--   Corrects the email typo from previous migration. The email should be
--   duskip@gmail.com (not duskip@gmai.com).
--
--   1. Remove the incorrect entry if it exists (for duskip@gmai.com)
--   2. Assign ADMIN role to the correct email (duskip@gmail.com)
--
-- Notes:
--   - Safe to re-run because of ON CONFLICT DO NOTHING on the insert.
--   - If the auth user does not exist yet, the migration emits a NOTICE and
--     performs no write.
--   - Assumes the ADMIN role exists in public.roles.
-- ============================================================================

do $$
declare
  v_user_id_correct uuid;
  v_user_id_incorrect uuid;
  v_role_id uuid;
begin
  -- Check for incorrect email (typo)
  select u.id
    into v_user_id_incorrect
  from auth.users u
  where lower(u.email) = lower('duskip@gmai.com')
  limit 1;

  -- Check for correct email
  select u.id
    into v_user_id_correct
  from auth.users u
  where lower(u.email) = lower('duskip@gmail.com')
  limit 1;

  -- Get ADMIN role ID
  select r.id
    into v_role_id
  from public.roles r
  where r.code = 'ADMIN'
  limit 1;

  if v_role_id is null then
    raise exception 'ADMIN assignment failed: role ADMIN does not exist in public.roles.';
  end if;

  -- Clean up incorrect email if it exists (remove ADMIN assignment)
  if v_user_id_incorrect is not null then
    delete from public.user_roles
    where user_id = v_user_id_incorrect
      and role_id = v_role_id;
    raise notice 'Cleaned up incorrect email duskip@gmai.com - removed ADMIN role.';
  end if;

  -- Assign ADMIN role to correct email if the user exists
  if v_user_id_correct is null then
    raise notice 'ADMIN assignment skipped: auth user with email % does not exist yet.', 'duskip@gmail.com';
    return;
  end if;

  insert into public.user_roles (user_id, role_id)
  values (v_user_id_correct, v_role_id)
  on conflict (user_id, role_id) do nothing;

  raise notice 'Successfully assigned ADMIN role to duskip@gmail.com.';
end
$$;
