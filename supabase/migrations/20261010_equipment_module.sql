-- Migration: Equipment, Vehicles & Inventory Module (Technika, Výstroj a Majetok)
-- Date: 20261012
-- Purpose: Create database model for equipment, vehicles and inventory.
--          Consistent with K8/K9/K10 modules (O5 security model).
--
-- Idempotency: uses IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS so
--              re-running is safe and non-destructive. No DROP of Core tables.
--
-- Permissions used (from existing O5 catalog where present):
--   inventory.view, inventory.edit
-- NOTE: 'inventory.manage' is referenced for DELETE and category writes per the
--       K11.1 spec, but it is NOT currently seeded in the O5 permission catalog
--       (core migration seeds inventory.view/create/edit). See report KNOWN RISKS.
--       Until 'inventory.manage' is added to the catalog and granted to roles,
--       DELETE policies will deny all authenticated users.

-- ============================================================================
-- 1. ENUMS (idempotent, mirroring the members-module pattern)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'equipment_status') THEN
        CREATE TYPE equipment_status AS ENUM
            ('AVAILABLE', 'IN_SERVICE', 'RESERVED', 'DAMAGED', 'DISPOSED');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'equipment_condition') THEN
        CREATE TYPE equipment_condition AS ENUM
            ('NEW', 'GOOD', 'FAIR', 'POOR', 'UNSERVICEABLE');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maintenance_type') THEN
        CREATE TYPE maintenance_type AS ENUM
            ('STK_EK', 'REVISION', 'SERVICE_CHECK', 'REPAIR', 'INSPECTION');
    END IF;
END $$;

-- ============================================================================
-- 2. EQUIPMENT_CATEGORIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.equipment_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    requires_inspection BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. EQUIPMENT_ITEMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.equipment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.equipment_categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    inventory_number TEXT UNIQUE,
    serial_number TEXT,
    status equipment_status NOT NULL DEFAULT 'AVAILABLE',
    condition equipment_condition NOT NULL DEFAULT 'GOOD',
    location TEXT,
    purchase_date DATE,
    purchase_price NUMERIC(10, 2),
    next_inspection_date DATE,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. VEHICLE_DETAILS TABLE (1:1 with equipment_items, category VEHICLES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vehicle_details (
    id UUID PRIMARY KEY REFERENCES public.equipment_items(id) ON DELETE CASCADE,
    license_plate TEXT UNIQUE,
    vin TEXT,
    fuel_type TEXT,
    mileage_km INTEGER NOT NULL DEFAULT 0,
    engine_hours NUMERIC(8, 1) NOT NULL DEFAULT 0,
    stk_valid_until DATE,
    ek_valid_until DATE
);

-- ============================================================================
-- 5. EQUIPMENT_ASSIGNMENTS TABLE (výdar / priradenie členovi)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.equipment_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    returned_at TIMESTAMPTZ,
    assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    condition_on_assign equipment_condition,
    condition_on_return equipment_condition,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. EQUIPMENT_MAINTENANCE_LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.equipment_maintenance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
    type maintenance_type NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    performed_at DATE NOT NULL,
    next_due_date DATE,
    cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
    performed_by TEXT,
    status TEXT NOT NULL DEFAULT 'COMPLETED'
        CHECK (status IN ('PLANNED', 'COMPLETED')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 7. INDEXES (FK + search columns)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_equipment_items_category_id ON public.equipment_items(category_id);
CREATE INDEX IF NOT EXISTS idx_equipment_items_status ON public.equipment_items(status);
CREATE INDEX IF NOT EXISTS idx_equipment_items_condition ON public.equipment_items(condition);
CREATE INDEX IF NOT EXISTS idx_equipment_items_next_inspection_date ON public.equipment_items(next_inspection_date);
CREATE INDEX IF NOT EXISTS idx_equipment_items_created_by ON public.equipment_items(created_by);

CREATE INDEX IF NOT EXISTS idx_equipment_assignments_equipment_id ON public.equipment_assignments(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_assignments_member_id ON public.equipment_assignments(member_id);
CREATE INDEX IF NOT EXISTS idx_equipment_assignments_assigned_by ON public.equipment_assignments(assigned_by);

CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_logs_equipment_id ON public.equipment_maintenance_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_logs_performed_at ON public.equipment_maintenance_logs(performed_at);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_logs_created_by ON public.equipment_maintenance_logs(created_by);

-- ============================================================================
-- 8. TRIGGERS: updated_at
-- ============================================================================

-- set_updated_at() is defined by the core O5 migration; re-declared
-- idempotently here so this migration is self-contained.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS equipment_categories_set_updated_at ON public.equipment_categories;
CREATE TRIGGER equipment_categories_set_updated_at
BEFORE UPDATE ON public.equipment_categories
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS equipment_items_set_updated_at ON public.equipment_items;
CREATE TRIGGER equipment_items_set_updated_at
BEFORE UPDATE ON public.equipment_items
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================================
-- 9. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.equipment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_maintenance_logs ENABLE ROW LEVEL SECURITY;

-- --- equipment_categories policies ---
-- SELECT: inventory.view | INSERT/UPDATE: inventory.manage | DELETE: inventory.manage
DROP POLICY IF EXISTS equipment_categories_select_authenticated ON public.equipment_categories;
DROP POLICY IF EXISTS equipment_categories_insert_authenticated ON public.equipment_categories;
DROP POLICY IF EXISTS equipment_categories_update_authenticated ON public.equipment_categories;
DROP POLICY IF EXISTS equipment_categories_delete_authenticated ON public.equipment_categories;

CREATE POLICY equipment_categories_select_authenticated
ON public.equipment_categories
FOR SELECT
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.view'));

CREATE POLICY equipment_categories_insert_authenticated
ON public.equipment_categories
FOR INSERT
TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inventory.manage'));

CREATE POLICY equipment_categories_update_authenticated
ON public.equipment_categories
FOR UPDATE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.manage'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inventory.manage'));

CREATE POLICY equipment_categories_delete_authenticated
ON public.equipment_categories
FOR DELETE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.manage'));

-- --- equipment_items policies ---
-- SELECT: inventory.view | INSERT/UPDATE: inventory.edit | DELETE: inventory.manage
DROP POLICY IF EXISTS equipment_items_select_authenticated ON public.equipment_items;
DROP POLICY IF EXISTS equipment_items_insert_authenticated ON public.equipment_items;
DROP POLICY IF EXISTS equipment_items_update_authenticated ON public.equipment_items;
DROP POLICY IF EXISTS equipment_items_delete_authenticated ON public.equipment_items;

CREATE POLICY equipment_items_select_authenticated
ON public.equipment_items
FOR SELECT
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.view'));

CREATE POLICY equipment_items_insert_authenticated
ON public.equipment_items
FOR INSERT
TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inventory.edit'));

CREATE POLICY equipment_items_update_authenticated
ON public.equipment_items
FOR UPDATE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.edit'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inventory.edit'));

CREATE POLICY equipment_items_delete_authenticated
ON public.equipment_items
FOR DELETE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.manage'));

-- --- vehicle_details policies ---
-- SELECT: inventory.view | INSERT/UPDATE: inventory.edit | DELETE: inventory.manage
DROP POLICY IF EXISTS vehicle_details_select_authenticated ON public.vehicle_details;
DROP POLICY IF EXISTS vehicle_details_insert_authenticated ON public.vehicle_details;
DROP POLICY IF EXISTS vehicle_details_update_authenticated ON public.vehicle_details;
DROP POLICY IF EXISTS vehicle_details_delete_authenticated ON public.vehicle_details;

CREATE POLICY vehicle_details_select_authenticated
ON public.vehicle_details
FOR SELECT
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.view'));

CREATE POLICY vehicle_details_insert_authenticated
ON public.vehicle_details
FOR INSERT
TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inventory.edit'));

CREATE POLICY vehicle_details_update_authenticated
ON public.vehicle_details
FOR UPDATE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.edit'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inventory.edit'));

CREATE POLICY vehicle_details_delete_authenticated
ON public.vehicle_details
FOR DELETE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.manage'));


-- --- equipment_assignments policies ---
-- SELECT: inventory.view | INSERT/UPDATE: inventory.edit | DELETE: inventory.manage
DROP POLICY IF EXISTS equipment_assignments_select_authenticated ON public.equipment_assignments;
DROP POLICY IF EXISTS equipment_assignments_insert_authenticated ON public.equipment_assignments;
DROP POLICY IF EXISTS equipment_assignments_update_authenticated ON public.equipment_assignments;
DROP POLICY IF EXISTS equipment_assignments_delete_authenticated ON public.equipment_assignments;

CREATE POLICY equipment_assignments_select_authenticated
ON public.equipment_assignments
FOR SELECT
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.view'));

CREATE POLICY equipment_assignments_insert_authenticated
ON public.equipment_assignments
FOR INSERT
TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inventory.edit'));

CREATE POLICY equipment_assignments_update_authenticated
ON public.equipment_assignments
FOR UPDATE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.edit'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inventory.edit'));

CREATE POLICY equipment_assignments_delete_authenticated
ON public.equipment_assignments
FOR DELETE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.manage'));

-- --- equipment_maintenance_logs policies ---
-- SELECT: inventory.view | INSERT/UPDATE: inventory.edit | DELETE: inventory.manage
DROP POLICY IF EXISTS equipment_maintenance_logs_select_authenticated ON public.equipment_maintenance_logs;
DROP POLICY IF EXISTS equipment_maintenance_logs_insert_authenticated ON public.equipment_maintenance_logs;
DROP POLICY IF EXISTS equipment_maintenance_logs_update_authenticated ON public.equipment_maintenance_logs;
DROP POLICY IF EXISTS equipment_maintenance_logs_delete_authenticated ON public.equipment_maintenance_logs;

CREATE POLICY equipment_maintenance_logs_select_authenticated
ON public.equipment_maintenance_logs
FOR SELECT
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.view'));

CREATE POLICY equipment_maintenance_logs_insert_authenticated
ON public.equipment_maintenance_logs
FOR INSERT
TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inventory.edit'));

CREATE POLICY equipment_maintenance_logs_update_authenticated
ON public.equipment_maintenance_logs
FOR UPDATE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.edit'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'inventory.edit'));

CREATE POLICY equipment_maintenance_logs_delete_authenticated
ON public.equipment_maintenance_logs
FOR DELETE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'inventory.manage'));


-- ============================================================================
-- 10. AUDIT INTEGRATION (writes to existing public.audit_log)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_equipment_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_action TEXT;
    v_module TEXT;
BEGIN
    IF TG_TABLE_NAME = 'equipment_categories' THEN
        v_module := 'equipment_categories';
    ELSIF TG_TABLE_NAME = 'equipment_items' THEN
        v_module := 'equipment_items';
    ELSIF TG_TABLE_NAME = 'vehicle_details' THEN
        v_module := 'vehicle_details';
    ELSIF TG_TABLE_NAME = 'equipment_assignments' THEN
        v_module := 'equipment_assignments';
    ELSE
        v_module := 'equipment_maintenance_logs';
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_action := 'EQUIPMENT_CREATE';
        INSERT INTO public.audit_log (
            user_id, action, module, entity_id, old_data, new_data
        ) VALUES (
            (SELECT auth.uid()),
            v_action,
            v_module,
            NEW.id,
            NULL,
            to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'EQUIPMENT_UPDATE';
        INSERT INTO public.audit_log (
            user_id, action, module, entity_id, old_data, new_data
        ) VALUES (
            (SELECT auth.uid()),
            v_action,
            v_module,
            NEW.id,
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'EQUIPMENT_DELETE';
        INSERT INTO public.audit_log (
            user_id, action, module, entity_id, old_data, new_data
        ) VALUES (
            (SELECT auth.uid()),
            v_action,
            v_module,
            OLD.id,
            to_jsonb(OLD),
            NULL
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- ============================================================================
-- 11. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_categories TO authenticated;
GRANT ALL ON public.equipment_categories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_items TO authenticated;
GRANT ALL ON public.equipment_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_details TO authenticated;
GRANT ALL ON public.vehicle_details TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_assignments TO authenticated;
GRANT ALL ON public.equipment_assignments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_maintenance_logs TO authenticated;
GRANT ALL ON public.equipment_maintenance_logs TO service_role;

GRANT EXECUTE ON FUNCTION public.audit_equipment_changes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;

-- ============================================================================
-- 12. AUDIT TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS equipment_categories_audit_trigger ON public.equipment_categories;
CREATE TRIGGER equipment_categories_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.equipment_categories
FOR EACH ROW
EXECUTE FUNCTION public.audit_equipment_changes();

DROP TRIGGER IF EXISTS equipment_items_audit_trigger ON public.equipment_items;
CREATE TRIGGER equipment_items_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.equipment_items
FOR EACH ROW
EXECUTE FUNCTION public.audit_equipment_changes();

DROP TRIGGER IF EXISTS vehicle_details_audit_trigger ON public.vehicle_details;
CREATE TRIGGER vehicle_details_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_details
FOR EACH ROW
EXECUTE FUNCTION public.audit_equipment_changes();

DROP TRIGGER IF EXISTS equipment_assignments_audit_trigger ON public.equipment_assignments;
CREATE TRIGGER equipment_assignments_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.equipment_assignments
FOR EACH ROW
EXECUTE FUNCTION public.audit_equipment_changes();

DROP TRIGGER IF EXISTS equipment_maintenance_logs_audit_trigger ON public.equipment_maintenance_logs;
CREATE TRIGGER equipment_maintenance_logs_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.equipment_maintenance_logs
FOR EACH ROW
EXECUTE FUNCTION public.audit_equipment_changes();

-- ============================================================================
-- 13. SEED DATA – základné kategórie (idempotent cez ON CONFLICT na code)
-- ============================================================================

INSERT INTO public.equipment_categories (name, code, description, requires_inspection)
VALUES
    ('Vozidlá a prívesy', 'VEHICLES', 'Hasící vozidlá, prívesy a špeciálna technika.', TRUE),
    ('Čerpadlá a agregáty', 'PUMPS', 'Motorové čerpadlá, elektrocentrály a agregáty.', TRUE),
    ('Osobný ochranný výstroj (OOPP)', 'PPE', 'Zásahové obleky, prilby, obuv a respiračné prístroje.', TRUE),
    ('Hadice a armatúry', 'HOSES', 'Tlakové hadice, spojky a rozdeľovače.', FALSE),
    ('Rádiostanice a technika', 'COMMUNICATION', 'Rádiostanice, vysielačky a komunikačná technika.', FALSE),
    ('Všeobecný majetok', 'GENERAL', 'Ostatný majetok a výstroj hasičského zboru.', FALSE)
ON CONFLICT (code) DO NOTHING;

