-- Migration: synchronize ADMIN role permissions with canonical TS permission catalog
-- Date: 20261121
-- Forward-only, idempotent. No role assignment to users, no destructive changes.

do $$
declare
  v_role_id uuid;
  v_expected_count int := 53;
  v_actual_count int;
begin
  select r.id into v_role_id
  from public.roles r
  where r.code = 'ADMIN'
  limit 1;

  if v_role_id is null then
    raise exception 'ADMIN role does not exist in public.roles.';
  end if;

  -- Insert canonical permissions if missing
  insert into public.permissions (code, name, description)
  values
    ('dashboard.view', 'Dashboard', 'Zobrazenie dashboardu'),
    ('members.view', 'Členovia - zobrazenie', 'Zobrazenie členov'),
    ('members.create', 'Členovia - vytvorenie', 'Pridávanie členov'),
    ('members.edit', 'Členovia - úprava', 'Úprava členov'),
    ('members.delete', 'Členovia - zmazanie', 'Trvalé vymazanie členského záznamu'),
    ('training.view', 'Tréningy - zobrazenie', 'Zobrazenie tréningov'),
    ('training.create', 'Tréningy - vytvorenie', 'Vytvorenie tréningu'),
    ('training.edit', 'Tréningy - úprava', 'Úprava tréningu'),
    ('competition.view', 'Súťaže - zobrazenie', 'Zobrazenie súťaží'),
    ('competition.create', 'Súťaže - vytvorenie', 'Vytvorenie súťaže'),
    ('competition.edit', 'Súťaže - úprava', 'Úprava súťaže'),
    ('calendar.view', 'Kalendár - zobrazenie', 'Zobrazenie kalendára'),
    ('calendar.manage', 'Kalendár - správa', 'Správa kalendára'),
    ('announcements.view', 'Oznamy - zobrazenie', 'Zobrazenie oznamov'),
    ('announcements.create', 'Oznamy - vytvorenie', 'Vytvorenie oznamu'),
    ('announcements.edit', 'Oznamy - úprava', 'Úprava oznamu'),
    ('announcements.delete', 'Oznamy - zmazanie', 'Zmazanie oznamu'),
    ('meetings.view', 'Porady - zobrazenie', 'Zobrazenie porád'),
    ('meetings.create', 'Porady - vytvorenie', 'Vytvorenie porady'),
    ('meetings.edit', 'Porady - úprava', 'Úprava porady'),
    ('meetings.delete', 'Porady - zmazanie', 'Zmazanie porady'),
    ('work_parties.view', 'Brigády - zobrazenie', 'Zobrazenie brigád'),
    ('work_parties.create', 'Brigády - vytvorenie', 'Vytvorenie brigády'),
    ('work_parties.edit', 'Brigády - úprava', 'Úprava brigády'),
    ('work_parties.delete', 'Brigády - zmazanie', 'Zmazanie brigády'),
    ('inventory.view', 'Inventár - zobrazenie', 'Zobrazenie inventára'),
    ('inventory.create', 'Inventár - vytvorenie', 'Pridanie inventáru'),
    ('inventory.edit', 'Inventár - úprava', 'Úprava inventára'),
    ('inventory.manage', 'Inventár - správa', 'Správa inventára'),
    ('incidents.view', 'Incidenty - zobrazenie', 'Zobrazenie incidentov'),
    ('incidents.create', 'Incidenty - vytvorenie', 'Vytvorenie incidentu'),
    ('incidents.edit', 'Incidenty - úprava', 'Úprava incidentu'),
    ('incidents.delete', 'Incidenty - zmazanie', 'Zmazanie incidentu'),
    ('vehicle.view', 'Vozidlá - zobrazenie', 'Zobrazenie vozidiel'),
    ('vehicle.manage', 'Vozidlá - správa', 'Správa vozidiel'),
    ('fault.create', 'Poruchy - nahlásenie', 'Nahlásenie poruchy'),
    ('fault.manage', 'Poruchy - správa', 'Správa porúch'),
    ('inspection.view', 'Kontroly - zobrazenie', 'Zobrazenie kontrol'),
    ('inspection.manage', 'Kontroly - správa', 'Správa kontrol'),
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

  -- Idempotently grant all canonical permissions to ADMIN role
  insert into public.role_permissions (role_id, permission_id)
  select v_role_id, p.id
  from public.permissions p
  where p.code in (
    'dashboard.view',
    'members.view','members.create','members.edit','members.delete',
    'training.view','training.create','training.edit',
    'competition.view','competition.create','competition.edit',
    'calendar.view','calendar.manage',
    'announcements.view','announcements.create','announcements.edit','announcements.delete',
    'meetings.view','meetings.create','meetings.edit','meetings.delete',
    'work_parties.view','work_parties.create','work_parties.edit','work_parties.delete',
    'inventory.view','inventory.create','inventory.edit','inventory.manage',
    'incidents.view','incidents.create','incidents.edit','incidents.delete',
    'vehicle.view','vehicle.manage',
    'fault.create','fault.manage',
    'inspection.view','inspection.manage',
    'finance.view','finance.create','finance.edit','finance.export','finance.manage_access',
    'documents.view','documents.upload',
    'reports.view','reports.export',
    'communication.view','communication.send',
    'admin.users','admin.permissions','admin.audit'
  )
  on conflict (role_id, permission_id) do nothing;

  select count(distinct rp.permission_id)
    into v_actual_count
  from public.role_permissions rp
  join public.permissions p on p.id = rp.permission_id
  where rp.role_id = v_role_id
    and p.code in (
      'dashboard.view',
      'members.view','members.create','members.edit','members.delete',
      'training.view','training.create','training.edit',
      'competition.view','competition.create','competition.edit',
      'calendar.view','calendar.manage',
      'announcements.view','announcements.create','announcements.edit','announcements.delete',
      'meetings.view','meetings.create','meetings.edit','meetings.delete',
      'work_parties.view','work_parties.create','work_parties.edit','work_parties.delete',
      'inventory.view','inventory.create','inventory.edit','inventory.manage',
      'incidents.view','incidents.create','incidents.edit','incidents.delete',
      'vehicle.view','vehicle.manage',
      'fault.create','fault.manage',
      'inspection.view','inspection.manage',
      'finance.view','finance.create','finance.edit','finance.export','finance.manage_access',
      'documents.view','documents.upload',
      'reports.view','reports.export',
      'communication.view','communication.send',
      'admin.users','admin.permissions','admin.audit'
    );

  if v_actual_count <> v_expected_count then
    raise exception 'ADMIN permission sync incomplete: expected %, got %.', v_expected_count, v_actual_count;
  end if;
end
$$;