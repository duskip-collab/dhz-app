-- =============================================================================
-- Migration: K25.0 – Add onboarding_completed flag to members table
-- Date: 2026-12-XX
-- Purpose: Track whether a member has completed the onboarding profile setup.
-- Idempotent (safe to run multiple times).
-- =============================================================================

-- Add onboarding_completed column if not exists
ALTER TABLE public.members
    ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.members.onboarding_completed IS
    'Flag indicating whether the member has completed the initial onboarding profile setup (first login). Default false.';

-- Create index for fast lookup of members pending onboarding
CREATE INDEX IF NOT EXISTS idx_members_onboarding_completed
    ON public.members (onboarding_completed)
    WHERE onboarding_completed = false;

-- Grant permissions using proper PostgreSQL column-level syntax
-- GRANT SELECT on specific column
GRANT SELECT (onboarding_completed) ON public.members TO authenticated;
-- GRANT UPDATE on specific column
GRANT UPDATE (onboarding_completed) ON public.members TO authenticated;

-- =============================================================================
-- End of migration
-- =============================================================================