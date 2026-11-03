-- ============================================================================
-- Migration: Fix resolve_access_code case sensitivity
-- Date: 20261125
--
-- PROBLÉM: resolve_access_code lowercases the code before hashing (sha256(lower(trim(code)))),
--          but set_member_access_code stores sha256(btrim(code)) WITHOUT lowercasing.
--          For uppercase codes (admin generates .toUpperCase()), the hashes don't match
--          and login fails.
--
-- RIEŠENIE: Make resolve_access_code use the same hash computation as set_member_access_code
--           (no lowercase, only trim).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_access_code(p_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT u.email
    FROM public.member_access_codes mac
    JOIN auth.users u ON u.id = mac.user_id
    WHERE mac.code_hash = encode(digest(trim(coalesce(p_code, ''))::bytea, 'sha256'::text), 'hex')
      AND u.email IS NOT NULL
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_access_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_access_code(text) TO anon, authenticated;

-- ============================================================================
-- KONIEC migrácie 20261125_fix_resolve_access_code_case.sql
-- ============================================================================