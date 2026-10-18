-- Migration: Fix Equipment Inspections Permission Routing
-- Date: 20261101
-- Purpose: Correct inspection RLS policies to use INSPECTION_VIEW/INSPECT ION_MANAGE
--          instead of VEHICLE_VIEW/VEHICLE_MANAGE for least-privilege access.
--
-- Context:
--   Migration 20261030 defined equipment_inspections RLS with vehicle.view/manage.
--   However, dedicated inspection.view and inspection.manage permissions exist
--   in the permission catalog (20261011_equipment_permissions.sql).
--   This causes:
--   1. Least-privilege violation: users with vehicle access can manage inspections
--   2. Navigation inconsistency: /inspections uses VEHICLE_VIEW in UI
--   3. Permission redundancy: INSPECTION_VIEW/MANAGE defined but unused
--
-- Action: Update RLS policies to use correct permissions.
-- Idempotency: Uses DROP IF EXISTS + CREATE; safe to re-run.

-- ============================================================================
-- 1. UPDATE EQUIPMENT_INSPECTIONS RLS POLICIES
-- ============================================================================

-- Drop old policies that use vehicle.view/manage
DROP POLICY IF EXISTS equipment_inspections_select_authenticated ON public.equipment_inspections;
DROP POLICY IF EXISTS equipment_inspections_insert_authenticated ON public.equipment_inspections;
DROP POLICY IF EXISTS equipment_inspections_update_authenticated ON public.equipment_inspections;
DROP POLICY IF EXISTS equipment_inspections_delete_authenticated ON public.equipment_inspections;

-- Create new policies using inspection.view/manage
CREATE POLICY equipment_inspections_select_authenticated
ON public.equipment_inspections FOR SELECT TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inspection.view'));

CREATE POLICY equipment_inspections_insert_authenticated
ON public.equipment_inspections FOR INSERT TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inspection.manage'));

CREATE POLICY equipment_inspections_update_authenticated
ON public.equipment_inspections FOR UPDATE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inspection.manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inspection.manage'));

CREATE POLICY equipment_inspections_delete_authenticated
ON public.equipment_inspections FOR DELETE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inspection.manage'));

-- ============================================================================
-- 2. VERIFICATION NOTE
-- ============================================================================

-- After applying this migration, also update application code:
--   File: src/config/navigation.ts
--   Change: /inspections permission from VEHICLE_VIEW -> INSPECTION_VIEW
--
--   File: src/lib/equipment/inspections.service.ts
--   Update: All requirePermission/assertPermission calls to use correct permissions
--       READ operations: INSPECTION_VIEW
--       WRITE operations: INSPECTION_MANAGE

-- ============================================================================
-- 3. TESTING NOTES
-- ============================================================================

-- Test 1: User with INSPECTION_VIEW but not VEHICLE_VIEW should:
--   - See /inspections menu item
--   - Read inspection records
--   - NOT see /vehicles menu item
--
-- Test 2: User with VEHICLE_VIEW but not INSPECTION_VIEW should:
--   - See /vehicles menu item
--   - NOT see /inspections menu item
--   - Fail to read/write inspections
--
-- Test 3: Verify RLS by querying as different roles:
--   SELECT current_user_id();
--   SELECT * FROM public.equipment_inspections
--   LIMIT 1;
-- Should return data only if user has inspection.view permission.
