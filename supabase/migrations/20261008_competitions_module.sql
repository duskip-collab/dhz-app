-- Migration: Competitions & Representation Module (Súťaže a Reprezentácia)
-- Date: 20261010
-- Purpose: Create database model for competitions, competition teams and lineups.
--          Consistent with K8.1 members / K9.1 training modules (O5 security model).
--
-- Idempotency: uses IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS so
--              re-running is safe and non-destructive. No DROP of Core tables.
--
-- Permissions used (from existing O5 catalog, NOT re-declared here):
--   competition.view, competition.create, competition.edit

-- ============================================================================
-- 1. COMPETITIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.competitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    location TEXT,
    date TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    league TEXT,
    category TEXT NOT NULL
        CHECK (category IN (
            'MEN', 'WOMEN', 'DORAST_BOYS', 'DORAST_GIRLS',
            'PLAMEN_BOYS', 'PLAMEN_GIRLS', 'MIX'
        )),
    description TEXT,
    organizer TEXT,
    status TEXT NOT NULL DEFAULT 'PLANNED'
        CHECK (status IN ('PLANNED', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT chk_competition_time CHECK (end_time IS NULL OR end_time >= date)
);

-- ============================================================================
-- 2. COMPETITION_TEAMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.competition_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    result_time NUMERIC(6,2),
    result_points INTEGER,
    rank INTEGER,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================================================
-- 3. COMPETITION_LINEUPS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.competition_lineups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.competition_teams(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    position TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_competition_lineup_team_member_position UNIQUE (team_id, member_id, position)
);

-- ============================================================================
-- 4. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_competitions_date_status_category
    ON public.competitions(date, status, category);
CREATE INDEX IF NOT EXISTS idx_competitions_created_by
    ON public.competitions(created_by);

CREATE INDEX IF NOT EXISTS idx_competition_teams_competition_id_rank
    ON public.competition_teams(competition_id, rank);
CREATE INDEX IF NOT EXISTS idx_competition_teams_created_by
    ON public.competition_teams(created_by);

CREATE INDEX IF NOT EXISTS idx_competition_lineups_team_id_member_id
    ON public.competition_lineups(team_id, member_id);
CREATE INDEX IF NOT EXISTS idx_competition_lineups_member_id
    ON public.competition_lineups(member_id);

-- ============================================================================
-- 5. TRIGGERS: updated_at
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

DROP TRIGGER IF EXISTS competitions_set_updated_at ON public.competitions;
CREATE TRIGGER competitions_set_updated_at
BEFORE UPDATE ON public.competitions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS competition_teams_set_updated_at ON public.competition_teams;
CREATE TRIGGER competition_teams_set_updated_at
BEFORE UPDATE ON public.competition_teams
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_lineups ENABLE ROW LEVEL SECURITY;

-- --- competitions policies ---
DROP POLICY IF EXISTS competitions_select_authenticated ON public.competitions;
DROP POLICY IF EXISTS competitions_insert_authenticated ON public.competitions;
DROP POLICY IF EXISTS competitions_update_authenticated ON public.competitions;
DROP POLICY IF EXISTS competitions_delete_authenticated ON public.competitions;

-- SELECT: competition.view
CREATE POLICY competitions_select_authenticated
ON public.competitions
FOR SELECT
TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'competition.view')
);

-- INSERT: competition.create
CREATE POLICY competitions_insert_authenticated
ON public.competitions
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'competition.create')
);

-- UPDATE: competition.edit
CREATE POLICY competitions_update_authenticated
ON public.competitions
FOR UPDATE
TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'competition.edit')
)
WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'competition.edit')
);

-- DELETE: competition.edit
CREATE POLICY competitions_delete_authenticated
ON public.competitions
FOR DELETE
TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'competition.edit')
);

-- --- competition_teams policies ---
DROP POLICY IF EXISTS competition_teams_select_authenticated ON public.competition_teams;
DROP POLICY IF EXISTS competition_teams_insert_authenticated ON public.competition_teams;
DROP POLICY IF EXISTS competition_teams_update_authenticated ON public.competition_teams;
DROP POLICY IF EXISTS competition_teams_delete_authenticated ON public.competition_teams;

-- SELECT: competition.view
CREATE POLICY competition_teams_select_authenticated
ON public.competition_teams
FOR SELECT
TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'competition.view')
);

-- INSERT: competition.create
CREATE POLICY competition_teams_insert_authenticated
ON public.competition_teams
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'competition.create')
);

-- UPDATE: competition.edit
CREATE POLICY competition_teams_update_authenticated
ON public.competition_teams
FOR UPDATE
TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'competition.edit')
)
WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'competition.edit')
);

-- DELETE: competition.edit
CREATE POLICY competition_teams_delete_authenticated
ON public.competition_teams
FOR DELETE
TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'competition.edit')
);

-- --- competition_lineups policies ---
DROP POLICY IF EXISTS competition_lineups_select_authenticated ON public.competition_lineups;
DROP POLICY IF EXISTS competition_lineups_insert_authenticated ON public.competition_lineups;
DROP POLICY IF EXISTS competition_lineups_update_authenticated ON public.competition_lineups;
DROP POLICY IF EXISTS competition_lineups_delete_authenticated ON public.competition_lineups;

-- SELECT: competition.view
CREATE POLICY competition_lineups_select_authenticated
ON public.competition_lineups
FOR SELECT
TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'competition.view')
);

-- INSERT: competition.create
CREATE POLICY competition_lineups_insert_authenticated
ON public.competition_lineups
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'competition.create')
);

-- UPDATE: competition.edit
CREATE POLICY competition_lineups_update_authenticated
ON public.competition_lineups
FOR UPDATE
TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'competition.edit')
)
WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'competition.edit')
);

-- DELETE: competition.edit
CREATE POLICY competition_lineups_delete_authenticated
ON public.competition_lineups
FOR DELETE
TO authenticated
USING (
    public.has_permission((SELECT auth.uid()), 'competition.edit')
);


-- ============================================================================
-- 7. AUDIT INTEGRATION (writes to existing public.audit_log)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_competition_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_action TEXT;
    v_module TEXT;
BEGIN
    IF TG_TABLE_NAME = 'competitions' THEN
        v_module := 'competitions';
    ELSIF TG_TABLE_NAME = 'competition_teams' THEN
        v_module := 'competition_teams';
    ELSE
        v_module := 'competition_lineups';
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_action := CASE
            WHEN TG_TABLE_NAME = 'competitions' THEN 'COMPETITION_CREATE'
            WHEN TG_TABLE_NAME = 'competition_teams' THEN 'COMPETITION_TEAM_UPDATE'
            ELSE 'COMPETITION_LINEUP_UPDATE'
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
            WHEN TG_TABLE_NAME = 'competitions' THEN 'COMPETITION_UPDATE'
            WHEN TG_TABLE_NAME = 'competition_teams' THEN 'COMPETITION_TEAM_UPDATE'
            ELSE 'COMPETITION_LINEUP_UPDATE'
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
            WHEN TG_TABLE_NAME = 'competitions' THEN 'COMPETITION_DELETE'
            WHEN TG_TABLE_NAME = 'competition_teams' THEN 'COMPETITION_TEAM_DELETE'
            ELSE 'COMPETITION_LINEUP_DELETE'
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
-- 8. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitions TO authenticated;
GRANT ALL ON public.competitions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competition_teams TO authenticated;
GRANT ALL ON public.competition_teams TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competition_lineups TO authenticated;
GRANT ALL ON public.competition_lineups TO service_role;

-- Function grants
GRANT EXECUTE ON FUNCTION public.audit_competition_changes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;

-- ============================================================================
-- 9. AUDIT TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS competitions_audit_trigger ON public.competitions;
CREATE TRIGGER competitions_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.competitions
FOR EACH ROW
EXECUTE FUNCTION public.audit_competition_changes();

DROP TRIGGER IF EXISTS competition_teams_audit_trigger ON public.competition_teams;
CREATE TRIGGER competition_teams_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.competition_teams
FOR EACH ROW
EXECUTE FUNCTION public.audit_competition_changes();

DROP TRIGGER IF EXISTS competition_lineups_audit_trigger ON public.competition_lineups;
CREATE TRIGGER competition_lineups_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.competition_lineups
FOR EACH ROW
EXECUTE FUNCTION public.audit_competition_changes();

