-- Read-only pre-migration check for ADMIN permission sync
-- Run manually in Supabase SQL Editor. No writes.

with canonical(code) as (
  values
    ('dashboard.view'),
    ('members.view'),('members.create'),('members.edit'),('members.delete'),
    ('training.view'),('training.create'),('training.edit'),
    ('competition.view'),('competition.create'),('competition.edit'),
    ('calendar.view'),('calendar.manage'),
    ('announcements.view'),('announcements.create'),('announcements.edit'),('announcements.delete'),
    ('meetings.view'),('meetings.create'),('meetings.edit'),('meetings.delete'),
    ('work_parties.view'),('work_parties.create'),('work_parties.edit'),('work_parties.delete'),
    ('inventory.view'),('inventory.create'),('inventory.edit'),('inventory.manage'),
    ('incidents.view'),('incidents.create'),('incidents.edit'),('incidents.delete'),
    ('vehicle.view'),('vehicle.manage'),
    ('fault.create'),('fault.manage'),
    ('inspection.view'),('inspection.manage'),
    ('finance.view'),('finance.create'),('finance.edit'),('finance.export'),('finance.manage_access'),
    ('documents.view'),('documents.upload'),
    ('reports.view'),('reports.export'),
    ('communication.view'),('communication.send'),
    ('admin.users'),('admin.permissions'),('admin.audit')
),
admin_role as (
  select id from public.roles where code = 'ADMIN'
),
missing_permissions as (
  select c.code
  from canonical c
  left join public.permissions p on p.code = c.code
  where p.id is null
),
unassigned as (
  select c.code
  from canonical c
  join public.permissions p on p.code = c.code
  where not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = (select id from admin_role)
      and rp.permission_id = p.id
  )
),
duplicates as (
  select code, count(*) as cnt
  from public.permissions
  group by code
  having count(*) > 1
)
select
  (select count(*) from admin_role) as admin_role_count,
  (select count(distinct code) from canonical) as canonical_count,
  (select count(*) from missing_permissions) as missing_permission_count,
  (select count(*) from unassigned) as unassigned_to_admin_count,
  (select count(*) from duplicates) as duplicate_permission_codes,
  case
    when (select count(*) from admin_role) = 1
     and (select count(*) from missing_permissions) = 0
     and (select count(*) from unassigned) = 0
     and (select count(*) from duplicates) = 0
    then 'PASS'
    else 'FAIL'
  end as precheck_status;

-- Missing permissions
select code from (
  values
    ('dashboard.view'),
    ('members.view'),('members.create'),('members.edit'),('members.delete'),
    ('training.view'),('training.create'),('training.edit'),
    ('competition.view'),('competition.create'),('competition.edit'),
    ('calendar.view'),('calendar.manage'),
    ('announcements.view'),('announcements.create'),('announcements.edit'),('announcements.delete'),
    ('meetings.view'),('meetings.create'),('meetings.edit'),('meetings.delete'),
    ('work_parties.view'),('work_parties.create'),('work_parties.edit'),('work_parties.delete'),
    ('inventory.view'),('inventory.create'),('inventory.edit'),('inventory.manage'),
    ('incidents.view'),('incidents.create'),('incidents.edit'),('incidents.delete'),
    ('vehicle.view'),('vehicle.manage'),
    ('fault.create'),('fault.manage'),
    ('inspection.view'),('inspection.manage'),
    ('finance.view'),('finance.create'),('finance.edit'),('finance.export'),('finance.manage_access'),
    ('documents.view'),('documents.upload'),
    ('reports.view'),('reports.export'),
    ('communication.view'),('communication.send'),
    ('admin.users'),('admin.permissions'),('admin.audit')
) as c(code)
where not exists (select 1 from public.permissions p where p.code = c.code);

-- Existing permissions not assigned to ADMIN
select p.code
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
and not exists (
  select 1 from public.role_permissions rp
  join public.roles r on r.id = rp.role_id
  where r.code = 'ADMIN' and rp.permission_id = p.id
);