-- K26.0.2B.3: member-bound authorization and
-- a separate many-to-many model for organizational functions.
-- Forward-only. Do not apply without reviewing the migration state/data first.

create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select m.id
  from public.members m
  where m.auth_user_id = auth.uid();
$$;

alter function public.current_member_id() owner to postgres;
revoke all on function public.current_member_id() from public, anon;
grant execute on function public.current_member_id() to authenticated;

do $$
begin
  if exists (
    select 1
    from public.members
    where auth_user_id is not null
    group by auth_user_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate members.auth_user_id values must be resolved before authorization repair';
  end if;
end;
$$;

create unique index if not exists members_auth_user_id_unique
  on public.members (auth_user_id)
  where auth_user_id is not null;

create or replace function public.member_has_permission(
  p_member_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and p_member_id = public.current_member_id()
    and exists (
      select 1
      from public.member_access_profiles active_profile
      where active_profile.member_id = p_member_id
        and active_profile.status = 'active'
    )
    and (
      exists (
        select 1
        from public.member_access_profiles map
        join public.role_permissions rp on rp.role_id = map.role_id
        join public.permissions p on p.id = rp.permission_id
        where map.member_id = p_member_id
          and p.code = p_permission_code
      )
      or exists (
        select 1
        from public.member_permission_grants mg
        join public.permissions p on p.id = mg.permission_id
        where mg.member_id = p_member_id
          and p.code = p_permission_code
      )
    )
    and not exists (
      select 1
      from public.member_permission_denials md
      join public.permissions p on p.id = md.permission_id
      where md.member_id = p_member_id
        and p.code = p_permission_code
    );
$$;

alter function public.member_has_permission(uuid, text) owner to postgres;
revoke all on function public.member_has_permission(uuid, text) from public, anon, service_role;
grant execute on function public.member_has_permission(uuid, text) to authenticated;

create or replace function public.member_has_role(
  p_member_id uuid,
  p_role_code text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and p_member_id = public.current_member_id()
    and exists (
      select 1
      from public.member_access_profiles map
      join public.roles r on r.id = map.role_id
      where map.member_id = p_member_id
        and map.status = 'active'
        and r.code = p_role_code
    );
$$;

alter function public.member_has_role(uuid, text) owner to postgres;
revoke all on function public.member_has_role(uuid, text) from public, anon, service_role;
grant execute on function public.member_has_role(uuid, text) to authenticated;

-- Compatibility signatures are retained, but they can only answer for auth.uid().
create or replace function public.has_role(p_user_id uuid, p_role_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id = auth.uid()
    and public.member_has_role(public.current_member_id(), p_role_code);
$$;

alter function public.has_role(uuid, text) owner to postgres;
revoke all on function public.has_role(uuid, text) from public, anon;
grant execute on function public.has_role(uuid, text) to authenticated, service_role;

create or replace function public.has_any_role(p_user_id uuid, p_role_codes text[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id = auth.uid()
    and exists (
      select 1
      from public.member_access_profiles map
      join public.roles r on r.id = map.role_id
      where map.member_id = public.current_member_id()
        and map.status = 'active'
        and r.code = any(p_role_codes)
    );
$$;

alter function public.has_any_role(uuid, text[]) owner to postgres;
revoke all on function public.has_any_role(uuid, text[]) from public, anon;
grant execute on function public.has_any_role(uuid, text[]) to authenticated, service_role;

create or replace function public.has_permission(p_user_id uuid, p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id = auth.uid()
    and public.member_has_permission(public.current_member_id(), p_permission_code);
$$;

alter function public.has_permission(uuid, text) owner to postgres;
revoke all on function public.has_permission(uuid, text) from public, anon;
grant execute on function public.has_permission(uuid, text) to authenticated, service_role;

-- Replace core policies that previously queried user_roles directly.
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.has_permission(auth.uid(), 'admin.users')
  );

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin
  on public.profiles for delete to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'));

drop policy if exists profiles_insert_authenticated on public.profiles;
create policy profiles_insert_authenticated
  on public.profiles for insert to authenticated
  with check (id = auth.uid());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists members_select_authenticated on public.members;
create policy members_select_authenticated
  on public.members for select to authenticated
  using (
    auth_user_id = auth.uid()
    or public.has_permission(auth.uid(), 'members.view')
    or public.has_permission(auth.uid(), 'admin.users')
  );

drop policy if exists members_insert_admin on public.members;
create policy members_insert_admin
  on public.members for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL']));

drop policy if exists members_update_admin on public.members;
create policy members_update_admin
  on public.members for update to authenticated
  using (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL']))
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL']));

drop policy if exists members_delete_admin on public.members;
create policy members_delete_admin
  on public.members for delete to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'));

drop policy if exists guardians_select_authenticated on public.guardians;
create policy guardians_select_authenticated
  on public.guardians for select to authenticated
  using (
    public.has_permission(auth.uid(), 'members.view')
    or public.has_permission(auth.uid(), 'admin.users')
  );

drop policy if exists guardians_insert_trener_admin on public.guardians;
create policy guardians_insert_trener_admin
  on public.guardians for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));

drop policy if exists guardians_update_trener_admin on public.guardians;
create policy guardians_update_trener_admin
  on public.guardians for update to authenticated
  using (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']))
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));

drop policy if exists guardians_delete_admin on public.guardians;
create policy guardians_delete_admin
  on public.guardians for delete to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'));

drop policy if exists roles_manage_admin on public.roles;
create policy roles_manage_admin
  on public.roles for all to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'))
  with check (public.has_role(auth.uid(), 'ADMIN'));

drop policy if exists permissions_manage_admin on public.permissions;
create policy permissions_manage_admin
  on public.permissions for all to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'))
  with check (public.has_role(auth.uid(), 'ADMIN'));

drop policy if exists role_permissions_manage_admin on public.role_permissions;
create policy role_permissions_manage_admin
  on public.role_permissions for all to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'))
  with check (public.has_role(auth.uid(), 'ADMIN'));

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin
  on public.audit_log for select to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'));

drop policy if exists audit_log_insert_all on public.audit_log;
create policy audit_log_insert_all
  on public.audit_log for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists calendar_events_select_authenticated on public.calendar_events;
create policy calendar_events_select_authenticated
  on public.calendar_events for select to authenticated
  using (public.has_permission(auth.uid(), 'calendar.view'));
drop policy if exists calendar_events_insert_manage on public.calendar_events;
create policy calendar_events_insert_manage
  on public.calendar_events for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));
drop policy if exists calendar_events_update_manage on public.calendar_events;
create policy calendar_events_update_manage
  on public.calendar_events for update to authenticated
  using (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']))
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));
drop policy if exists calendar_events_delete_admin on public.calendar_events;
create policy calendar_events_delete_admin
  on public.calendar_events for delete to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'));

drop policy if exists announcements_insert_send on public.announcements;
create policy announcements_insert_send
  on public.announcements for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL']));
drop policy if exists announcements_update_send on public.announcements;
create policy announcements_update_send
  on public.announcements for update to authenticated
  using (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL']))
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL']));
drop policy if exists announcements_delete_admin on public.announcements;
create policy announcements_delete_admin
  on public.announcements for delete to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'));

drop policy if exists meetings_select_authenticated on public.meetings;
create policy meetings_select_authenticated
  on public.meetings for select to authenticated
  using (public.has_permission(auth.uid(), 'calendar.view'));
drop policy if exists meetings_insert_manage on public.meetings;
create policy meetings_insert_manage
  on public.meetings for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));
drop policy if exists meetings_update_manage on public.meetings;
create policy meetings_update_manage
  on public.meetings for update to authenticated
  using (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']))
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));
drop policy if exists meetings_delete_admin on public.meetings;
create policy meetings_delete_admin
  on public.meetings for delete to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'));

drop policy if exists work_parties_select_authenticated on public.work_parties;
create policy work_parties_select_authenticated
  on public.work_parties for select to authenticated
  using (public.has_permission(auth.uid(), 'calendar.view'));
drop policy if exists work_parties_insert_manage on public.work_parties;
create policy work_parties_insert_manage
  on public.work_parties for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));
drop policy if exists work_parties_update_manage on public.work_parties;
create policy work_parties_update_manage
  on public.work_parties for update to authenticated
  using (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']))
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));
drop policy if exists work_parties_delete_admin on public.work_parties;
create policy work_parties_delete_admin
  on public.work_parties for delete to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'));

drop policy if exists member_courses_select_authenticated on public.member_courses;
create policy member_courses_select_authenticated
  on public.member_courses for select to authenticated
  using (public.has_permission(auth.uid(), 'members.view'));
drop policy if exists member_courses_insert_authorized on public.member_courses;
create policy member_courses_insert_authorized
  on public.member_courses for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));
drop policy if exists member_courses_update_authorized on public.member_courses;
create policy member_courses_update_authorized
  on public.member_courses for update to authenticated
  using (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']))
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));
drop policy if exists member_courses_delete_admin on public.member_courses;
create policy member_courses_delete_admin
  on public.member_courses for delete to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'));

drop policy if exists insert_members_edit_role on public.member_driving_licenses;
create policy insert_members_edit_role
  on public.member_driving_licenses for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));
drop policy if exists update_members_edit_role on public.member_driving_licenses;
create policy update_members_edit_role
  on public.member_driving_licenses for update to authenticated
  using (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']))
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));
drop policy if exists delete_admin_only on public.member_driving_licenses;
create policy delete_admin_only
  on public.member_driving_licenses for delete to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'));
drop policy if exists select_authenticated_users on public.member_driving_licenses;
create policy select_authenticated_users
  on public.member_driving_licenses for select to authenticated
  using (public.has_permission(auth.uid(), 'members.view'));

drop policy if exists insert_members_edit_role on public.member_documents;
create policy insert_members_edit_role
  on public.member_documents for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));
drop policy if exists update_members_edit_role on public.member_documents;
create policy update_members_edit_role
  on public.member_documents for update to authenticated
  using (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']))
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));
drop policy if exists delete_admin_only on public.member_documents;
create policy delete_admin_only
  on public.member_documents for delete to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'));
drop policy if exists select_authenticated_users on public.member_documents;
create policy select_authenticated_users
  on public.member_documents for select to authenticated
  using (public.has_permission(auth.uid(), 'members.view'));

drop policy if exists select_own_or_admin on public.expiry_notifications;
create policy select_own_or_admin
  on public.expiry_notifications for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'ADMIN'));
drop policy if exists insert_admin_only on public.expiry_notifications;
create policy insert_admin_only
  on public.expiry_notifications for insert to authenticated
  with check (public.has_role(auth.uid(), 'ADMIN'));
drop policy if exists update_user_viewed_or_admin on public.expiry_notifications;
create policy update_user_viewed_or_admin
  on public.expiry_notifications for update to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'ADMIN'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'ADMIN'));
drop policy if exists delete_admin_only on public.expiry_notifications;
create policy delete_admin_only
  on public.expiry_notifications for delete to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'));

drop policy if exists trainings_update_admin on public.trainings;
create policy trainings_update_admin
  on public.trainings for update to authenticated
  using (public.has_permission(auth.uid(), 'training.edit'));
drop policy if exists trainings_delete_admin on public.trainings;
create policy trainings_delete_admin
  on public.trainings for delete to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'));

drop policy if exists org_documents_select on public.organization_documents;
create policy org_documents_select
  on public.organization_documents for select to authenticated
  using (
    public.has_permission(auth.uid(), 'documents.view')
    and (category <> 'FINANCE' or public.has_permission(auth.uid(), 'finance.view'))
  );
drop policy if exists org_documents_insert on public.organization_documents;
create policy org_documents_insert
  on public.organization_documents for insert to authenticated
  with check (
    public.has_permission(auth.uid(), 'documents.upload')
    and (category <> 'FINANCE' or public.has_permission(auth.uid(), 'finance.create'))
  );
drop policy if exists org_documents_update on public.organization_documents;
create policy org_documents_update
  on public.organization_documents for update to authenticated
  using (
    public.has_permission(auth.uid(), 'documents.upload')
    and (category <> 'FINANCE' or public.has_permission(auth.uid(), 'finance.edit'))
  )
  with check (
    public.has_permission(auth.uid(), 'documents.upload')
    and (category <> 'FINANCE' or public.has_permission(auth.uid(), 'finance.edit'))
  );
drop policy if exists org_documents_delete on public.organization_documents;
create policy org_documents_delete
  on public.organization_documents for delete to authenticated
  using (
    public.has_permission(auth.uid(), 'documents.upload')
    and (category <> 'FINANCE' or public.has_permission(auth.uid(), 'finance.edit'))
  );

drop policy if exists org_documents_file_select on storage.objects;
create policy org_documents_file_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'org_documents'
    and exists (
      select 1
      from public.organization_documents d
      where d.storage_path = name
        and public.has_permission(auth.uid(), 'documents.view')
        and (d.category <> 'FINANCE' or public.has_permission(auth.uid(), 'finance.view'))
    )
  );
drop policy if exists org_documents_file_insert on storage.objects;
create policy org_documents_file_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'org_documents'
    and public.has_permission(auth.uid(), 'documents.upload')
    and (
      (name like 'finance/%' and public.has_permission(auth.uid(), 'finance.create'))
      or (name not like 'finance/%')
    )
  );
drop policy if exists org_documents_file_delete on storage.objects;
create policy org_documents_file_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'org_documents'
    and (
      public.has_permission(auth.uid(), 'finance.edit')
      or (
        public.has_permission(auth.uid(), 'documents.upload')
        and not exists (
          select 1
          from public.organization_documents d
          where d.storage_path = name
            and d.category = 'FINANCE'
        )
      )
    )
  );

drop policy if exists committee_messages_select on public.committee_messages;
create policy committee_messages_select
  on public.committee_messages for select to authenticated
  using (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE']));
drop policy if exists committee_messages_insert on public.committee_messages;
create policy committee_messages_insert
  on public.committee_messages for insert to authenticated
  with check (
    public.has_permission(auth.uid(), 'communication.send')
    and (
      author_member_id is null
      or author_member_id = public.current_member_id()
    )
  );
drop policy if exists committee_messages_update on public.committee_messages;
create policy committee_messages_update
  on public.committee_messages for update to authenticated
  using (
    author_member_id = public.current_member_id()
    and public.has_permission(auth.uid(), 'communication.send')
  )
  with check (
    author_member_id = public.current_member_id()
    and public.has_permission(auth.uid(), 'communication.send')
  );
drop policy if exists committee_messages_delete on public.committee_messages;
create policy committee_messages_delete
  on public.committee_messages for delete to authenticated
  using (
    public.has_role(auth.uid(), 'ADMIN')
    or (
      author_member_id = public.current_member_id()
      and public.has_permission(auth.uid(), 'communication.send')
    )
  );

drop policy if exists member_access_codes_select on public.member_access_codes;
create policy member_access_codes_select
  on public.member_access_codes for select to authenticated
  using (public.has_any_role(auth.uid(), array['ADMIN','VELITEL']));
drop policy if exists member_access_codes_all on public.member_access_codes;
create policy member_access_codes_all
  on public.member_access_codes for all to authenticated
  using (public.has_any_role(auth.uid(), array['ADMIN','VELITEL']))
  with check (public.has_any_role(auth.uid(), array['ADMIN','VELITEL']));
revoke all on public.member_access_codes from public, anon, authenticated;
grant select (user_id) on public.member_access_codes to authenticated;

drop policy if exists member_access_migration_unresolved_select_auth
  on public.member_access_migration_unresolved;
revoke all on public.member_access_migration_unresolved
  from public, anon, authenticated;

drop policy if exists user_roles_select_authenticated on public.user_roles;
drop policy if exists user_roles_manage_admin on public.user_roles;
drop policy if exists user_permissions_select_authenticated on public.user_permissions;
drop policy if exists user_permissions_manage_admin on public.user_permissions;
drop policy if exists user_permission_denials_select_authenticated on public.user_permission_denials;
drop policy if exists user_permission_denials_manage_admin on public.user_permission_denials;
drop policy if exists invitation_permissions_select_authenticated on public.invitation_permissions;
drop policy if exists invitation_permissions_manage_admin on public.invitation_permissions;

revoke all on public.user_roles, public.user_permissions, public.user_permission_denials
  from public, anon, authenticated;
revoke all on public.invitation_permissions from public, anon, authenticated;

drop policy if exists member_guardians_select_authenticated on public.member_guardians;
create policy member_guardians_select_authenticated
  on public.member_guardians for select to authenticated
  using (
    public.has_permission(auth.uid(), 'members.view')
    or public.has_permission(auth.uid(), 'admin.users')
  );

drop policy if exists member_guardians_insert_trener_admin on public.member_guardians;
create policy member_guardians_insert_trener_admin
  on public.member_guardians for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));

drop policy if exists member_guardians_update_trener_admin on public.member_guardians;
create policy member_guardians_update_trener_admin
  on public.member_guardians for update to authenticated
  using (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']))
  with check (public.has_any_role(auth.uid(), array['ADMIN','VEDENIE','VELITEL','TRENER']));

drop policy if exists member_guardians_delete_admin on public.member_guardians;
create policy member_guardians_delete_admin
  on public.member_guardians for delete to authenticated
  using (public.has_role(auth.uid(), 'ADMIN'));

-- The single-role profile remains the authorization role. Organizational
-- functions below are separate and do not imply permissions.
create table if not exists public.member_organizational_function_catalog (
  code text primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into public.member_organizational_function_catalog (code, name)
values
  ('TREASURER', 'Pokladník'),
  ('TRAINER', 'Tréner'),
  ('ENGINE_OPERATOR', 'Strojník'),
  ('BOARD_MEMBER', 'Člen výboru')
on conflict (code) do nothing;

create table if not exists public.member_organizational_functions (
  member_id uuid not null references public.members(id) on delete cascade,
  function_code text not null references public.member_organizational_function_catalog(code) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  primary key (member_id, function_code)
);

create index if not exists idx_member_organizational_functions_code
  on public.member_organizational_functions (function_code, member_id);

alter table public.member_organizational_function_catalog enable row level security;
alter table public.member_organizational_functions enable row level security;

drop policy if exists member_org_function_catalog_read on public.member_organizational_function_catalog;
create policy member_org_function_catalog_read
  on public.member_organizational_function_catalog for select to authenticated
  using (true);

drop policy if exists member_org_functions_read on public.member_organizational_functions;
create policy member_org_functions_read
  on public.member_organizational_functions for select to authenticated
  using (
    member_id = public.current_member_id()
    or public.member_has_permission(public.current_member_id(), 'admin.users')
    or public.member_has_role(public.current_member_id(), 'ADMIN')
    or public.member_has_role(public.current_member_id(), 'VELITEL')
  );

drop policy if exists member_org_functions_manage on public.member_organizational_functions;
create policy member_org_functions_manage
  on public.member_organizational_functions for all to authenticated
  using (
    member_id <> public.current_member_id()
    and public.member_has_permission(public.current_member_id(), 'admin.users')
  )
  with check (
    member_id <> public.current_member_id()
    and public.member_has_permission(public.current_member_id(), 'admin.users')
    and assigned_by = auth.uid()
  );

revoke all on public.member_organizational_function_catalog,
  public.member_organizational_functions from anon, public;
grant select on public.member_organizational_function_catalog,
  public.member_organizational_functions to authenticated;
grant insert, delete on public.member_organizational_functions to authenticated;
grant all on public.member_organizational_function_catalog,
  public.member_organizational_functions to service_role;

-- Access tables are readable only by the member or a user manager. Changes
-- must go through the checked, atomic RPC below.
drop policy if exists member_access_profiles_select_authenticated on public.member_access_profiles;
create policy member_access_profiles_select_authenticated
  on public.member_access_profiles for select to authenticated
  using (
    member_id = public.current_member_id()
    or public.member_has_permission(public.current_member_id(), 'admin.users')
    or public.member_has_role(public.current_member_id(), 'ADMIN')
    or public.member_has_role(public.current_member_id(), 'VELITEL')
  );
drop policy if exists member_access_profiles_manage_admin on public.member_access_profiles;

drop policy if exists member_permission_grants_select_authenticated on public.member_permission_grants;
create policy member_permission_grants_select_authenticated
  on public.member_permission_grants for select to authenticated
  using (
    member_id = public.current_member_id()
    or public.member_has_permission(public.current_member_id(), 'admin.users')
    or public.member_has_role(public.current_member_id(), 'ADMIN')
  );
drop policy if exists member_permission_grants_manage_admin on public.member_permission_grants;

drop policy if exists member_permission_denials_select_authenticated on public.member_permission_denials;
create policy member_permission_denials_select_authenticated
  on public.member_permission_denials for select to authenticated
  using (
    member_id = public.current_member_id()
    or public.member_has_permission(public.current_member_id(), 'admin.users')
    or public.member_has_role(public.current_member_id(), 'ADMIN')
    or public.member_has_role(public.current_member_id(), 'VELITEL')
  );
drop policy if exists member_permission_denials_manage_admin on public.member_permission_denials;

revoke insert, update, delete on public.member_access_profiles,
  public.member_permission_grants, public.member_permission_denials
  from authenticated;
grant select on public.member_access_profiles,
  public.member_permission_grants, public.member_permission_denials
  to authenticated;

create or replace function public.set_member_access_member(
  p_member_id uuid,
  p_role_code text,
  p_grant_permissions text[] default '{}',
  p_deny_permissions text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_member_id uuid;
  v_role_id uuid;
  v_old_role text;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  v_caller_member_id := public.current_member_id();
  if v_caller_member_id is null then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;
  if p_member_id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_member');
  end if;
  if p_member_id = v_caller_member_id then
    return jsonb_build_object('success', false, 'error', 'self_escalation');
  end if;
  if not public.member_has_permission(v_caller_member_id, 'admin.users')
     and not public.member_has_role(v_caller_member_id, 'ADMIN') then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;
  if p_role_code = 'ADMIN'
     and not public.member_has_role(v_caller_member_id, 'ADMIN') then
    return jsonb_build_object('success', false, 'error', 'admin_role_restricted');
  end if;
  if p_grant_permissions is null or p_deny_permissions is null then
    return jsonb_build_object('success', false, 'error', 'invalid_permission');
  end if;

  if not exists (select 1 from public.members m where m.id = p_member_id) then
    return jsonb_build_object('success', false, 'error', 'member_not_found');
  end if;

  select r.code into v_old_role
  from public.member_access_profiles map
  join public.roles r on r.id = map.role_id
  where map.member_id = p_member_id;

  if (p_role_code = 'ADMIN' or v_old_role = 'ADMIN')
     and not public.member_has_role(v_caller_member_id, 'ADMIN') then
    return jsonb_build_object('success', false, 'error', 'admin_role_restricted');
  end if;

  select r.id into v_role_id
  from public.roles r
  where r.code = p_role_code;
  if v_role_id is null then
    return jsonb_build_object('success', false, 'error', 'unknown_role');
  end if;

  if exists (
    select 1 from unnest(p_grant_permissions) g(code)
    where not exists (select 1 from public.permissions p where p.code = g.code)
  ) or exists (
    select 1 from unnest(p_deny_permissions) d(code)
    where not exists (select 1 from public.permissions p where p.code = d.code)
  ) then
    return jsonb_build_object('success', false, 'error', 'invalid_permission');
  end if;

  if exists (
    select 1 from unnest(p_grant_permissions) g(code)
    where g.code like 'admin.%'
  ) then
    return jsonb_build_object('success', false, 'error', 'admin_permission_restricted');
  end if;

  if exists (
    select 1
    from unnest(p_grant_permissions) g(code)
    where (g.code = 'finance.view'
           and p_role_code not in ('ADMIN', 'VEDENIE', 'POKLADNIK'))
       or (g.code in ('finance.create', 'finance.edit', 'finance.export')
           and p_role_code not in ('ADMIN', 'POKLADNIK'))
       or (g.code = 'finance.manage_access' and p_role_code <> 'ADMIN')
  ) then
    return jsonb_build_object('success', false, 'error', 'finance_access_restricted');
  end if;

  insert into public.member_access_profiles (member_id, role_id, updated_at, changed_by)
  values (p_member_id, v_role_id, now(), v_uid)
  on conflict (member_id) do update
  set role_id = excluded.role_id,
      status = 'active',
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

alter function public.set_member_access_member(uuid, text, text[], text[]) owner to postgres;
revoke all on function public.set_member_access_member(uuid, text, text[], text[]) from public, anon, service_role;
grant execute on function public.set_member_access_member(uuid, text, text[], text[]) to authenticated;

-- Enforce the financial role boundaries in the permission catalog itself.
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and p.code like 'finance.%'
  and (
    (p.code = 'finance.view' and r.code not in ('ADMIN', 'VEDENIE', 'POKLADNIK'))
    or (p.code in ('finance.create', 'finance.edit', 'finance.export')
        and r.code not in ('ADMIN', 'POKLADNIK'))
    or (p.code = 'finance.manage_access' and r.code <> 'ADMIN')
  );

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'ADMIN'
on conflict (role_id, permission_id) do nothing;

delete from public.member_permission_grants mg
using public.permissions p
where mg.permission_id = p.id
  and p.code like 'finance.%'
  and not exists (
    select 1
    from public.member_access_profiles map
    join public.roles r on r.id = map.role_id
    where map.member_id = mg.member_id
      and (
        (p.code = 'finance.view' and r.code in ('ADMIN', 'VEDENIE', 'POKLADNIK'))
        or (p.code in ('finance.create', 'finance.edit', 'finance.export')
            and r.code in ('ADMIN', 'POKLADNIK'))
        or (p.code = 'finance.manage_access' and r.code = 'ADMIN')
      )
  );

delete from public.member_permission_grants mg
using public.permissions p
where mg.permission_id = p.id
  and p.code like 'admin.%';

-- Role/permission catalogs and legacy access tables are not client-writable.
do $$
begin
  if exists (
    select 1
    from public.user_roles ur
    left join public.members m on m.auth_user_id = ur.user_id
    where m.id is null
  ) then
    raise exception 'Unlinked legacy user_roles must be resolved before cutover';
  end if;
  if exists (
    select 1
    from public.user_roles ur
    group by ur.user_id
    having count(distinct ur.role_id) > 1
  ) then
    raise exception 'Members with multiple legacy access roles require manual resolution';
  end if;
  if exists (
    select 1
    from public.user_roles ur
    join public.members m on m.auth_user_id = ur.user_id
    left join public.member_access_profiles map
      on map.member_id = m.id and map.role_id = ur.role_id
    where map.member_id is null
  ) then
    raise exception 'Legacy roles do not match member_access_profiles; resolve before cutover';
  end if;
  if exists (
    select 1
    from public.user_permissions up
    left join public.members m on m.auth_user_id = up.user_id
    where m.id is null
  ) then
    raise exception 'Unlinked legacy user_permissions must be resolved before cutover';
  end if;
  if exists (
    select 1
    from public.user_permissions up
    join public.members m on m.auth_user_id = up.user_id
    left join public.member_permission_grants mg
      on mg.member_id = m.id and mg.permission_id = up.permission_id
    where mg.member_id is null
  ) then
    raise exception 'Legacy permission grants must be migrated before cutover';
  end if;
  if exists (
    select 1
    from public.user_permission_denials ud
    left join public.members m on m.auth_user_id = ud.user_id
    where m.id is null
  ) then
    raise exception 'Unlinked legacy user_permission_denials must be resolved before cutover';
  end if;
  if exists (
    select 1
    from public.user_permission_denials ud
    join public.members m on m.auth_user_id = ud.user_id
    left join public.member_permission_denials md
      on md.member_id = m.id and md.permission_id = ud.permission_id
    where md.member_id is null
  ) then
    raise exception 'Legacy permission denials must be migrated before cutover';
  end if;
  if exists (
    select 1
    from public.invitations i
    left join public.members m on m.id = i.member_id
    where i.status = 'active'
      and (
        i.member_id is null
        or i.max_uses <> 1
        or i.use_count >= i.max_uses
        or m.id is null
        or m.status <> 'active'
        or m.auth_user_id is not null
        or (
          i.target_email is not null
          and m.email is not null
          and lower(btrim(i.target_email)) <> lower(btrim(m.email))
        )
      )
  ) then
    raise exception 'Active invitations must be single-use and bound to an active unlinked member';
  end if;
  if exists (
    select 1
    from public.invitations i
    where i.status = 'active'
    group by i.member_id
    having count(*) > 1
  ) then
    raise exception 'Multiple active invitations for a member must be resolved before cutover';
  end if;
end;
$$;

create unique index if not exists invitations_one_active_per_member
  on public.invitations (member_id)
  where status = 'active';

revoke insert, update, delete on public.roles, public.permissions,
  public.role_permissions
  from authenticated;

drop policy if exists user_roles_select_authenticated on public.user_roles;
drop policy if exists user_permissions_select_authenticated on public.user_permissions;
drop policy if exists user_permission_denials_select_authenticated on public.user_permission_denials;
drop policy if exists user_permission_denials_manage_admin on public.user_permission_denials;
revoke all on public.user_roles, public.user_permissions, public.user_permission_denials
  from public, anon, authenticated;

-- Disable older RPCs that mutate the legacy role/grant tables.
revoke all on function public.set_member_access(uuid, text, text[], text[])
  from public, anon, authenticated, service_role;
revoke all on function public.set_user_role_atomic(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.is_email_login_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from auth.users u
    join public.members m on m.auth_user_id = u.id
    left join public.member_access_profiles map on map.member_id = m.id
    left join public.roles r on r.id = map.role_id
    where lower(btrim(u.email)) = lower(btrim(p_email))
      and m.auth_user_id is not null
      and (
        m.status = 'active'
        or (map.status = 'active' and r.code = 'ADMIN')
      )
  );
$$;

alter function public.is_email_login_allowed(text) owner to postgres;
revoke all on function public.is_email_login_allowed(text) from public;
grant execute on function public.is_email_login_allowed(text) to anon, authenticated;

create or replace function public.resolve_access_code(p_code text)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_normalized text := lower(btrim(coalesce(p_code, '')));
  v_email text;
begin
  if length(v_normalized) < 32 then
    return null;
  end if;

  select u.email into v_email
  from public.member_access_codes mac
  join auth.users u on u.id = mac.user_id
  join public.members m on m.auth_user_id = u.id
  where mac.code_hash = encode(extensions.digest(v_normalized::bytea, 'sha256'), 'hex')
    and m.status = 'active'
    and u.email is not null
  limit 1;
  return v_email;
end;
$$;

alter function public.resolve_access_code(text) owner to postgres;
revoke all on function public.resolve_access_code(text) from public;
grant execute on function public.resolve_access_code(text) to anon, authenticated;

create unique index if not exists member_access_codes_code_hash_unique
  on public.member_access_codes (code_hash);

drop function if exists public.create_invitation(
  text, text, timestamptz, text, uuid, integer, text
);

create or replace function public.create_invitation(
  p_role_code text,
  p_code_hash text,
  p_expires_at timestamptz,
  p_target_email text default null,
  p_member_id uuid default null,
  p_max_uses integer default 1,
  p_notes text default null,
  p_permission_codes text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_role_id uuid;
  v_invitation_id uuid;
  v_member_email text;
begin
  if v_uid is null or not public.has_permission(v_uid, 'admin.users') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_role_code is null
     or p_role_code not in ('ADMIN','VEDENIE','VELITEL','POKLADNIK','TRENER','CLEN','RODIC') then
    raise exception 'Unknown role code' using errcode = '22023';
  end if;
  if p_role_code = 'ADMIN' and not public.has_role(v_uid, 'ADMIN') then
    raise exception 'Only an ADMIN may invite an ADMIN' using errcode = '42501';
  end if;
  if p_member_id is null or p_member_id = public.current_member_id() then
    raise exception 'Invitation must target another member' using errcode = '22023';
  end if;
  select m.email into v_member_email
  from public.members m
  where m.id = p_member_id
    and m.status = 'active'
    and m.auth_user_id is null;
  if not found then
    raise exception 'Invitation target must be an active unlinked member' using errcode = '22023';
  end if;
  if nullif(lower(btrim(coalesce(p_target_email, ''))), '') is not null
     and v_member_email is not null
     and lower(btrim(p_target_email)) <> lower(btrim(v_member_email)) then
    raise exception 'Invitation email must match the member record' using errcode = '22023';
  end if;
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation code hash' using errcode = '22023';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'Expiration must be in the future' using errcode = '22023';
  end if;
  if p_max_uses is distinct from 1 then
    raise exception 'Invitation codes must be single-use' using errcode = '22023';
  end if;
  if p_permission_codes is null then
    raise exception 'Invalid invitation permissions' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(p_permission_codes) requested(code)
    where not exists (
      select 1 from public.permissions p where p.code = requested.code
    )
      or requested.code like 'admin.%'
      or (
        requested.code = 'finance.view'
        and p_role_code not in ('ADMIN','VEDENIE','POKLADNIK')
      )
      or (
        requested.code in ('finance.create','finance.edit','finance.export')
        and p_role_code not in ('ADMIN','POKLADNIK')
      )
      or (
        requested.code = 'finance.manage_access'
        and p_role_code <> 'ADMIN'
      )
  ) then
    raise exception 'Invitation permission is not allowed for this role'
      using errcode = '42501';
  end if;

  select r.id into v_role_id
  from public.roles r
  where r.code = p_role_code;
  if v_role_id is null then
    raise exception 'Role does not exist' using errcode = '23503';
  end if;

  update public.invitations
  set status = 'revoked', updated_at = now()
  where member_id = p_member_id and status = 'active';

  insert into public.invitations (
    code_hash, role, max_uses, use_count, expires_at, created_by,
    target_email, member_id, status, notes
  ) values (
    lower(btrim(p_code_hash)), p_role_code, 1, 0, p_expires_at, v_uid,
    coalesce(
      nullif(lower(btrim(coalesce(p_target_email, ''))), ''),
      nullif(lower(btrim(coalesce(v_member_email, ''))), '')
    ),
    p_member_id, 'active', nullif(btrim(p_notes), '')
  )
  returning id into v_invitation_id;

  insert into public.invitation_permissions (invitation_id, permission_id)
  select v_invitation_id, p.id
  from public.permissions p
  where p.code = any(p_permission_codes)
  on conflict do nothing;

  return v_invitation_id;
end;
$$;

alter function public.create_invitation(text, text, timestamptz, text, uuid, integer, text, text[])
  owner to postgres;
revoke all on function public.create_invitation(text, text, timestamptz, text, uuid, integer, text, text[])
  from public, anon, service_role;
grant execute on function public.create_invitation(text, text, timestamptz, text, uuid, integer, text, text[])
  to authenticated;

create or replace function public.set_member_access_code(p_user_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (
    public.has_role(v_uid, 'ADMIN')
    or public.has_role(v_uid, 'VELITEL')
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'Invalid target user' using errcode = '22023';
  end if;
  if length(v_code) < 32 or length(v_code) > 128 or v_code !~ '^[A-Z0-9-]+$' then
    raise exception 'Access code must be a high-entropy token' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.members m
    where m.auth_user_id = p_user_id and m.status = 'active'
  ) then
    raise exception 'Active member account not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1
    from public.members m
    join public.member_access_profiles map on map.member_id = m.id
    join public.roles r on r.id = map.role_id
    where m.auth_user_id = p_user_id
      and map.status = 'active'
      and r.code = 'ADMIN'
  ) and not public.has_role(v_uid, 'ADMIN') then
    raise exception 'Only an ADMIN may reset an ADMIN access code' using errcode = '42501';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(v_code, extensions.gen_salt('bf', 10)),
      updated_at = now()
  where id = p_user_id;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  insert into public.member_access_codes (user_id, code_hash, created_by)
  values (
    p_user_id,
    encode(extensions.digest(lower(v_code)::bytea, 'sha256'), 'hex'),
    v_uid
  )
  on conflict (user_id) do update
  set code_hash = excluded.code_hash,
      created_by = excluded.created_by,
      updated_at = now();

  return v_code;
end;
$$;

alter function public.set_member_access_code(uuid, text) owner to postgres;
revoke all on function public.set_member_access_code(uuid, text) from public, anon, service_role;
grant execute on function public.set_member_access_code(uuid, text) to authenticated;

-- Direct client updates cannot change the auth link or mark onboarding complete.
create or replace function public.guard_member_auth_fields()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if current_user not in ('postgres', 'service_role')
       and (
         new.auth_user_id is not null
         or new.onboarding_completed is distinct from false
       ) then
      raise exception 'Protected member fields cannot be set directly'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if current_user not in ('postgres', 'service_role')
     and (
       new.auth_user_id is distinct from old.auth_user_id
       or new.onboarding_completed is distinct from old.onboarding_completed
     ) then
    raise exception 'Protected member fields cannot be changed directly'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

alter function public.guard_member_auth_fields() owner to postgres;
drop trigger if exists members_guard_auth_fields on public.members;
create trigger members_guard_auth_fields
  before insert or update on public.members
  for each row execute function public.guard_member_auth_fields();

-- Only an existing ADMIN may create an invitation that carries ADMIN access.
create or replace function public.guard_admin_invitation_creation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.member_id is null or not exists (
    select 1
    from public.members m
    where m.id = new.member_id
      and m.status = 'active'
      and m.auth_user_id is null
  ) then
    raise exception 'Invitation must target an active unlinked member'
      using errcode = '22023';
  end if;
  if new.target_email is not null and exists (
    select 1
    from public.members m
    where m.id = new.member_id
      and m.email is not null
      and lower(btrim(m.email)) <> lower(btrim(new.target_email))
  ) then
    raise exception 'Invitation email must match the member record'
      using errcode = '22023';
  end if;
  if auth.uid() is not null
     and new.created_by is distinct from auth.uid() then
    raise exception 'Invitation creator must match the authenticated user'
      using errcode = '42501';
  end if;
  if new.role = 'ADMIN'
     and not exists (
       select 1
       from public.members m
       join public.member_access_profiles map on map.member_id = m.id
       join public.roles r on r.id = map.role_id
       where m.auth_user_id = new.created_by
         and map.status = 'active'
         and r.code = 'ADMIN'
     ) then
    raise exception 'Only an ADMIN may create an ADMIN invitation'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

alter function public.guard_admin_invitation_creation() owner to postgres;
drop trigger if exists invitations_guard_admin_role on public.invitations;
create trigger invitations_guard_admin_role
  before insert or update of role, created_by, member_id on public.invitations
  for each row execute function public.guard_admin_invitation_creation();

create table if not exists public.invitation_claim_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  check (attempt_count >= 0)
);

alter table public.invitation_claim_attempts enable row level security;
revoke all on public.invitation_claim_attempts from public, anon, authenticated;

-- Claim is bound to the signed-in user and invitation member, links that member
-- once, and applies role and invitation grants in the same transaction.
create or replace function public.claim_invitation_code(
  p_code text,
  p_user_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_auth_email text;
  v_email_confirmed boolean;
  v_hash text;
  v_invitation public.invitations%rowtype;
  v_role_id uuid;
  v_member_auth_user_id uuid;
  v_attempt_count integer;
begin
  if v_uid is null or p_user_id is distinct from v_uid then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select u.email, u.email_confirmed_at is not null
  into v_auth_email, v_email_confirmed
  from auth.users u
  where u.id = v_uid;
  if v_auth_email is null or not coalesce(v_email_confirmed, false) then
    return jsonb_build_object('success', false, 'error', 'email_not_confirmed');
  end if;

  insert into public.invitation_claim_attempts as attempts
    (user_id, window_started_at, attempt_count)
  values (v_uid, now(), 1)
  on conflict (user_id) do update
  set window_started_at = case
        when attempts.window_started_at <= now() - interval '15 minutes'
          then now()
        else attempts.window_started_at
      end,
      attempt_count = case
        when attempts.window_started_at <= now() - interval '15 minutes'
          then 1
        else attempts.attempt_count + 1
      end;

  select a.attempt_count into v_attempt_count
  from public.invitation_claim_attempts a
  where a.user_id = v_uid;
  if v_attempt_count > 5 then
    return jsonb_build_object('success', false, 'error', 'rate_limited');
  end if;

  v_hash := encode(extensions.digest(
    upper(regexp_replace(btrim(coalesce(p_code, '')), '[^A-Za-z0-9-]', '', 'g'))::bytea,
    'sha256'
  ), 'hex');

  select i.* into v_invitation
  from public.invitations i
  where i.code_hash = v_hash
    and i.status = 'active'
    and i.use_count < i.max_uses
    and i.expires_at > now()
    and (
      i.target_email is null
      or lower(btrim(i.target_email)) = lower(btrim(v_auth_email))
    )
  for update;

  if not found then
    if exists (select 1 from public.invitations i where i.code_hash = v_hash) then
      return jsonb_build_object('success', false, 'error', 'code_unusable');
    end if;
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;
  if v_invitation.member_id is null then
    return jsonb_build_object('success', false, 'error', 'member_not_found');
  end if;
  if v_invitation.role = 'ADMIN'
     and not exists (
       select 1
       from public.members creator
       join public.member_access_profiles creator_access
         on creator_access.member_id = creator.id
       join public.roles creator_role on creator_role.id = creator_access.role_id
       where creator.auth_user_id = v_invitation.created_by
         and creator_access.status = 'active'
         and creator_role.code = 'ADMIN'
     ) then
    return jsonb_build_object('success', false, 'error', 'admin_role_restricted');
  end if;

  select m.auth_user_id into v_member_auth_user_id
  from public.members m
  where m.id = v_invitation.member_id
    and m.status = 'active'
  for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'member_not_found');
  end if;
  if v_member_auth_user_id is not null then
    return jsonb_build_object('success', false, 'error', 'member_already_linked');
  end if;

  select r.id into v_role_id
  from public.roles r
  where r.code = v_invitation.role;
  if v_role_id is null then
    raise exception 'Invitation references unknown role' using errcode = '23503';
  end if;

  if exists (
    select 1
    from public.invitation_permissions ip
    join public.permissions p on p.id = ip.permission_id
    where ip.invitation_id = v_invitation.id
      and (
        p.code like 'admin.%'
        or (p.code = 'finance.view'
            and v_invitation.role not in ('ADMIN', 'VEDENIE', 'POKLADNIK'))
        or (p.code in ('finance.create', 'finance.edit', 'finance.export')
            and v_invitation.role not in ('ADMIN', 'POKLADNIK'))
        or (p.code = 'finance.manage_access' and v_invitation.role <> 'ADMIN')
      )
  ) then
    return jsonb_build_object('success', false, 'error', 'permission_restricted');
  end if;

  update public.members
  set auth_user_id = v_uid
  where id = v_invitation.member_id
    and (auth_user_id is null or auth_user_id = v_uid);

  insert into public.member_access_profiles (member_id, role_id, changed_by)
  values (v_invitation.member_id, v_role_id, v_uid)
  on conflict (member_id) do update
  set role_id = excluded.role_id,
      status = 'active',
      updated_at = now(),
      changed_by = excluded.changed_by;

  insert into public.member_permission_grants (member_id, permission_id, granted_by)
  select v_invitation.member_id, ip.permission_id, v_uid
  from public.invitation_permissions ip
  where ip.invitation_id = v_invitation.id
  on conflict (member_id, permission_id) do nothing;

  update public.invitations
  set use_count = use_count + 1
  where id = v_invitation.id;

  insert into public.invitation_claims (invitation_id, user_id, email)
  values (v_invitation.id, v_uid, lower(btrim(v_auth_email)));

  insert into public.audit_log (user_id, action, module, entity_type, entity_id, new_data)
  values
    (v_uid, 'invitation.consumed', 'auth', 'invitation', v_invitation.id,
     jsonb_build_object('role', v_invitation.role)),
    (v_uid, 'invitation.role_assigned', 'auth', 'invitation', v_invitation.id,
     jsonb_build_object('role', v_invitation.role));

  return jsonb_build_object(
    'success', true,
    'invitation_id', v_invitation.id,
    'role', v_invitation.role
  );
end;
$$;

alter function public.claim_invitation_code(text, uuid, text) owner to postgres;
revoke all on function public.claim_invitation_code(text, uuid, text) from public, anon, service_role;
grant execute on function public.claim_invitation_code(text, uuid, text) to authenticated;

