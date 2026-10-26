-- Read-only verification for ADMIN permission sync
select
  (select count(*) from public.permissions where code in (
    'dashboard.view','members.view','members.create','members.edit','members.delete',
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
  )) as canonical_permissions_present,
  (select count(distinct rp.permission_id)
   from public.role_permissions rp
   join public.roles r on r.id = rp.role_id
   join public.permissions p on p.id = rp.permission_id
   where r.code = 'ADMIN'
     and p.code in (
       'dashboard.view','members.view','members.create','members.edit','members.delete',
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
  ) as admin_assigned_canonical_permissions,
  (select count(*) from public.role_permissions rp
   join public.roles r on r.id = rp.role_id
   group by r.code
   having r.code = 'ADMIN') as admin_role_permission_rows;