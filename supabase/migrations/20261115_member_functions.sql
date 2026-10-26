-- Migration: member_functions (odborné funkcie členov)
-- Prepared only, NOT applied.
create table if not exists public.member_function_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.member_function_assignments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  function_code text not null references public.member_function_catalog(code) on delete restrict,
  assigned_at timestamptz not null default now(),
  valid_from date not null default current_date,
  valid_to date,
  assigned_by uuid not null default auth.uid(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mfa_valid_range check (valid_to is null or valid_to >= valid_from)
);

create index if not exists idx_mfa_member on public.member_function_assignments(member_id);
create index if not exists idx_mfa_function on public.member_function_assignments(function_code);

alter table public.member_function_catalog enable row level security;
alter table public.member_function_assignments enable row level security;

drop policy if exists mfc_read on public.member_function_catalog;
create policy mfc_read on public.member_function_catalog for select to authenticated
  using (public.has_permission((select auth.uid()), 'members.view'));

drop policy if exists mfc_write on public.member_function_catalog;
create policy mfc_write on public.member_function_catalog for all to authenticated
  using (public.has_role((select auth.uid()), 'ADMIN'))
  with check (public.has_role((select auth.uid()), 'ADMIN'));

drop policy if exists mfa_read on public.member_function_assignments;
create policy mfa_read on public.member_function_assignments for select to authenticated
  using (public.has_permission((select auth.uid()), 'members.view'));

drop policy if exists mfa_write on public.member_function_assignments;
create policy mfa_write on public.member_function_assignments for all to authenticated
  using (public.has_permission((select auth.uid()), 'members.edit'))
  with check (public.has_permission((select auth.uid()), 'members.edit') and assigned_by = (select auth.uid()));

drop trigger if exists mfa_updated_at on public.member_function_assignments;
create trigger mfa_updated_at before update on public.member_function_assignments
  for each row execute function public.set_updated_at();

insert into public.member_function_catalog(code,name) values
 ('FIREFIGHTER','Hasič'),('SENIOR_FIREFIGHTER','Starší hasič'),('FIREFIGHTER_RESCUER','Hasič záchranár'),
 ('TECHNICIAN_ENGINE','Technik-strojník'),('TECHNICIAN_RADIO','Technik špecialista – spojovacia služba'),
 ('TECHNICIAN_GAS','Technik špecialista – protiplynová služba'),('TEAM_LEADER','Veliteľ družstva'),
 ('UNIT_COMMANDER','Veliteľ jednotky'),('DEPUTY_COMMANDER','Zástupca veliteľa jednotky')
on conflict (code) do nothing;