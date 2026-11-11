-- Ensure the standalone admin@admin.sk account has an active Admin profile
-- and full application access. Create the Auth user in Supabase Auth first;
-- credentials must never be stored in this migration.
do $$
declare
  v_user_id uuid;
  v_member_id uuid;
  v_member_auth_user_id uuid;
  v_first_name text;
  v_last_name text;
  v_role_id uuid;
  v_user_count integer;
  v_member_count integer;
  v_link_count integer;
begin
  select count(*), (array_agg(u.id))[1]
    into v_user_count, v_user_id
  from auth.users u
  where lower(btrim(u.email)) = 'admin@admin.sk';

  if v_user_count <> 1 then
    raise exception 'Expected exactly one auth user for admin@admin.sk, found %.', v_user_count;
  end if;

  select count(*),
         (array_agg(m.id))[1],
         (array_agg(m.auth_user_id))[1],
         (array_agg(m.first_name))[1],
         (array_agg(m.last_name))[1]
    into v_member_count, v_member_id, v_member_auth_user_id, v_first_name, v_last_name
  from public.members m
  where lower(btrim(m.email)) = 'admin@admin.sk';

  select count(*)
    into v_link_count
  from public.members m
  where m.auth_user_id = v_user_id;

  if v_link_count > 1 then
    raise exception 'admin@admin.sk is linked to multiple member profiles.';
  end if;

  if v_member_count > 1 then
    raise exception 'Expected at most one member profile for admin@admin.sk, found %.', v_member_count;
  elsif v_member_count = 1 then
    if v_member_auth_user_id is not null and v_member_auth_user_id <> v_user_id then
      raise exception 'The Admin Administrator profile is already linked to a different auth user.';
    end if;

    if lower(btrim(v_first_name)) <> 'admin'
       or lower(btrim(v_last_name)) <> 'administrator' then
      raise exception 'admin@admin.sk matches an existing non-admin member profile.';
    end if;

    if exists (
      select 1
      from public.members m
      where m.auth_user_id = v_user_id
        and m.id <> v_member_id
    ) then
      raise exception 'admin@admin.sk is already linked to a different member profile.';
    end if;

    update public.members
    set auth_user_id = v_user_id,
        first_name = 'Admin',
        last_name = 'Administrator',
        email = 'admin@admin.sk',
        member_number = coalesce(
          nullif(btrim(member_number), ''),
          'ADMIN-' || upper(substr(id::text, 1, 8))
        ),
        member_type = 'adult',
        membership_type = 'adult',
        status = 'active',
        joined_at = coalesce(joined_at, current_date)
    where id = v_member_id;
  else
    if v_link_count <> 0 then
      raise exception 'admin@admin.sk is already linked to a different member profile.';
    end if;

    insert into public.members (
      auth_user_id,
      first_name,
      last_name,
      email,
      member_number,
      member_type,
      membership_type,
      status,
      joined_at
    )
    values (
      v_user_id,
      'Admin',
      'Administrator',
      'admin@admin.sk',
      'ADMIN-' || upper(substr(v_user_id::text, 1, 8)),
      'adult',
      'adult',
      'active',
      current_date
    )
    returning id into v_member_id;
  end if;

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
