-- ============================================================================
-- Migration: quantity + OPP na equipment_items + vehicle_responsibilities
-- Date: 20261107
-- Status: Forward-only, IDEMPOTENTNÁ (ADD COLUMN / CREATE TABLE IF NOT EXISTS)
--
-- Účel:
--  1. quantity (počet kusov) a is_opp (Osobný ochranný pracovný prostriedok)
--     na equipment_items pre modul Inventár/Výstroj.
--  2. Väzbová tabuľka vehicle_responsibilities – zodpovední členovia
--     (garážmajstri / správcovia) za vozidlá a techniku.
-- ============================================================================

-- ============================================================================
-- 1. EQUIPMENT_ITEMS – quantity a OPP
-- ============================================================================

ALTER TABLE public.equipment_items
    ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1
        CHECK (quantity >= 0);

ALTER TABLE public.equipment_items
    ADD COLUMN IF NOT EXISTS is_opp boolean NOT NULL DEFAULT false;

-- ============================================================================
-- 2. VEHICLE_RESPONSIBILITIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vehicle_responsibilities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id uuid NOT NULL
        REFERENCES public.equipment_items(id) ON DELETE CASCADE,
    member_id uuid NOT NULL
        REFERENCES public.members(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'MAINTENANCE',
    note text,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT vehicle_responsibilities_unique UNIQUE (vehicle_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_responsibilities_vehicle
    ON public.vehicle_responsibilities(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_responsibilities_member
    ON public.vehicle_responsibilities(member_id);

ALTER TABLE public.vehicle_responsibilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_responsibilities_select_authenticated ON public.vehicle_responsibilities;
CREATE POLICY vehicle_responsibilities_select_authenticated
    ON public.vehicle_responsibilities FOR SELECT TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'vehicle.view'));

DROP POLICY IF EXISTS vehicle_responsibilities_insert_manage ON public.vehicle_responsibilities;
CREATE POLICY vehicle_responsibilities_insert_manage
    ON public.vehicle_responsibilities FOR INSERT TO authenticated
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'vehicle.manage'));

DROP POLICY IF EXISTS vehicle_responsibilities_update_manage ON public.vehicle_responsibilities;
CREATE POLICY vehicle_responsibilities_update_manage
    ON public.vehicle_responsibilities FOR UPDATE TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'vehicle.manage'))
    WITH CHECK (public.has_permission((SELECT auth.uid()), 'vehicle.manage'));

DROP POLICY IF EXISTS vehicle_responsibilities_delete_manage ON public.vehicle_responsibilities;
CREATE POLICY vehicle_responsibilities_delete_manage
    ON public.vehicle_responsibilities FOR DELETE TO authenticated
    USING (public.has_permission((SELECT auth.uid()), 'vehicle.manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_responsibilities TO authenticated;
GRANT ALL ON public.vehicle_responsibilities TO service_role;

-- ============================================================================
-- Overenie:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='equipment_items'
--    AND column_name IN ('quantity','is_opp');
--   SELECT * FROM public.vehicle_responsibilities LIMIT 1;
-- ============================================================================