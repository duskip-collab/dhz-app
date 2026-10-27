-- ============================================================================
-- Migration: K16.0 – Správa prístupu člena, roly, oprávnenia a pozývacie kódy
-- Date: 20261122
-- BEZPEČNOSŤ: migrácia sa NEAPLIKUJE do produkčnej databázy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Zobrazenie stavu prístupu člena (aktivná pozvánka / účet / bez prístupu)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.member_access_status AS
SELECT
  m.id AS member_id,
  m.auth_user_id,
  m.email,
  m.status AS member_status,
  CASE
    WHEN m.auth_user_id IS NULL THEN 'no_account'
    WHEN EXISTS (
      SELECT 1 FROM public.invitations i
      WHERE i.member_id = m.id
        AND i.status = 'active'
        AND i.expires_at > now()
        AND i.use_count < i.max_uses
    ) THEN 'invitation_pending'
    WHEN EXISTS (
      SELECT 1 FROM public.invitations i
      WHERE i.member_id = m.id
        AND i.status = 'consumed'
    ) THEN 'account_activated'
    ELSE 'account_no_invitation'
  END AS access_status,
  i.id AS invitation_id,
  i.role AS invitation_role,
  i.expires_at AS invitation_expires_at,
  i.status AS invitation_status,
  i.use_count AS invitation_use_count,
  i.max_uses AS invitation_max_uses
FROM public.members m
LEFT JOIN LATERAL (
  SELECT id, role, expires_at, status, use_count, max_uses
  FROM public.invitations
  WHERE member_id = m.id
  ORDER BY created_at DESC
  LIMIT 1
) i ON true;

-- ----------------------------------------------------------------------------
-- 2. Uniká active pozvánka na člena (idempotencia: len jedna aktívna)
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_one_active_per_member
  ON public.invitations (member_id)
  WHERE status = 'active' AND member_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. RLS pre zobrazenie member_access_status (admin/velitel cez auth.uid())
-- ----------------------------------------------------------------------------
ALTER VIEW public.member_access_status OWNER TO postgres;
GRANT SELECT ON public.member_access_status TO authenticated;
GRANT SELECT ON public.member_access_status TO service_role;