-- ============================================================================
-- Migration: member_rank_and_position — Hodnosť a funkčné zaradenie člena
-- Date: 20261106
-- Status: Forward-only, IDEMPOTENTNÁ (ADD COLUMN IF NOT EXISTS)
--
-- Účel: doplniť do public.members stĺpce pre:
--   rank                – hodnosť člena (hasič, starší hasič, veliteľ družstva, ...)
--   position            – funkčné / zásahové zaradenie (strojník, vodič, rozvádzač,
--                          člen výboru, veliteľ jednotky, ...)
--   is_committee_member – príznak člena výboru DHZ (legacy stĺpec z 20261006;
--                          doplnený idempotentne pre kanonický model).
-- ============================================================================

ALTER TABLE public.members
    ADD COLUMN IF NOT EXISTS rank text;

ALTER TABLE public.members
    ADD COLUMN IF NOT EXISTS position text;

ALTER TABLE public.members
    ADD COLUMN IF NOT EXISTS is_committee_member boolean NOT NULL DEFAULT false;

-- Index pre budúce filtrovanie podľa zaradenia (voliteľné, ale lacné).
CREATE INDEX IF NOT EXISTS idx_members_position
    ON public.members(position)
    WHERE position IS NOT NULL;

-- ============================================================================
-- Overenie po aplikácii:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='members'
--    AND column_name IN ('rank', 'position', 'is_committee_member')
--    ORDER BY ordinal_position;
-- ============================================================================