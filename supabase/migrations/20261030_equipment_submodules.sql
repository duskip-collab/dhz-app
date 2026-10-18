-- Migration: Equipment submodules (Technika - rozsirenie)
-- Date: 20261030
-- Purpose: Vyzbroj vozidiel, Poruchy, Revizie/inspekcie, Inventarizacie.
--          Rozsiruje equipment_module o 5 tabuliek:
--            vehicle_equipment, equipment_faults, equipment_inspections,
--            inventory_checks, inventory_check_items

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fault_severity') THEN
        CREATE TYPE fault_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fault_priority') THEN
        CREATE TYPE fault_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fault_status') THEN
        CREATE TYPE fault_status AS ENUM
            ('REPORTED', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspection_type') THEN
        CREATE TYPE inspection_type AS ENUM
            ('STK', 'EK', 'REVISION', 'PERIODIC_CHECK', 'SERVICE');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inspection_status') THEN
        CREATE TYPE inspection_status AS ENUM
            ('PLANNED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_check_status') THEN
        CREATE TYPE inventory_check_status AS ENUM
            ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
    END IF;
END $$;

-- ============================================================================
-- 2. VEHICLE_EQUIPMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vehicle_equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
    equipment_id UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    placement TEXT,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT vehicle_equipment_no_self CHECK (vehicle_id <> equipment_id),
    CONSTRAINT vehicle_equipment_unique UNIQUE (vehicle_id, equipment_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_equipment_vehicle
    ON public.vehicle_equipment(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_equipment_equipment
    ON public.vehicle_equipment(equipment_id);

-- ============================================================================
-- 3. EQUIPMENT_FAULTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.equipment_faults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    severity fault_severity NOT NULL DEFAULT 'MEDIUM',
    priority fault_priority NOT NULL DEFAULT 'NORMAL',
    status fault_status NOT NULL DEFAULT 'REPORTED',
    reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_faults_equipment
    ON public.equipment_faults(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_faults_status
    ON public.equipment_faults(status);

-- ============================================================================
-- 4. EQUIPMENT_INSPECTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.equipment_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
    type inspection_type NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status inspection_status NOT NULL DEFAULT 'PLANNED',
    scheduled_date DATE,
    performed_at DATE,
    valid_until DATE,
    performed_by TEXT,
    cost NUMERIC(10, 2),
    protocol_number TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_inspections_equipment
    ON public.equipment_inspections(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_inspections_scheduled
    ON public.equipment_inspections(scheduled_date);

-- ============================================================================
-- 5. INVENTORY_CHECKS & INVENTORY_CHECK_ITEMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status inventory_check_status NOT NULL DEFAULT 'DRAFT',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_check_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_id UUID NOT NULL REFERENCES public.inventory_checks(id) ON DELETE CASCADE,
    equipment_id UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
    found BOOLEAN,
    condition_found TEXT,
    notes TEXT,
    verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT inventory_check_items_unique UNIQUE (check_id, equipment_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_check_items_check
    ON public.inventory_check_items(check_id);
CREATE INDEX IF NOT EXISTS idx_inventory_check_items_equipment
    ON public.inventory_check_items(equipment_id);

-- ============================================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.vehicle_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_faults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_check_items ENABLE ROW LEVEL SECURITY;

-- --- vehicle_equipment policies ---
DROP POLICY IF EXISTS vehicle_equipment_select_authenticated ON public.vehicle_equipment;
DROP POLICY IF EXISTS vehicle_equipment_insert_authenticated ON public.vehicle_equipment;
DROP POLICY IF EXISTS vehicle_equipment_update_authenticated ON public.vehicle_equipment;
DROP POLICY IF EXISTS vehicle_equipment_delete_authenticated ON public.vehicle_equipment;

CREATE POLICY vehicle_equipment_select_authenticated
ON public.vehicle_equipment FOR SELECT TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'vehicle.view'));

CREATE POLICY vehicle_equipment_insert_authenticated
ON public.vehicle_equipment FOR INSERT TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'vehicle.manage'));

CREATE POLICY vehicle_equipment_update_authenticated
ON public.vehicle_equipment FOR UPDATE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'vehicle.manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'vehicle.manage'));

CREATE POLICY vehicle_equipment_delete_authenticated
ON public.vehicle_equipment FOR DELETE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'vehicle.manage'));

-- --- equipment_faults policies ---
DROP POLICY IF EXISTS equipment_faults_select_authenticated ON public.equipment_faults;
DROP POLICY IF EXISTS equipment_faults_insert_authenticated ON public.equipment_faults;
DROP POLICY IF EXISTS equipment_faults_update_authenticated ON public.equipment_faults;
DROP POLICY IF EXISTS equipment_faults_delete_authenticated ON public.equipment_faults;

CREATE POLICY equipment_faults_select_authenticated
ON public.equipment_faults FOR SELECT TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'fault.create')
    OR public.has_permission((SELECT auth.uid()), 'fault.manage')
);

CREATE POLICY equipment_faults_insert_authenticated
ON public.equipment_faults FOR INSERT TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'fault.create'));

CREATE POLICY equipment_faults_update_authenticated
ON public.equipment_faults FOR UPDATE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'fault.manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'fault.manage'));

CREATE POLICY equipment_faults_delete_authenticated
ON public.equipment_faults FOR DELETE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'fault.manage'));

-- --- equipment_inspections policies ---
DROP POLICY IF EXISTS equipment_inspections_select_authenticated ON public.equipment_inspections;
DROP POLICY IF EXISTS equipment_inspections_insert_authenticated ON public.equipment_inspections;
DROP POLICY IF EXISTS equipment_inspections_update_authenticated ON public.equipment_inspections;
DROP POLICY IF EXISTS equipment_inspections_delete_authenticated ON public.equipment_inspections;

CREATE POLICY equipment_inspections_select_authenticated
ON public.equipment_inspections FOR SELECT TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'vehicle.view'));

CREATE POLICY equipment_inspections_insert_authenticated
ON public.equipment_inspections FOR INSERT TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'vehicle.manage'));

CREATE POLICY equipment_inspections_update_authenticated
ON public.equipment_inspections FOR UPDATE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'vehicle.manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'vehicle.manage'));

CREATE POLICY equipment_inspections_delete_authenticated
ON public.equipment_inspections FOR DELETE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'vehicle.manage'));

-- --- inventory_checks policies ---
DROP POLICY IF EXISTS inventory_checks_select_authenticated ON public.inventory_checks;
DROP POLICY IF EXISTS inventory_checks_insert_authenticated ON public.inventory_checks;
DROP POLICY IF EXISTS inventory_checks_update_authenticated ON public.inventory_checks;
DROP POLICY IF EXISTS inventory_checks_delete_authenticated ON public.inventory_checks;

CREATE POLICY inventory_checks_select_authenticated
ON public.inventory_checks FOR SELECT TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.view'));

CREATE POLICY inventory_checks_insert_authenticated
ON public.inventory_checks FOR INSERT TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inventory.edit'));

CREATE POLICY inventory_checks_update_authenticated
ON public.inventory_checks FOR UPDATE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.edit'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inventory.edit'));

CREATE POLICY inventory_checks_delete_authenticated
ON public.inventory_checks FOR DELETE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.manage'));

-- --- inventory_check_items policies ---
DROP POLICY IF EXISTS inventory_check_items_select_authenticated ON public.inventory_check_items;
DROP POLICY IF EXISTS inventory_check_items_insert_authenticated ON public.inventory_check_items;
DROP POLICY IF EXISTS inventory_check_items_update_authenticated ON public.inventory_check_items;
DROP POLICY IF EXISTS inventory_check_items_delete_authenticated ON public.inventory_check_items;

CREATE POLICY inventory_check_items_select_authenticated
ON public.inventory_check_items FOR SELECT TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.view'));

CREATE POLICY inventory_check_items_insert_authenticated
ON public.inventory_check_items FOR INSERT TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inventory.edit'));

CREATE POLICY inventory_check_items_update_authenticated
ON public.inventory_check_items FOR UPDATE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.edit'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inventory.edit'));

CREATE POLICY inventory_check_items_delete_authenticated
ON public.inventory_check_items FOR DELETE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.manage'));

-- ============================================================================
-- 7. GRANTS + AUDIT TRIGGERS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_equipment TO authenticated;
GRANT ALL ON public.vehicle_equipment TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_faults TO authenticated;
GRANT ALL ON public.equipment_faults TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_inspections TO authenticated;
GRANT ALL ON public.equipment_inspections TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_checks TO authenticated;
GRANT ALL ON public.inventory_checks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_check_items TO authenticated;
GRANT ALL ON public.inventory_check_items TO service_role;

DROP TRIGGER IF EXISTS vehicle_equipment_audit_trigger ON public.vehicle_equipment;
CREATE TRIGGER vehicle_equipment_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_equipment
FOR EACH ROW EXECUTE FUNCTION public.audit_incident_changes();

DROP TRIGGER IF EXISTS equipment_faults_audit_trigger ON public.equipment_faults;
CREATE TRIGGER equipment_faults_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.equipment_faults
FOR EACH ROW EXECUTE FUNCTION public.audit_incident_changes();

DROP TRIGGER IF EXISTS equipment_inspections_audit_trigger ON public.equipment_inspections;
CREATE TRIGGER equipment_inspections_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.equipment_inspections
FOR EACH ROW EXECUTE FUNCTION public.audit_incident_changes();

DROP TRIGGER IF EXISTS inventory_checks_audit_trigger ON public.inventory_checks;
CREATE TRIGGER inventory_checks_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_checks
FOR EACH ROW EXECUTE FUNCTION public.audit_incident_changes();

DROP TRIGGER IF EXISTS inventory_check_items_audit_trigger ON public.inventory_check_items;
CREATE TRIGGER inventory_check_items_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_check_items
FOR EACH ROW EXECUTE FUNCTION public.audit_incident_changes();