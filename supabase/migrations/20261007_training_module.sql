-- Migration: Training & Attendance Module (Tréningy a Dochádzka)
-- Date: 20261009
-- Purpose: Create database model for trainings and attendance.
--          Consistent with K8.1 members module (O5 security model).
--
-- Idempotency: uses IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS so
--              re-running is safe and non-destructive. No DROP of Core tables.

-- ============================================================================
-- 1. TRAININGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trainings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    target_group TEXT NOT NULL DEFAULT 'ALL'
        CHECK (target_group IN ('ALL', 'ADULT', 'YOUTH', 'PREPARATORY', 'DORAST')),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    location TEXT,
    trainer_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'PLANNED'
        CHECK (status IN ('PLANNED', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT chk_training_time CHECK (end_time > start_time)
);

-- ============================================================================
-- 2. TRAINING_ATTENDANCE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.training_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    training_id UUID NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    status TEXT NOT NULL
        CHECK (status IN ('PRESENT', 'ABSENT', 'EXCUSED', 'LATE')),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT uq_training_attendance_training_member UNIQUE (training_id, member_id)
);

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_trainings_start_time ON public.trainings(start_time);
CREATE INDEX IF NOT EXISTS idx_trainings_status ON public.trainings(status);
CREATE INDEX IF NOT EXISTS idx_trainings_target_group ON public.trainings(target_group);
CREATE INDEX IF NOT EXISTS idx_trainings_trainer_id ON public.trainings(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainings_created_by ON public.trainings(created_by);

CREATE INDEX IF NOT EXISTS idx_training_attendance_training_id ON public.training_attendance(training_id);
-- ============================================================================
-- 4. TRIGGERS: updated_at
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

DROP TRIGGER IF EXISTS trainings_set_updated_at ON public.trainings;
CREATE TRIGGER trainings_set_updated_at
BEFORE UPDATE ON public.trainings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS training_attendance_set_updated_at ON public.training_attendance;
CREATE TRIGGER training_attendance_set_updated_at
BEFORE UPDATE ON public.training_attendance
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 5. AUDIT INTEGRATION (writes to existing public.audit_log)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_training_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_action TEXT;
    v_module TEXT;
BEGIN
    IF TG_TABLE_NAME = 'trainings' THEN
        v_module := 'trainings';
    ELSE
        v_module := 'training_attendance';
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_action := CASE
            WHEN TG_TABLE_NAME = 'trainings' THEN 'TRAINING_CREATE'
            ELSE 'ATTENDANCE_CREATE'
        END;
        INSERT INTO public.audit_log (
            user_id, action, module, entity_id, old_data, new_data
        ) VALUES (
            CASE WHEN NEW.created_by IS NOT NULL THEN NEW.created_by ELSE (SELECT auth.uid()) END,
            v_action,
            v_module,
            NEW.id,
            NULL,
            to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := CASE
            WHEN TG_TABLE_NAME = 'trainings' THEN 'TRAINING_UPDATE'
            ELSE 'ATTENDANCE_UPDATE'
        END;
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
        v_action := CASE
            WHEN TG_TABLE_NAME = 'trainings' THEN 'TRAINING_DELETE'
            ELSE 'ATTENDANCE_DELETE'
        END;
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
-- 6. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_attendance ENABLE ROW LEVEL SECURITY;

-- --- trainings policies ---
DROP POLICY IF EXISTS trainings_select_authenticated ON public.trainings;
DROP POLICY IF EXISTS trainings_insert_authenticated ON public.trainings;
DROP POLICY IF EXISTS trainings_update_authenticated ON public.trainings;
DROP POLICY IF EXISTS trainings_delete_authenticated ON public.trainings;

-- SELECT: training.view
CREATE POLICY trainings_select_authenticated
ON public.trainings
FOR SELECT
TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'training.view')
);

-- INSERT: training.create
CREATE POLICY trainings_insert_authenticated
ON public.trainings
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'training.create')
);

-- UPDATE: training.edit
CREATE POLICY trainings_update_authenticated
ON public.trainings
FOR UPDATE
TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'training.edit')
)
WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'training.edit')
);

-- DELETE: training.edit (hard delete restricted to training.edit holders;
-- operational cancellation is done via status = 'CANCELLED')
CREATE POLICY trainings_delete_authenticated
ON public.trainings
FOR DELETE
TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'training.edit')
);

-- --- training_attendance policies ---
DROP POLICY IF EXISTS training_attendance_select_authenticated ON public.training_attendance;
DROP POLICY IF EXISTS training_attendance_insert_authenticated ON public.training_attendance;
DROP POLICY IF EXISTS training_attendance_update_authenticated ON public.training_attendance;
DROP POLICY IF EXISTS training_attendance_delete_authenticated ON public.training_attendance;

-- SELECT: training.view
CREATE POLICY training_attendance_select_authenticated
ON public.training_attendance
FOR SELECT
TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'training.view')
);

-- INSERT: training.create
CREATE POLICY training_attendance_insert_authenticated
ON public.training_attendance
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'training.create')
);

-- UPDATE: training.edit
CREATE POLICY training_attendance_update_authenticated
ON public.training_attendance
FOR UPDATE
TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'training.edit')
)
WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'training.edit')
);

-- DELETE: training.edit
CREATE POLICY training_attendance_delete_authenticated
ON public.training_attendance
FOR DELETE
TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'training.edit')
);

-- ============================================================================
-- 7. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainings TO authenticated;
GRANT ALL ON public.trainings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_attendance TO authenticated;
GRANT ALL ON public.training_attendance TO service_role;

-- Function grants
GRANT EXECUTE ON FUNCTION public.audit_training_changes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;


DROP TRIGGER IF EXISTS trainings_audit_trigger ON public.trainings;
CREATE TRIGGER trainings_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.trainings
FOR EACH ROW
EXECUTE FUNCTION public.audit_training_changes();

DROP TRIGGER IF EXISTS training_attendance_audit_trigger ON public.training_attendance;
CREATE TRIGGER training_attendance_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.training_attendance
FOR EACH ROW
EXECUTE FUNCTION public.audit_training_changes();

CREATE INDEX IF NOT EXISTS idx_training_attendance_member_id ON public.training_attendance(member_id);
CREATE INDEX IF NOT EXISTS idx_training_attendance_status ON public.training_attendance(status);
