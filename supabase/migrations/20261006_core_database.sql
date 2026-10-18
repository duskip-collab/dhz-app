-- =========================================================
-- DHZ DIGITAL OS
-- CORE DATABASE
-- Migration 001 (Reordered as #1 in execution)
-- =========================================================

create extension if not exists "pgcrypto";

-- =========================================================
-- ENUM TYPES
-- =========================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'member_type') then
    create type public.member_type as enum ('adult', 'youth');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'youth_category') then
    create type public.youth_category as enum ('preparatory', 'dorast');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'member_status') then
    create type public.member_status as enum ('active', 'inactive');
  end if;
end $$;

-- =========================================================
-- PROFILES
-- One profile = one authenticated application user
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  first_name text,
  last_name text,

  phone text,
  email text,

  avatar_url text,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- MEMBERS
-- DHZ member record
-- A member may or may not have a login account.
-- =========================================================

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),

  profile_id uuid unique references public.profiles(id) on delete set null,

  first_name text not null,
  last_name text not null,

  date_of_birth date,

  phone text,
  email text,

  address text,

  joined_at date,

  member_type public.member_type not null default 'adult',

  youth_category public.youth_category,

  status public.member_status not null default 'active',

  position text,

  is_committee_member boolean not null default false,

  photo_url text,

  internal_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint youth_category_only_for_youth
    check (
      member_type = 'youth'
      or youth_category is null
    )
);

-- =========================================================
-- GUARDIANS
-- Parents / legal representatives of youth members
-- =========================================================

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),

  member_id uuid not null
    references public.members(id)
    on delete cascade,

  first_name text not null,
  last_name text not null,

  relationship text,

  phone text,
  email text,

  address text,

  is_primary boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- ROLES
-- =========================================================

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,
  name text not null,
  description text,

  created_at timestamptz not null default now()
);

-- =========================================================
-- PERMISSIONS
-- =========================================================

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,
  name text not null,
  description text,

  created_at timestamptz not null default now()
);

-- =========================================================
-- ROLE -> PERMISSION
-- =========================================================

create table if not exists public.role_permissions (
  role_id uuid not null
    references public.roles(id)
    on delete cascade,

  permission_id uuid not null
    references public.permissions(id)
    on delete cascade,

  primary key (role_id, permission_id)
);

-- =========================================================
-- USER -> ROLE
-- =========================================================

create table if not exists public.user_roles (
  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  role_id uuid not null
    references public.roles(id)
    on delete cascade,

  primary key (user_id, role_id)
);

-- =========================================================
-- USER-SPECIFIC PERMISSIONS
-- Allows e.g. treasurer to grant finance.view
-- to another committee member.
-- =========================================================

create table if not exists public.user_permissions (
  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  permission_id uuid not null
    references public.permissions(id)
    on delete cascade,

  granted_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),

  primary key (user_id, permission_id)
);

-- =========================================================
-- AUDIT LOG
-- =========================================================

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,

  user_id uuid
    references auth.users(id)
    on delete set null,

  action text not null,

  module text,

  entity_type text,

  entity_id uuid,

  old_data jsonb,

  new_data jsonb,

  created_at timestamptz not null default now()
);

-- =========================================================
-- INDEXES
-- =========================================================

create index idx_profiles_email
  on public.profiles(email);

create index idx_profiles_is_active
  on public.profiles(is_active);

create index idx_members_profile_id
  on public.members(profile_id);

create index idx_members_status
  on public.members(status);

create index idx_members_member_type
  on public.members(member_type);

create index idx_members_youth_category
  on public.members(youth_category);

create index idx_members_first_name
  on public.members(first_name);

create index idx_members_last_name
  on public.members(last_name);

create index idx_guardians_member_id
  on public.guardians(member_id);

create index idx_user_roles_user_id
  on public.user_roles(user_id);

create index idx_user_permissions_user_id
  on public.user_permissions(user_id);

create index idx_audit_log_user_id
  on public.audit_log(user_id);

create index idx_audit_log_created_at
  on public.audit_log(created_at desc);

create index idx_audit_log_entity_id
  on public.audit_log(entity_id);

create index idx_audit_log_module
  on public.audit_log(module);

-- =========================================================
-- UPDATED_AT FUNCTION
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- SECURITY FUNCTIONS
-- =========================================================

create or replace function public.has_role(p_user_id uuid, p_role_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id
      and r.code = p_role_code
  );
$$;

create or replace function public.has_permission(p_user_id uuid, p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = p_user_id
        and r.code = 'ADMIN'
    )
    or exists (
      select 1
      from public.user_permissions up
      join public.permissions p on p.id = up.permission_id
      where up.user_id = p_user_id
        and p.code = p_permission_code
    )
    or exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = p_user_id
        and p.code = p_permission_code
    );
$$;

-- =========================================================
-- UPDATED_AT TRIGGERS
-- =========================================================

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists members_updated_at on public.members;
create trigger members_updated_at
before update on public.members
for each row
execute function public.set_updated_at();

drop trigger if exists guardians_updated_at on public.guardians;
create trigger guardians_updated_at
before update on public.guardians
for each row
execute function public.set_updated_at();

-- =========================================================
-- DEFAULT ROLES
-- =========================================================

insert into public.roles (code, name, description)
values
  ('ADMIN', 'Administrátor', 'Plný prístup k systému'),
  ('VEDENIE', 'Vedenie', 'Vedenie DHZ'),
  ('VELITEL', 'Veliteľ', 'Veliteľ DHZ'),
  ('POKLADNIK', 'Pokladník', 'Správa financií'),
  ('TRENER', 'Tréner', 'Tréningy, mládež a súťaže'),
  ('CLEN', 'Člen', 'Bežný člen'),
  ('RODIC', 'Rodič', 'Prístup k vlastnému dieťaťu')
on conflict (code) do nothing;

-- =========================================================
-- DEFAULT PERMISSIONS
-- =========================================================

insert into public.permissions (code, name, description)
values

  ('dashboard.view', 'Dashboard', 'Zobrazenie dashboardu'),

  ('members.view', 'Členovia - zobrazenie', 'Zobrazenie členov'),
  ('members.create', 'Členovia - vytvorenie', 'Pridávanie členov'),
  ('members.edit', 'Členovia - úprava', 'Úprava členov'),

  ('training.view', 'Tréningy - zobrazenie', 'Zobrazenie tréningov'),
  ('training.create', 'Tréningy - vytvorenie', 'Vytvorenie tréningu'),
  ('training.edit', 'Tréningy - úprava', 'Úprava tréningu'),

  ('competition.view', 'Súťaže - zobrazenie', 'Zobrazenie súťaží'),
  ('competition.create', 'Súťaže - vytvorenie', 'Vytvorenie súťaže'),
  ('competition.edit', 'Súťaže - úprava', 'Úprava súťaže'),

  ('calendar.view', 'Kalendár - zobrazenie', 'Zobrazenie kalendára'),
  ('calendar.manage', 'Kalendár - správa', 'Správa kalendára'),

  ('inventory.view', 'Inventár - zobrazenie', 'Zobrazenie inventára'),
  ('inventory.create', 'Inventár - vytvorenie', 'Pridanie inventáru'),
  ('inventory.edit', 'Inventár - úprava', 'Úprava inventára'),

  ('vehicle.view', 'Vozidlá - zobrazenie', 'Zobrazenie vozidiel'),
  ('vehicle.manage', 'Vozidlá - správa', 'Správa vozidiel'),

  ('fault.create', 'Poruchy - nahlásenie', 'Nahlásenie poruchy'),
  ('fault.manage', 'Poruchy - správa', 'Správa porúch'),

  ('finance.view', 'Financie - zobrazenie', 'Zobrazenie financií'),
  ('finance.create', 'Financie - vytvorenie', 'Vytváranie finančných záznamov'),
  ('finance.edit', 'Financie - úprava', 'Úprava finančných záznamov'),
  ('finance.export', 'Financie - export', 'Export finančných údajov'),
  ('finance.manage_access', 'Financie - prístupy', 'Správa používateľov s prístupom k financiám'),

  ('documents.view', 'Dokumenty - zobrazenie', 'Zobrazenie dokumentov'),
  ('documents.upload', 'Dokumenty - nahrávanie', 'Nahrávanie dokumentov'),

  ('reports.view', 'Reporty - zobrazenie', 'Zobrazenie reportov'),
  ('reports.export', 'Reporty - export', 'Export reportov'),

  ('communication.view', 'Komunikácia - zobrazenie', 'Zobrazenie internej komunikácie'),
  ('communication.send', 'Komunikácia - odoslanie', 'Odosielanie správ'),

  ('admin.users', 'Používatelia', 'Správa používateľov'),
  ('admin.permissions', 'Oprávnenia', 'Správa oprávnení'),
  ('admin.audit', 'Audit', 'Zobrazenie audit logu')

on conflict (code) do nothing;

-- =========================================================
-- ROLE PERMISSIONS SEEDING
-- =========================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'ADMIN'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'VEDENIE'
  and p.code in (
    'dashboard.view',
    'members.view', 'members.create', 'members.edit',
    'training.view', 'competition.view',
    'calendar.view', 'calendar.manage',
    'inventory.view', 'vehicle.view',
    'fault.create', 'fault.manage',
    'finance.view', 'finance.export',
    'documents.view', 'documents.upload',
    'reports.view', 'reports.export',
    'communication.view', 'communication.send',
    'admin.audit'
  )
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'VELITEL'
  and p.code in (
    'dashboard.view',
    'members.view', 'members.create', 'members.edit',
    'training.view', 'training.create', 'training.edit',
    'competition.view', 'competition.create', 'competition.edit',
    'calendar.view', 'calendar.manage',
    'inventory.view', 'inventory.create', 'inventory.edit',
    'vehicle.view', 'vehicle.manage',
    'fault.create', 'fault.manage',
    'documents.view', 'documents.upload',
    'reports.view',
    'communication.view', 'communication.send'
  )
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'POKLADNIK'
  and p.code in (
    'dashboard.view',
    'members.view', 'calendar.view', 'inventory.view', 'fault.create',
    'finance.view', 'finance.create', 'finance.edit', 'finance.export', 'finance.manage_access',
    'documents.view', 'documents.upload',
    'reports.view', 'reports.export',
    'communication.view'
  )
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'TRENER'
  and p.code in (
    'dashboard.view', 'members.view',
    'training.view', 'training.create', 'training.edit',
    'competition.view', 'competition.create', 'competition.edit',
    'calendar.view', 'calendar.manage',
    'inventory.view', 'fault.create',
    'documents.view', 'communication.view'
  )
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'CLEN'
  and p.code in (
    'dashboard.view', 'members.view', 'training.view', 'competition.view',
    'calendar.view', 'inventory.view', 'vehicle.view', 'fault.create',
    'documents.view', 'communication.view'
  )
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'RODIC'
  and p.code in (
    'dashboard.view', 'training.view', 'competition.view', 'calendar.view',
    'fault.create', 'communication.view'
  )
on conflict (role_id, permission_id) do nothing;

-- =========================================================
-- ENABLE ROW LEVEL SECURITY
-- =========================================================

alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.guardians enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.audit_log enable row level security;

-- =========================================================
-- RLS POLICIES - PROFILES
-- =========================================================

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
on public.profiles for select to authenticated
using (true);

drop policy if exists profiles_insert_authenticated on public.profiles;
create policy profiles_insert_authenticated
on public.profiles for insert to authenticated
with check (id = (select auth.uid()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin
on public.profiles for delete to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
));

-- =========================================================
-- RLS POLICIES - MEMBERS
-- =========================================================

drop policy if exists members_select_authenticated on public.members;
create policy members_select_authenticated
on public.members for select to authenticated
using (true);

drop policy if exists members_insert_admin on public.members;
create policy members_insert_admin
on public.members for insert to authenticated
with check (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code in ('ADMIN', 'VEDENIE', 'VELITEL')
));

drop policy if exists members_update_admin on public.members;
create policy members_update_admin
on public.members for update to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code in ('ADMIN', 'VEDENIE', 'VELITEL')
))
with check (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code in ('ADMIN', 'VEDENIE', 'VELITEL')
));

drop policy if exists members_delete_admin on public.members;
create policy members_delete_admin
on public.members for delete to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
));

-- =========================================================
-- RLS POLICIES - GUARDIANS
-- =========================================================

drop policy if exists guardians_select_authenticated on public.guardians;
create policy guardians_select_authenticated
on public.guardians for select to authenticated
using (true);

drop policy if exists guardians_insert_trener_admin on public.guardians;
create policy guardians_insert_trener_admin
on public.guardians for insert to authenticated
with check (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code in ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
));

drop policy if exists guardians_update_trener_admin on public.guardians;
create policy guardians_update_trener_admin
on public.guardians for update to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code in ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
))
with check (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code in ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
));

drop policy if exists guardians_delete_admin on public.guardians;
create policy guardians_delete_admin
on public.guardians for delete to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
));

-- =========================================================
-- RLS POLICIES - ROLES, PERMISSIONS, RELATIONS
-- =========================================================

drop policy if exists roles_select_authenticated on public.roles;
create policy roles_select_authenticated
on public.roles for select to authenticated
using (true);

drop policy if exists roles_manage_admin on public.roles;
create policy roles_manage_admin
on public.roles for all to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
))
with check (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
));

drop policy if exists permissions_select_authenticated on public.permissions;
create policy permissions_select_authenticated
on public.permissions for select to authenticated
using (true);

drop policy if exists permissions_manage_admin on public.permissions;
create policy permissions_manage_admin
on public.permissions for all to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
))
with check (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
));

drop policy if exists role_permissions_select_authenticated on public.role_permissions;
create policy role_permissions_select_authenticated
on public.role_permissions for select to authenticated
using (true);

drop policy if exists role_permissions_manage_admin on public.role_permissions;
create policy role_permissions_manage_admin
on public.role_permissions for all to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
))
with check (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
));

drop policy if exists user_roles_select_authenticated on public.user_roles;
create policy user_roles_select_authenticated
on public.user_roles for select to authenticated
using (true);

drop policy if exists user_roles_manage_admin on public.user_roles;
create policy user_roles_manage_admin
on public.user_roles for all to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
))
with check (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
));

drop policy if exists user_permissions_select_authenticated on public.user_permissions;
create policy user_permissions_select_authenticated
on public.user_permissions for select to authenticated
using (true);

drop policy if exists user_permissions_manage_admin on public.user_permissions;
create policy user_permissions_manage_admin
on public.user_permissions for all to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
))
with check (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
));

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin
on public.audit_log for select to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
));

drop policy if exists audit_log_insert_all on public.audit_log;
create policy audit_log_insert_all
on public.audit_log for insert to authenticated
with check (true);

-- =========================================================
-- PERMISSIONS
-- =========================================================

revoke all on table public.profiles, public.members, public.guardians,
  public.roles, public.permissions, public.role_permissions,
  public.user_roles, public.user_permissions, public.audit_log
from anon, public;

grant select on table public.profiles, public.members, public.guardians,
  public.roles, public.permissions, public.role_permissions,
  public.user_roles, public.user_permissions, public.audit_log
to authenticated;

grant insert, update, delete on table public.profiles, public.members,
  public.guardians, public.roles, public.permissions, public.role_permissions,
  public.user_roles, public.user_permissions to authenticated;

grant insert on table public.audit_log to authenticated;

grant all on table public.profiles, public.members, public.guardians,
  public.roles, public.permissions, public.role_permissions,
  public.user_roles, public.user_permissions to service_role;

grant select, insert on table public.audit_log to service_role;

-- =========================================================
-- FUNCTION PERMISSIONS
-- =========================================================

revoke all on function public.has_role(uuid, text) from public, anon;
revoke all on function public.has_permission(uuid, text) from public, anon;
revoke all on function public.set_updated_at() from public, anon;

grant execute on function public.has_role(uuid, text) to authenticated, service_role;
grant execute on function public.has_permission(uuid, text) to authenticated, service_role;
grant execute on function public.set_updated_at() to authenticated, service_role;

grant select, insert on table public.audit_log to service_role;
