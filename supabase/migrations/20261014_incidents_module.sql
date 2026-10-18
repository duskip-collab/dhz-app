-- Migration: Incidents & Operations Module (Výjazdová činnosť a zásahy)
-- Date: 20261014
-- Purpose: Database model for incident/operation records, responders and
--          deployed equipment. Consistent with K8/K9/K10/K11 (O5 security model).
--
-- Idempotency: IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS so
--              re-running is safe and non-destructive. No DROP of Core tables.

-- ============================================================================
-- 1. ENUMS (idempotent, mirroring members/equipment pattern)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_type') THEN
        CREATE TYPE incident_type AS ENUM
            ('FIRE', 'TECHNICAL', 'FLOOD', 'TRAFFIC_ACCIDENT', 'TACTICAL_EXERCISE', 'OTHER');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_status') THEN
        CREATE TYPE incident_status AS ENUM
            ('REPORTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'responder_role') THEN
        CREATE TYPE responder_role AS ENUM
            ('COMMANDER', 'DRIVER', 'FIREFIGHTER', 'SUPPORT');
    END IF;
END $$;

-- ============================================================================
-- 2. INCIDENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_number TEXT,
    title TEXT NOT NULL,
    type incident_type NOT NULL DEFAULT 'OTHER',
    status incident_status NOT NULL DEFAULT 'REPORTED',
    location TEXT NOT NULL,
    gps_coordinates TEXT,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dispatched_at TIMESTAMPTZ,
    arrived_at TIMESTAMPTZ,
    returned_at TIMESTAMPTZ,
    description TEXT,
    command_notes TEXT,
    weather_conditions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT chk_incident_timeline CHECK (
        (dispatched_at IS NULL OR dispatched_at >= reported_at)
        AND (arrived_at IS NULL OR arrived_at >= reported_at)
        AND (arrived_at IS NULL OR dispatched_at IS NULL OR arrived_at >= dispatched_at)
        AND (returned_at IS NULL OR returned_at >= reported_at)
        AND (returned_at IS NULL OR arrived_at IS NULL OR returned_at >= arrived_at)
    )
);

-- ============================================================================
-- 3. INCIDENT_RESPONDERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.incident_responders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    role responder_role NOT NULL DEFAULT 'FIREFIGHTER',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_incident_responder UNIQUE (incident_id, member_id)
);

-- ============================================================================
-- 4. INCIDENT_EQUIPMENT TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.incident_equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    equipment_id UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
    engine_hours_used NUMERIC(8, 1),
    kilometers_driven NUMERIC(8, 1),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_incident_equipment UNIQUE (incident_id, equipment_id)
);

-- ============================================================================
-- 5. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_type ON public.incidents(type);
CREATE INDEX IF NOT EXISTS idx_incidents_reported_at ON public.incidents(reported_at);
CREATE INDEX IF NOT EXISTS idx_incidents_created_by ON public.incidents(created_by);

CREATE INDEX IF NOT EXISTS idx_incident_responders_incident_id ON public.incident_responders(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_responders_member_id ON public.incident_responders(member_id);

CREATE INDEX IF NOT EXISTS idx_incident_equipment_incident_id ON public.incident_equipment(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_equipment_equipment_id ON public.incident_equipment(equipment_id);

-- ============================================================================
-- 6. O5 PERMISSIONS SEED + ROLE GRANTS (OPRAVENÝ BLOK)
-- ============================================================================

-- Pridanie oprávnení do public.permissions (bez stĺpca module)
INSERT INTO public.permissions (code, name, description)
VALUES
    ('incidents.view',   'Zobraziť výjazdy',   'Zobrazenie záznamov výjazdovej činnosti a zásahov.'),
    ('incidents.create', 'Evidovať výjazdy',   'Vytváranie záznamov výjazdovej činnosti.'),
    ('incidents.edit',   'Upravovať výjazdy',  'Úprava záznamov výjazdovej činnosti.'),
    ('incidents.delete', 'Odstraňovať výjazdy', 'Odstraňovanie záznamov výjazdovej činnosti.')
ON CONFLICT (code) DO NOTHING;

-- ADMIN a VELITEL: plný prístup (view/create/edit/delete)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('ADMIN', 'VELITEL')
  AND p.code IN ('incidents.view', 'incidents.create', 'incidents.edit', 'incidents.delete')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- VEDENIE a CLEN: len incidents.view
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('VEDENIE', 'CLEN')
  AND p.code = 'incidents.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_responders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_equipment ENABLE ROW LEVEL SECURITY;

-- --- incidents policies ---
DROP POLICY IF EXISTS incidents_select_authenticated ON public.incidents;
DROP POLICY IF EXISTS incidents_insert_authenticated ON public.incidents;
DROP POLICY IF EXISTS incidents_update_authenticated ON public.incidents;
DROP POLICY IF EXISTS incidents_delete_authenticated ON public.incidents;

CREATE POLICY incidents_select_authenticated
ON public.incidents
FOR SELECT
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'incidents.view'));

CREATE POLICY incidents_insert_authenticated
ON public.incidents
FOR INSERT
TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'incidents.create'));

CREATE POLICY incidents_update_authenticated
ON public.incidents
FOR UPDATE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'incidents.edit'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'incidents.edit'));

CREATE POLICY incidents_delete_authenticated
ON public.incidents
FOR DELETE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'incidents.delete'));

-- --- incident_responders policies ---
DROP POLICY IF EXISTS incident_responders_select_authenticated ON public.incident_responders;
DROP POLICY IF EXISTS incident_responders_insert_authenticated ON public.incident_responders;
DROP POLICY IF EXISTS incident_responders_update_authenticated ON public.incident_responders;
DROP POLICY IF EXISTS incident_responders_delete_authenticated ON public.incident_responders;

CREATE POLICY incident_responders_select_authenticated
ON public.incident_responders
FOR SELECT
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'incidents.view'));

CREATE POLICY incident_responders_insert_authenticated
ON public.incident_responders
FOR INSERT
TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'incidents.create'));

CREATE POLICY incident_responders_update_authenticated
ON public.incident_responders
FOR UPDATE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'incidents.edit'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'incidents.edit'));

CREATE POLICY incident_responders_delete_authenticated
ON public.incident_responders
FOR DELETE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'incidents.delete'));

-- --- incident_equipment policies ---
DROP POLICY IF EXISTS incident_equipment_select_authenticated ON public.incident_equipment;
DROP POLICY IF EXISTS incident_equipment_insert_authenticated ON public.incident_equipment;
DROP POLICY IF EXISTS incident_equipment_update_authenticated ON public.incident_equipment;
DROP POLICY IF EXISTS incident_equipment_delete_authenticated ON public.incident_equipment;

CREATE POLICY incident_equipment_select_authenticated
ON public.incident_equipment
FOR SELECT
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'incidents.view'));

CREATE POLICY incident_equipment_insert_authenticated
ON public.incident_equipment
FOR INSERT
TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'incidents.create'));

CREATE POLICY incident_equipment_update_authenticated
ON public.incident_equipment
FOR UPDATE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'incidents.edit'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'incidents.edit'));

CREATE POLICY incident_equipment_delete_authenticated
ON public.incident_equipment
FOR DELETE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'incidents.delete'));

-- ============================================================================
-- 8. TRIGGERS: set_updated_at
-- ============================================================================

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

DROP TRIGGER IF EXISTS incidents_set_updated_at ON public.incidents;
CREATE TRIGGER incidents_set_updated_at
BEFORE UPDATE ON public.incidents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS incident_responders_set_updated_at ON public.incident_responders;
CREATE TRIGGER incident_responders_set_updated_at
BEFORE UPDATE ON public.incident_responders
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS incident_equipment_set_updated_at ON public.incident_equipment;
CREATE TRIGGER incident_equipment_set_updated_at
BEFORE UPDATE ON public.incident_equipment
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 9. AUDIT INTEGRATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_incident_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_action TEXT;
    v_module TEXT;
BEGIN
    IF TG_TABLE_NAME = 'incidents' THEN
        v_module := 'incidents';
    ELSIF TG_TABLE_NAME = 'incident_responders' THEN
        v_module := 'incident_responders';
    ELSE
        v_module := 'incident_equipment';
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_action := CASE
            WHEN TG_TABLE_NAME = 'incidents' THEN 'INCIDENT_CREATE'
            WHEN TG_TABLE_NAME = 'incident_responders' THEN 'INCIDENT_RESPONDER_CREATE'
            ELSE 'INCIDENT_EQUIPMENT_CREATE'
        END;
        INSERT INTO public.audit_log (
            user_id, action, module, object_id, old_values, new_values
        ) VALUES (
            CASE WHEN NEW.created_by IS NOT NULL THEN NEW.created_by ELSE (SELECT auth.uid()) END,
            v_action,
            v_module,
            (NEW.id)::text,
            NULL,
            to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := CASE
            WHEN TG_TABLE_NAME = 'incidents' THEN 'INCIDENT_UPDATE'
            WHEN TG_TABLE_NAME = 'incident_responders' THEN 'INCIDENT_RESPONDER_UPDATE'
            ELSE 'INCIDENT_EQUIPMENT_UPDATE'
        END;
        INSERT INTO public.audit_log (
            user_id, action, module, object_id, old_values, new_values
        ) VALUES (
            (SELECT auth.uid()),
            v_action,
            v_module,
            (NEW.id)::text,
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        v_action := CASE
            WHEN TG_TABLE_NAME = 'incidents' THEN 'INCIDENT_DELETE'
            WHEN TG_TABLE_NAME = 'incident_responders' THEN 'INCIDENT_RESPONDER_DELETE'
            ELSE 'INCIDENT_EQUIPMENT_DELETE'
        END;
        INSERT INTO public.audit_log (
            user_id, action, module, object_id, old_values, new_values
        ) VALUES (
            (SELECT auth.uid()),
            v_action,
            v_module,
            (OLD.id)::text,
            to_jsonb(OLD),
            NULL
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- ============================================================================
-- 10. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.incidents TO authenticated;
GRANT ALL ON public.incidents TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.incident_responders TO authenticated;
GRANT ALL ON public.incident_responders TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.incident_equipment TO authenticated;
GRANT ALL ON public.incident_equipment TO service_role;

GRANT EXECUTE ON FUNCTION public.audit_incident_changes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;

-- ============================================================================
-- 11. AUDIT TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS incidents_audit_trigger ON public.incidents;
CREATE TRIGGER incidents_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.incidents
FOR EACH ROW
EXECUTE FUNCTION public.audit_incident_changes();

DROP TRIGGER IF EXISTS incident_responders_audit_trigger ON public.incident_responders;
CREATE TRIGGER incident_responders_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.incident_responders
FOR EACH ROW
EXECUTE FUNCTION public.audit_incident_changes();

DROP TRIGGER IF EXISTS incident_equipment_audit_trigger ON public.incident_equipment;
CREATE TRIGGER incident_equipment_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.incident_equipment
FOR EACH ROW
EXECUTE FUNCTION public.audit_incident_changes();