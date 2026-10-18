-- Migration: Calendar, Announcements, Meetings, Work Parties Module
-- Date: 20261029
-- Purpose: Database model for Kalendár (calendar_events), Oznamy (announcements),
--          Porady (meetings) a Brigády (work_parties) modules.
-- Consistent with K8-K13 security model (RLS, audit triggers, idempotency).
--
-- Idempotency: IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS so
--              re-running is safe and non-destructive. No DROP of Core tables.

-- ============================================================================
-- 1. PERMISSIONS (insert new permission codes if missing)
-- ============================================================================

INSERT INTO public.permissions (code, name, description)
SELECT 'calendar.view', 'Kalendár - pohľad', 'Povolenie pozerať kalendár udalostí'
WHERE NOT EXISTS (
    SELECT 1 FROM public.permissions WHERE code = 'calendar.view'
);

INSERT INTO public.permissions (code, name, description)
SELECT 'calendar.manage', 'Kalendár - správa', 'Povolenie vytvárať/upraviť/mazať kalendárne udalosti'
WHERE NOT EXISTS (
    SELECT 1 FROM public.permissions WHERE code = 'calendar.manage'
);

INSERT INTO public.permissions (code, name, description)
SELECT 'announcements.view', 'Oznamy - pohľad', 'Povolenie pozerať oznámenia'
WHERE NOT EXISTS (
    SELECT 1 FROM public.permissions WHERE code = 'announcements.view'
);

INSERT INTO public.permissions (code, name, description)
SELECT 'announcements.send', 'Oznamy - odoslanie', 'Povolenie vytvárať/upraviť/mazať oznámenia'
WHERE NOT EXISTS (
    SELECT 1 FROM public.permissions WHERE code = 'announcements.send'
);

INSERT INTO public.permissions (code, name, description)
SELECT 'meetings.view', 'Porady - pohľad', 'Povolenie pozerať porady a schôdze'
WHERE NOT EXISTS (
    SELECT 1 FROM public.permissions WHERE code = 'meetings.view'
);

INSERT INTO public.permissions (code, name, description)
SELECT 'meetings.manage', 'Porady - správa', 'Povolenie vytvárať/upraviť/mazať porady'
WHERE NOT EXISTS (
    SELECT 1 FROM public.permissions WHERE code = 'meetings.manage'
);

INSERT INTO public.permissions (code, name, description)
SELECT 'work_parties.view', 'Brigády - pohľad', 'Povolenie pozerať brigády a dobrovoľnícke práce'
WHERE NOT EXISTS (
    SELECT 1 FROM public.permissions WHERE code = 'work_parties.view'
);

INSERT INTO public.permissions (code, name, description)
SELECT 'work_parties.manage', 'Brigády - správa', 'Povolenie vytvárať/upraviť/mazať brigády'
WHERE NOT EXISTS (
    SELECT 1 FROM public.permissions WHERE code = 'work_parties.manage'
);

-- ============================================================================
-- 2. ENUMS
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
        CREATE TYPE public.event_type AS ENUM
            ('TRAINING', 'COMPETITION', 'INCIDENT', 'MEETING', 'WORK_PARTY', 'OTHER', 'HOLIDAY');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_type') THEN
        CREATE TYPE public.meeting_type AS ENUM
            ('BOARD', 'TRAINING_STAFF', 'MEMBERS', 'EXTRAORDINARY', 'OTHER');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_party_status') THEN
        CREATE TYPE public.work_party_status AS ENUM
            ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'announcement_priority') THEN
        CREATE TYPE public.announcement_priority AS ENUM
            ('LOW', 'NORMAL', 'HIGH', 'URGENT');
    END IF;
END $$;

-- ============================================================================
-- 3. CALENDAR_EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    event_type public.event_type NOT NULL DEFAULT 'OTHER',
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN NOT NULL DEFAULT FALSE,
    location TEXT,
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    recurrence_rule TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT chk_calendar_event_times CHECK (end_at >= start_at)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_start_at
    ON public.calendar_events(start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_event_type
    ON public.calendar_events(event_type);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by
    ON public.calendar_events(created_by);

-- ============================================================================
-- 4. ANNOUNCEMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    priority public.announcement_priority NOT NULL DEFAULT 'NORMAL',
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    target_roles TEXT[],
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_published_at
    ON public.announcements(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_is_active
    ON public.announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_announcements_created_by
    ON public.announcements(created_by);

-- ============================================================================
-- 5. MEETINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    meeting_type public.meeting_type NOT NULL DEFAULT 'OTHER',
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    location TEXT,
    agenda TEXT,
    minutes TEXT,
    is_remote BOOLEAN NOT NULL DEFAULT FALSE,
    remote_link TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT chk_meeting_duration CHECK (duration_minutes > 0 AND duration_minutes <= 480)
);

CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at
    ON public.meetings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_meetings_meeting_type
    ON public.meetings(meeting_type);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by
    ON public.meetings(created_by);

-- ============================================================================
-- 6. WORK_PARTIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.work_parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    work_date TIMESTAMPTZ NOT NULL,
    duration_hours INTEGER NOT NULL DEFAULT 4,
    location TEXT,
    status public.work_party_status NOT NULL DEFAULT 'PLANNED',
    max_volunteers INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT chk_work_party_duration CHECK (duration_hours > 0 AND duration_hours <= 24)
);

CREATE INDEX IF NOT EXISTS idx_work_parties_work_date
    ON public.work_parties(work_date);
CREATE INDEX IF NOT EXISTS idx_work_parties_status
    ON public.work_parties(status);
CREATE INDEX IF NOT EXISTS idx_work_parties_created_by
    ON public.work_parties(created_by);

-- ============================================================================
-- 7. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_parties ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 8. RLS POLICIES - calendar_events
-- ============================================================================

DROP POLICY IF EXISTS calendar_events_select_authenticated ON public.calendar_events;
CREATE POLICY calendar_events_select_authenticated
    ON public.calendar_events FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS calendar_events_insert_manage ON public.calendar_events;
CREATE POLICY calendar_events_insert_manage
    ON public.calendar_events FOR INSERT TO authenticated
    WITH CHECK (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
    ));

DROP POLICY IF EXISTS calendar_events_update_manage ON public.calendar_events;
CREATE POLICY calendar_events_update_manage
    ON public.calendar_events FOR UPDATE TO authenticated
    USING (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
    ))
    WITH CHECK (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
    ));

DROP POLICY IF EXISTS calendar_events_delete_admin ON public.calendar_events;
CREATE POLICY calendar_events_delete_admin
    ON public.calendar_events FOR DELETE TO authenticated
    USING (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code = 'ADMIN'
    ));

-- ============================================================================
-- 9. RLS POLICIES - announcements
-- ============================================================================

DROP POLICY IF EXISTS announcements_select_authenticated ON public.announcements;
CREATE POLICY announcements_select_authenticated
    ON public.announcements FOR SELECT TO authenticated
    USING (is_active = true);

DROP POLICY IF EXISTS announcements_insert_send ON public.announcements;
CREATE POLICY announcements_insert_send
    ON public.announcements FOR INSERT TO authenticated
    WITH CHECK (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL')
    ));

DROP POLICY IF EXISTS announcements_update_send ON public.announcements;
CREATE POLICY announcements_update_send
    ON public.announcements FOR UPDATE TO authenticated
    USING (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL')
    ))
    WITH CHECK (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL')
    ));

DROP POLICY IF EXISTS announcements_delete_admin ON public.announcements;
CREATE POLICY announcements_delete_admin
    ON public.announcements FOR DELETE TO authenticated
    USING (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code = 'ADMIN'
    ));

-- ============================================================================
-- 10. RLS POLICIES - meetings
-- ============================================================================

DROP POLICY IF EXISTS meetings_select_authenticated ON public.meetings;
CREATE POLICY meetings_select_authenticated
    ON public.meetings FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS meetings_insert_manage ON public.meetings;
CREATE POLICY meetings_insert_manage
    ON public.meetings FOR INSERT TO authenticated
    WITH CHECK (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
    ));

DROP POLICY IF EXISTS meetings_update_manage ON public.meetings;
CREATE POLICY meetings_update_manage
    ON public.meetings FOR UPDATE TO authenticated
    USING (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
    ))
    WITH CHECK (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
    ));

DROP POLICY IF EXISTS meetings_delete_admin ON public.meetings;
CREATE POLICY meetings_delete_admin
    ON public.meetings FOR DELETE TO authenticated
    USING (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code = 'ADMIN'
    ));

-- ============================================================================
-- 11. RLS POLICIES - work_parties
-- ============================================================================

DROP POLICY IF EXISTS work_parties_select_authenticated ON public.work_parties;
CREATE POLICY work_parties_select_authenticated
    ON public.work_parties FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS work_parties_insert_manage ON public.work_parties;
CREATE POLICY work_parties_insert_manage
    ON public.work_parties FOR INSERT TO authenticated
    WITH CHECK (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
    ));

DROP POLICY IF EXISTS work_parties_update_manage ON public.work_parties;
CREATE POLICY work_parties_update_manage
    ON public.work_parties FOR UPDATE TO authenticated
    USING (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
    ))
    WITH CHECK (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
    ));

DROP POLICY IF EXISTS work_parties_delete_admin ON public.work_parties;
CREATE POLICY work_parties_delete_admin
    ON public.work_parties FOR DELETE TO authenticated
    USING (exists (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = (SELECT auth.uid())
          AND r.code = 'ADMIN'
    ));

-- ============================================================================
-- 12. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT ALL ON public.meetings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_parties TO authenticated;
GRANT ALL ON public.work_parties TO service_role;

-- ============================================================================
-- 13. UPDATED_AT TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER calendar_events_updated_at
    BEFORE UPDATE ON public.calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS announcements_updated_at ON public.announcements;
CREATE TRIGGER announcements_updated_at
    BEFORE UPDATE ON public.announcements
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS meetings_updated_at ON public.meetings;
CREATE TRIGGER meetings_updated_at
    BEFORE UPDATE ON public.meetings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS work_parties_updated_at ON public.work_parties;
CREATE TRIGGER work_parties_updated_at
    BEFORE UPDATE ON public.work_parties
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 14. AUDIT TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS calendar_events_audit_trigger ON public.calendar_events;
CREATE TRIGGER calendar_events_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_incident_changes();

DROP TRIGGER IF EXISTS announcements_audit_trigger ON public.announcements;
CREATE TRIGGER announcements_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.announcements
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_incident_changes();

DROP TRIGGER IF EXISTS meetings_audit_trigger ON public.meetings;
CREATE TRIGGER meetings_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.meetings
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_incident_changes();

DROP TRIGGER IF EXISTS work_parties_audit_trigger ON public.work_parties;
CREATE TRIGGER work_parties_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.work_parties
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_incident_changes();