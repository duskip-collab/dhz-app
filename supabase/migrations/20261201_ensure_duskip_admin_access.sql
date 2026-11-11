-- Link duskip@gmail.com to Dušan Pavlus and ensure ADMIN access in both
-- legacy and member-based authorization tables. Apply after member migrations.
do $$
declare
  v_user_id uuid;
  v_member_id uuid;
  v_role_id uuid;
  v_user_count integer;
  v_member_count integer;
  v_link_count integer;
begin
  select count(*), (array_agg(u.id))[1]
    into v_user_count, v_user_id
  from auth.users u
  where lower(btrim(u.email)) = 'duskip@gmail.com';

  if v_user_count <> 1 then
    raise exception 'Expected exactly one auth user for duskip@gmail.com, found %.', v_user_count;
  end if;

  select count(*), (array_agg(m.id))[1]
    into v_member_count, v_member_id
  from public.members m
  where lower(btrim(m.first_name)) = lower('Dušan')
    and lower(btrim(m.last_name)) = lower('Pavlus');

  if v_member_count <> 1 then
    raise exception 'Expected exactly one member profile for Dušan Pavlus, found %.', v_member_count;
  end if;

  select count(*)
    into v_link_count
  from public.members m
  where m.auth_user_id = v_user_id
    and m.id <> v_member_id;

  if v_link_count <> 0 then
    raise exception 'duskip@gmail.com is already linked to a different member profile.';
  end if;

  select count(*)
    into v_link_count
  from public.members m
  where m.id = v_member_id
    and m.auth_user_id is not null
    and m.auth_user_id <> v_user_id;

  if v_link_count <> 0 then
    raise exception 'The Dušan Pavlus member profile is already linked to a different auth user.';
  end if;

  update public.members
  set auth_user_id = v_user_id
  where id = v_member_id
    and auth_user_id is distinct from v_user_id;

  select r.id
    into v_role_id
  from public.roles r
  where r.code = 'ADMIN';

  if v_role_id is null then
    raise exception 'ADMIN role does not exist in public.roles.';
  end if;

  insert into public.role_permissions (role_id, permission_id)
  select v_role_id, p.id
  from public.permissions p
  on conflict (role_id, permission_id) do nothing;

  insert into public.user_roles (user_id, role_id)
  values (v_user_id, v_role_id)
  on conflict (user_id, role_id) do nothing;

  insert into public.member_access_profiles (member_id, role_id, status)
  values (v_member_id, v_role_id, 'active')
  on conflict (member_id) do update
  set role_id = excluded.role_id,
      status = 'active',
      updated_at = now();

  delete from public.user_permission_denials
  where user_id = v_user_id;

  delete from public.member_permission_denials
  where member_id = v_member_id;
end
$$;
