-- Migration: Competition team + lineup atomic save (RPC transaction)
-- Date: 20261011
-- Purpose: Provide a single transactional function that creates/updates a
--          competition team AND replaces its lineup atomically. Prevents partial
--          saves (team without lineup, or vice versa) that the previous
--          step-by-step Supabase JS writes could produce.
--
-- Security model:
--   - SECURITY INVOKER (default): runs with the caller's privileges, so existing
--     RLS policies on competition_teams / competition_lineups remain enforced.
--   - Defense-in-depth: explicit has_permission('competition.edit') check with a
--     clear 42501 error, because a denied UPDATE would otherwise silently no-op.
--   - Audit: existing AFTER triggers on both tables still fire inside the
--     transaction, preserving the O5 append-only audit trail.
--
-- Idempotency: CREATE OR REPLACE + explicit GRANT. No destructive DDL.

CREATE OR REPLACE FUNCTION public.save_team_with_lineup(
    p_team_id UUID,
    p_competition_id UUID,
    p_name TEXT,
    p_result_time NUMERIC,
    p_result_points INTEGER,
    p_rank INTEGER,
    p_note TEXT,
    p_lineup JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_team_id UUID;
    v_uid UUID;
BEGIN
    v_uid := auth.uid();

    -- Explicit permission check (defense-in-depth alongside RLS).
    IF NOT public.has_permission(v_uid, 'competition.edit') THEN
        RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
    END IF;

    -- 1) Create or update the team (RLS enforces create/edit per operation).
    IF p_team_id IS NULL THEN
        INSERT INTO public.competition_teams (
            competition_id, name, result_time, result_points, rank, note,
            created_by, updated_by
        ) VALUES (
            p_competition_id, p_name, p_result_time, p_result_points, p_rank, p_note,
            v_uid, v_uid
        )
        RETURNING id INTO v_team_id;
    ELSE
        UPDATE public.competition_teams
        SET name = p_name,
            result_time = p_result_time,
            result_points = p_result_points,
            rank = p_rank,
            note = p_note,
            updated_by = v_uid
        WHERE id = p_team_id
        RETURNING id INTO v_team_id;

        IF v_team_id IS NULL THEN
            RAISE EXCEPTION 'Team not found' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    -- 2) Replace the lineup for THIS team only. Scoped by team_id, so a team
    --    belongs to exactly one competition; positions in other competitions and
    --    the members table itself are never touched.
    DELETE FROM public.competition_lineups WHERE team_id = v_team_id;

    IF p_lineup IS NOT NULL AND jsonb_typeof(p_lineup) = 'array'
       AND jsonb_array_length(p_lineup) > 0 THEN
        INSERT INTO public.competition_lineups (team_id, member_id, position)
        SELECT v_team_id,
               (entry->>'member_id')::UUID,
               entry->>'position'
        FROM jsonb_array_elements(p_lineup) AS entry;
    END IF;

    RETURN v_team_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_team_with_lineup(
    UUID, UUID, TEXT, NUMERIC, INTEGER, INTEGER, TEXT, JSONB
) TO authenticated;
