-- ============================================================================
-- Migration: K17.0 – Zdravotná poisťovňa člena
-- Date: 20261123
-- BEZPEČNOSŤ: migrácia sa NEAPLIKUJE do produkčnej databázy.
-- Pridáva voliteľný stĺpec health_insurance do tabuľky members.
-- ============================================================================

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS health_insurance text NULL;

CREATE INDEX IF NOT EXISTS idx_members_health_insurance ON public.members(health_insurance);