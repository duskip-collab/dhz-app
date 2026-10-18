-- ============================================================================
-- Migration: member_courses — Kvalifikácie, certifikácie a kurzy členov
-- Date: 20261102
-- Status: New feature for K15.2 — Member profiles enhancements
-- 
-- Účel: Umožniť evidenciu kurzov, certifikácií a kvalifikácií členov DHZ.
--       Vrátane dátumov, inštitúcií a poznámok.
-- 
-- Bezpečnosť: IDEMPOTENTNÁ migrácia. Všetky zmeny sú strážené
--            kontrolami existencie (IF NOT EXISTS).
-- ============================================================================

-- ============================================================================
-- 0. PRE-FLIGHT CHECKS
-- ============================================================================

DO $preflight$
BEGIN
    IF to_regclass('public.members') IS NULL THEN
        RAISE EXCEPTION 'member_courses: public.members neexistuje — najprv aplikujte 20261006';
    END IF;
END;
$preflight$;

-- ============================================================================
-- 1. CREATE TABLE member_courses
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.member_courses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Cudzi kluč k členom
    member_id uuid NOT NULL
        REFERENCES public.members(id) ON DELETE CASCADE,
    
    -- Čitateľný názov kurzu/certifikácie
    course_name text NOT NULL,
    
    -- Dátumy
    certification_date date,           -- Kedy bol kurz ukončený
    expiry_date date,                  -- Kedy vypršiava validita (nullable pre bez termínu)
    
    -- Informácie o vydavateľovi/poskytovateľovi
    issuing_authority text,            -- Inštitúcia, ktorá vydala certifikát
    certificate_number text,           -- Interný identifikátor certifikátu
    
    -- Poznámky
    notes text,
    
    -- Audit columns
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid
        REFERENCES public.auth.users(id) ON DELETE SET NULL,
    
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid
        REFERENCES public.auth.users(id) ON DELETE SET NULL,
    
    -- Zachytáva kombinácii (člen + kurz + dátum) — zabráni duplikovaniu
    UNIQUE(member_id, course_name, certification_date)
);

-- ============================================================================
-- 2. INDEXES na frequent queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_member_courses_member_id
    ON public.member_courses(member_id);

CREATE INDEX IF NOT EXISTS idx_member_courses_expiry_date
    ON public.member_courses(expiry_date)
    WHERE expiry_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_member_courses_created_at
    ON public.member_courses(created_at DESC);

-- ============================================================================
-- 3. ENABLE RLS
-- ============================================================================

ALTER TABLE public.member_courses ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

-- SELECT: Všetci autentifikovaní užívatelia môžu čítať (MEMBERS_VIEW)
DROP POLICY IF EXISTS member_courses_select_authenticated
    ON public.member_courses;
CREATE POLICY member_courses_select_authenticated
    ON public.member_courses FOR SELECT TO authenticated
    USING (true);

-- INSERT: Iba MEMBERS_EDIT (alebo ADMIN)
DROP POLICY IF EXISTS member_courses_insert_authorized
    ON public.member_courses;
CREATE POLICY member_courses_insert_authorized
    ON public.member_courses FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON r.id = ur.role_id
            WHERE ur.user_id = auth.uid()
              AND (r.code = 'ADMIN' OR r.code = 'VEDENIE' OR r.code = 'VELITEL' OR r.code = 'TRENER')
        )
    );

-- UPDATE: Iba MEMBERS_EDIT (alebo ADMIN)
DROP POLICY IF EXISTS member_courses_update_authorized
    ON public.member_courses;
CREATE POLICY member_courses_update_authorized
    ON public.member_courses FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON r.id = ur.role_id
            WHERE ur.user_id = auth.uid()
              AND (r.code = 'ADMIN' OR r.code = 'VEDENIE' OR r.code = 'VELITEL' OR r.code = 'TRENER')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON r.id = ur.role_id
            WHERE ur.user_id = auth.uid()
              AND (r.code = 'ADMIN' OR r.code = 'VEDENIE' OR r.code = 'VELITEL' OR r.code = 'TRENER')
        )
    );

-- DELETE: Iba ADMIN
DROP POLICY IF EXISTS member_courses_delete_admin
    ON public.member_courses;
CREATE POLICY member_courses_delete_admin
    ON public.member_courses FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON r.id = ur.role_id
            WHERE ur.user_id = auth.uid()
              AND r.code = 'ADMIN'
        )
    );

-- ============================================================================
-- 5. PERMISSIONS (GRANT)
-- ============================================================================

REVOKE ALL ON TABLE public.member_courses FROM public, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.member_courses TO authenticated;
GRANT ALL ON TABLE public.member_courses TO service_role;

-- Práva na sequence (pre auto-ID)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ============================================================================
-- 6. VERIFICATION QUERIES (spúšťa DBA na DEV)
-- ============================================================================

-- Po aplikácii skontroluj:
-- 
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='member_courses'
--  ORDER BY ordinal_position;
-- 
-- Expected columns:
--   id, member_id, course_name, certification_date, expiry_date,
--   issuing_authority, certificate_number, notes,
--   created_at, created_by, updated_at, updated_by
-- 
-- SELECT schemaname, tablename FROM pg_tables
--  WHERE tablename = 'member_courses';
-- 
-- Expected: "public" | "member_courses"
-- 
-- SELECT tablename, indexname FROM pg_indexes
--  WHERE tablename = 'member_courses';
-- 
-- Expected indexes:
--   idx_member_courses_member_id
--   idx_member_courses_expiry_date
--   idx_member_courses_created_at
-- 
-- SELECT table_name, policy_name FROM pg_policy
--  WHERE table_name = 'member_courses' ORDER BY policy_name;
-- 
-- Expected policies:
--   member_courses_delete_admin
--   member_courses_insert_authorized
--   member_courses_select_authenticated
--   member_courses_update_authorized
--
-- ============================================================================
