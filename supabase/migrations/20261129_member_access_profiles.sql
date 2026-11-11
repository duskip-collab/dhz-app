-- ============================================================================
-- Migration: K24.15 – Member-centric access profiles bound to members.id
-- Date: 20261129
-- Idempotná (CREATE OR REPLACE / IF NOT EXISTS). IBA PODFRVA, NEAPLIKOVAŤ
-- automaticky do žiadnej databázy.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. member_access_profiles – členský prístupový profil (viazaný na members.id)
-- ---------------------------------------------------------------------------
create table if not exists public.member_access_profiles (
    member_id        uuid not null references public.members(id) on delete cascade,
    role_id          uuid references public.roles(id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    changed_by       uuid references auth.users(id) on delete set null,
    status           text not null default 'active',
    primary key (member_id)
);

alter table public.member_access_profiles enable row level security;

drop policy if exists member_access_profiles_select_authenticated on public.member_access_profiles;
create policy member_access_profiles_select_authenticated
  on public.member_access_profiles for select to authenticated
  using (true);

drop policy if exists member_access_profiles_manage_admin on public.member_access_profiles;
create policy member_access_profiles_manage_admin
  on public.member_access_profiles for all to authenticated
  using (
    public.has_role((select auth.uid()), 'ADMIN')
  )
  with check (
    public.has_role((select auth.uid()), 'ADMIN')
  );

revoke all on public.member_access_profiles from anon, public;
grant select on public.member_access_profiles to authenticated;
grant insert, update, delete on public.member_access_profiles to authenticated;
grant all on public.member_access_profiles to service_role;

-- ---------------------------------------------------------------------------
-- 2. member_permission_grants – individuálne granty viazané na members.id
-- ---------------------------------------------------------------------------
create table if not exists public.member_permission_grants (
    member_id   uuid not null references public.members(id) on delete cascade,
    permission_id uuid not null references public.permissions(id) on delete cascade,
    granted_at  timestamptz not null default now(),
    granted_by  uuid references auth.users(id) on delete set null,
    primary key (member_id, permission_id)
);

alter table public.member_permission_grants enable row level security;

drop policy if exists member_permission_grants_select_authenticated on public.member_permission_grants;
create policy member_permission_grants_select_authenticated
  on public.member_permission_grants for select to authenticated
  using (true);

drop policy if exists member_permission_grants_manage_admin on public.member_permission_grants;
create policy member_permission_grants_manage_admin
  on public.member_permission_grants for all to authenticated
  using (
    public.has_role((select auth.uid()), 'ADMIN')
  )
  with check (
    public.has_role((select auth.uid()), 'ADMIN')
  );

revoke all on public.member_permission_grants from anon, public;
grant select on public.member_permission_grants to authenticated;
grant insert, update, delete on public.member_permission_grants to authenticated;
grant all on public.member_permission_grants to service_role;

-- ---------------------------------------------------------------------------
-- 3. member_permission_denials – individuálne odobratia viazané na members.id
-- ---------------------------------------------------------------------------
create table if not exists public.member_permission_denials (
    member_id       uuid not null references public.members(id) on delete cascade,
    permission_id   uuid not null references public.permissions(id) on delete cascade,
    denied_at       timestamptz not null default now(),
    denied_by       uuid references auth.users(id) on delete set null,
    primary key (member_id, permission_id)
);

alter table public.member_permission_denials enable row level security;

drop policy if exists member_permission_denials_select_authenticated on public.member_permission_denials;
create policy member_permission_denials_select_authenticated
  on public.member_permission_denials for select to authenticated
  using (true);

drop policy if exists member_permission_denials_manage_admin on public.member_permission_denials;
create policy member_permission_denials_manage_admin
  on public.member_permission_denials for all to authenticated
  using (
    public.has_role((select auth.uid()), 'ADMIN')
  )
  with check (
    public.has_role((select auth.uid()), 'ADMIN')
  );

revoke all on public.member_permission_denials from anon, public;
grant select on public.member_permission_denials to authenticated;
grant insert, update, delete on public.member_permission_denials to authenticated;
grant all on public.member_permission_denials to service_role;

-- ---------------------------------------------------------------------------
-- 4. set_member_access_member – RPC pre členský prístupový profil (member_id)
--    Nahradí dependence na auth.users.id pri ukladaní rolí/oprávnení.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_access_member(
    p_member_id            uuid,
    p_role_code            text,
    p_grant_permissions    text[] default '{}',
    p_deny_permissions     text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_uid      uuid := auth.uid();
    v_role_id  uuid;
    v_member_auth_user_id uuid;
    v_old_role text;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'not_authenticated');
    end if;

    if not public.has_permission(v_uid, 'admin.users') then
        return jsonb_build_object('success', false, 'error', 'forbidden');
    end if;

    if p_member_id is null then
        return jsonb_build_object('success', false, 'error', 'invalid_member');
    end if;

    select m.auth_user_id into v_member_auth_user_id
    from public.members m
    where m.id = p_member_id;

    -- Člen môže mať prístupový profil aj bez vytvoreného auth účtu.
    -- auth_user_id sa vyplní až pri aktivácii pozvánky.
    if v_member_auth_user_id is null then
        -- Člen existuje, ale ešte nemá účet – povolené.
        null;
    end if;

    if p_role_code = 'ADMIN' and not public.has_role(v_uid, 'ADMIN') then
        return jsonb_build_object('success', false, 'error', 'admin_role_restricted');
    end if;

    select r.id into v_role_id
    from public.roles r
    where r.code = p_role_code;

    if v_role_id is null then
        return jsonb_build_object('success', false, 'error', 'unknown_role');
    end if;

    if exists (
        select 1 from unnest(p_grant_permissions) as g(code)
        where not exists (select 1 from public.permissions p where p.code = g.code)
    ) then
        return jsonb_build_object('success', false, 'error', 'invalid_permission');
    end if;

    if exists (
        select 1 from unnest(p_deny_permissions) as d(code)
        where not exists (select 1 from public.permissions p where p.code = d.code)
    ) then
        return jsonb_build_object('success', false, 'error', 'invalid_permission');
    end if;

    select r.code into v_old_role
    from public.member_access_profiles map
    join public.roles r on r.id = map.role_id
    where map.member_id = p_member_id;

    insert into public.member_access_profiles (member_id, role_id, updated_at, changed_by)
    values (p_member_id, v_role_id, now(), v_uid)
    on conflict (member_id) do update
    set role_id = excluded.role_id,
        updated_at = excluded.updated_at,
        changed_by = excluded.changed_by;

    delete from public.member_permission_grants where member_id = p_member_id;
    insert into public.member_permission_grants (member_id, permission_id, granted_by)
    select p_member_id, p.id, v_uid
    from public.permissions p
    where p.code = any(p_grant_permissions);

    delete from public.member_permission_denials where member_id = p_member_id;
    insert into public.member_permission_denials (member_id, permission_id, denied_by)
    select p_member_id, p.id, v_uid
    from public.permissions p
    where p.code = any(p_deny_permissions);

    insert into public.audit_log (user_id, action, module, entity_type, entity_id, new_data)
    values (
        v_uid, 'access.update', 'access', 'member', p_member_id,
        jsonb_build_object('old_role', v_old_role, 'new_role', p_role_code, 'member_id', p_member_id)
    );

    return jsonb_build_object(
        'success', true,
        'old_role', v_old_role,
        'new_role', p_role_code,
        'member_id', p_member_id
    );
end;
$$;

revoke all on function public.set_member_access_member(uuid, text, text[], text[]) from public;
grant execute on function public.set_member_access_member(uuid, text, text[], text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. member_has_permission – RPC pre efektívne oprávnenia člena (member_id)
-- ---------------------------------------------------------------------------
create or replace function public.member_has_permission(
    p_member_id        uuid,
    p_permission_code  text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    exists (
      select 1 from public.member_access_profiles map
      join public.roles r on r.id = map.role_id
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions p on p.id = rp.permission_id
      where map.member_id = p_member_id and p.code = p_permission_code
    )
    or exists (
      select 1 from public.member_permission_grants mg
      join public.permissions p on p.id = mg.permission_id
      where mg.member_id = p_member_id and p.code = p_permission_code
    )
  )
  and not exists (
    select 1 from public.member_permission_denials md
    join public.permissions p2 on p2.id = md.permission_id
    where md.member_id = p_member_id and p2.code = p_permission_code
  );
$$;

revoke all on function public.member_has_permission(uuid, text) from public, anon;
grant execute on function public.member_has_permission(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. member_has_role – RPC pre efektívnu rolu člena (member_id)
-- ---------------------------------------------------------------------------
create or replace function public.member_has_role(
    p_member_id   uuid,
    p_role_code   text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.member_access_profiles map
    join public.roles r on r.id = map.role_id
    where map.member_id = p_member_id and r.code = p_role_code
  );
$$;

revoke all on function public.member_has_role(uuid, text) from public, anon;
grant execute on function public.member_has_role(uuid, text) to authenticated, service_role;

-- ============================================================================
-- KONIEC migrácie 20261129_member_access_profiles.sql
-- ============================================================================