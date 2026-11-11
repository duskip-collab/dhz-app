-- ============================================================================
-- Migration: K24.15.2 – Data migration: user_* → member_access_*
-- Date: 20261130
-- Idempotná (IF NOT EXISTS / ON CONFLICT DO NOTHING / UPDATE).
-- IBA PODFRVA, NEAPLIKOVAŤ automaticky do žiadnej databázy.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Dočasná tabuľka pre nevyriešené prípady (report pre manuálne vyriešenie)
-- ---------------------------------------------------------------------------
create table if not exists public.member_access_migration_unresolved (
    user_id       uuid not null,
    auth_email    text,
    issue         text not null,
    created_at    timestamptz not null default now()
);

alter table public.member_access_migration_unresolved enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'member_access_migration_unresolved'
      and policyname = 'member_access_migration_unresolved_select_auth'
  ) then
    create policy member_access_migration_unresolved_select_auth
      on public.member_access_migration_unresolved for select to authenticated
      using (true);
  end if;
end $$;

revoke all on public.member_access_migration_unresolved from anon, public;
grant select on public.member_access_migration_unresolved to authenticated;
grant all on public.member_access_migration_unresolved to service_role;

-- ---------------------------------------------------------------------------
-- 1. Migracia user_roles → member_access_profiles
--    Prepojenie: user_roles.user_id → members.auth_user_id → members.id
-- ---------------------------------------------------------------------------
insert into public.member_access_profiles (member_id, role_id, changed_by, status)
select
    m.id as member_id,
    ur.role_id,
    coalesce(m.created_by, (select auth.uid())) as changed_by,
    'active' as status
from public.user_roles ur
join public.members m on m.auth_user_id = ur.user_id
on conflict (member_id) do update
set role_id = excluded.role_id,
    updated_at = now(),
    changed_by = excluded.changed_by,
    status = 'active';

-- ---------------------------------------------------------------------------
-- 2. Migracia user_permissions → member_permission_grants
-- ---------------------------------------------------------------------------
insert into public.member_permission_grants (member_id, permission_id, granted_by)
select
    m.id as member_id,
    up.permission_id,
    coalesce(up.granted_by, (select auth.uid())) as granted_by
from public.user_permissions up
join public.members m on m.auth_user_id = up.user_id
on conflict (member_id, permission_id) do update
set granted_at = now(),
    granted_by = excluded.granted_by;

-- ---------------------------------------------------------------------------
-- 3. Migracia user_permission_denials → member_permission_denials
-- ---------------------------------------------------------------------------
insert into public.member_permission_denials (member_id, permission_id, denied_by)
select
    m.id as member_id,
    upd.permission_id,
    coalesce(upd.created_by, (select auth.uid())) as denied_by
from public.user_permission_denials upd
join public.members m on m.auth_user_id = upd.user_id
on conflict (member_id, permission_id) do update
set denied_at = now(),
    denied_by = excluded.denied_by;

-- ---------------------------------------------------------------------------
-- 4. Nevyriešené prípady: user_id bez členského prepojenia (auth_user_id is null
--    alebo user_id neexistuje v members.auth_user_id)
-- ---------------------------------------------------------------------------
insert into public.member_access_migration_unresolved (user_id, auth_email, issue)
select
    ur.user_id,
    null,
    'user_id ohne Mitgliederprofil – auth_user_id neexistuje alebo je NULL'
from public.user_roles ur
left join public.members m on m.auth_user_id = ur.user_id
where m.id is null
on conflict do nothing;

insert into public.member_access_migration_unresolved (user_id, auth_email, issue)
select
    up.user_id,
    null,
    'user_id ohne Mitgliederprofil – auth_user_id neexistuje alebo je NULL (grant)'
from public.user_permissions up
left join public.members m on m.auth_user_id = up.user_id
where m.id is null
on conflict do nothing;

insert into public.member_access_migration_unresolved (user_id, auth_email, issue)
select
    upd.user_id,
    null,
    'user_id ohne Mitgliederprofil – auth_user_id neexistuje alebo je NULL (denial)'
from public.user_permission_denials upd
left join public.members m on m.auth_user_id = upd.user_id
where m.id is null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5. Nevyriešené prípady: člen s viacerými auth_user_id (duplicitné prepojenie)
-- ---------------------------------------------------------------------------
insert into public.member_access_migration_unresolved (user_id, auth_email, issue)
select
    m.auth_user_id as user_id,
    null,
    'člen má viaceré user_roles záznamy – potenciálny konflikt'
from public.members m
join public.user_roles ur on ur.user_id = m.auth_user_id
where m.auth_user_id is not null
group by m.auth_user_id, m.id
having count(*) > 1
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 6. Nevyriešené prípady: Mitglied s viacerými rolami v user_roles
-- ---------------------------------------------------------------------------
insert into public.member_access_migration_unresolved (user_id, auth_email, issue)
select
    ur.user_id,
    null,
    'používateľ má viacero rolí v user_roles – nutné ručné vyriešenie'
from public.user_roles ur
join public.members m on m.auth_user_id = ur.user_id
group by ur.user_id
having count(*) > 1
on conflict do nothing;

-- ============================================================================
-- KONIEC migrácie 20261130_member_access_data_migration.sql
-- ============================================================================