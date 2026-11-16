-- K29: Keep announcements on the existing content/priority/is_active schema.
-- Replaces the role-based write policies with active committee ownership.

CREATE OR REPLACE FUNCTION public.is_active_committee_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.members AS member
        WHERE member.auth_user_id = (SELECT auth.uid())
          AND member.is_committee_member = true
          AND member.status = 'active'
    );
$$;

REVOKE ALL ON FUNCTION public.is_active_committee_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_committee_member() TO authenticated;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcements_select_authenticated ON public.announcements;
DROP POLICY IF EXISTS announcements_insert_send ON public.announcements;
DROP POLICY IF EXISTS announcements_update_send ON public.announcements;
DROP POLICY IF EXISTS announcements_delete_admin ON public.announcements;
DROP POLICY IF EXISTS announcements_select_all ON public.announcements;
DROP POLICY IF EXISTS announcements_insert_committee ON public.announcements;
DROP POLICY IF EXISTS announcements_update_committee ON public.announcements;
DROP POLICY IF EXISTS announcements_delete_committee ON public.announcements;

CREATE POLICY announcements_select_authenticated
    ON public.announcements
    FOR SELECT
    TO authenticated
    USING (is_active = true OR public.is_active_committee_member());

CREATE POLICY announcements_insert_committee
    ON public.announcements
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_active_committee_member()
        AND created_by = (SELECT auth.uid())
    );

CREATE POLICY announcements_update_committee
    ON public.announcements
    FOR UPDATE
    TO authenticated
    USING (
        public.is_active_committee_member()
        AND created_by = (SELECT auth.uid())
    )
    WITH CHECK (
        public.is_active_committee_member()
        AND created_by = (SELECT auth.uid())
    );

CREATE POLICY announcements_delete_committee
    ON public.announcements
    FOR DELETE
    TO authenticated
    USING (
        public.is_active_committee_member()
        AND created_by = (SELECT auth.uid())
    );
