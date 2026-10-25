-- ============================================================================
-- Migration: Rozšírenie – mazanie členov, fotografie inventára, dokumenty
--             (zápisnice), chat výboru, prístupové kódy a pravidlá
--             prihlasovania e-mailom. (FIXED SEARCH_PATH FOR PGCRYPTO)
-- Date: 20261108
-- ============================================================================

-- Uistenie sa, že pgcrypto existuje v schéme extensions alebo public
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================================
-- 1. PERMISSION: members.delete
-- ============================================================================

INSERT INTO public.permissions (code, name, description)
VALUES (
    'members.delete',
    'Členovia - zmazanie',
    'Trvalé vymazanie členského záznamu.'
)
ON CONFLICT (code) DO NOTHING;

-- ADMIN má members.delete
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'ADMIN'
  AND p.code = 'members.delete'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================================
-- 2. FOTOGRAFIA INVENTÁRA: stĺpec + bucket + Storage RLS
-- ============================================================================

ALTER TABLE public.equipment_items
    ADD COLUMN IF NOT EXISTS photo_path text;

COMMENT ON COLUMN public.equipment_items.photo_path
    IS 'Cesta fotografie položky v privátnom bucket-e equipment-photos.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'equipment-photos',
    'equipment-photos',
    false,
    5242880, -- 5 MB
    ARRAY[
        'image/jpeg'::text,
        'image/png'::text,
        'image/webp'::text
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS equipment_photos_select ON storage.objects;
CREATE POLICY equipment_photos_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'equipment-photos'
    AND public.has_permission((SELECT auth.uid()), 'inventory.view'::text)
);

DROP POLICY IF EXISTS equipment_photos_insert ON storage.objects;
CREATE POLICY equipment_photos_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'equipment-photos'
    AND (
        public.has_permission((SELECT auth.uid()), 'inventory.edit'::text)
        OR public.has_permission((SELECT auth.uid()), 'inventory.manage'::text)
    )
);

DROP POLICY IF EXISTS equipment_photos_update ON storage.objects;
CREATE POLICY equipment_photos_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'equipment-photos'
    AND (
        public.has_permission((SELECT auth.uid()), 'inventory.edit'::text)
        OR public.has_permission((SELECT auth.uid()), 'inventory.manage'::text)
    )
)
WITH CHECK (
    bucket_id = 'equipment-photos'
    AND (
        public.has_permission((SELECT auth.uid()), 'inventory.edit'::text)
        OR public.has_permission((SELECT auth.uid()), 'inventory.manage'::text)
    )
);

DROP POLICY IF EXISTS equipment_photos_delete ON storage.objects;
CREATE POLICY equipment_photos_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'equipment-photos'
    AND (
        public.has_permission((SELECT auth.uid()), 'inventory.edit'::text)
        OR public.has_permission((SELECT auth.uid()), 'inventory.manage'::text)
    )
);

-- ============================================================================
-- 3. DOKUMENTY ZBORU / ZÁPISNICE: organization_documents + bucket
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'org_documents',
    'org_documents',
    false,
    26214400, -- 25 MB
    ARRAY[
        'application/pdf'::text,
        'application/msword'::text,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'::text,
        'application/vnd.ms-excel'::text,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'::text
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.organization_documents (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category     text NOT NULL DEFAULT 'OTHER'
                 CHECK (category IN ('MINUTES', 'STATUTE', 'REPORT', 'FINANCE', 'OTHER')),
    title        text NOT NULL,
    description  text,
    file_name    text NOT NULL,
    storage_path text NOT NULL,
    mime_type    text NOT NULL,
    size_bytes   bigint NOT NULL DEFAULT 0,
    uploaded_by  uuid,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organization_documents IS
    'Dokumenty zboru – zápisnice z porád, štatúty, protokoly, plány (PDF/Word/Excel).';

CREATE INDEX IF NOT EXISTS idx_org_documents_category
    ON public.organization_documents (category, created_at DESC);

ALTER TABLE public.organization_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_documents_select ON public.organization_documents;
CREATE POLICY org_documents_select
ON public.organization_documents FOR SELECT
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'documents.view'::text));

DROP POLICY IF EXISTS org_documents_insert ON public.organization_documents;
CREATE POLICY org_documents_insert
ON public.organization_documents FOR INSERT
TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'documents.upload'::text));

DROP POLICY IF EXISTS org_documents_update ON public.organization_documents;
CREATE POLICY org_documents_update
ON public.organization_documents FOR UPDATE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'documents.upload'::text))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'documents.upload'::text));

DROP POLICY IF EXISTS org_documents_delete ON public.organization_documents;
CREATE POLICY org_documents_delete
ON public.organization_documents FOR DELETE
TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'documents.upload'::text));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_documents TO authenticated;
GRANT ALL ON public.organization_documents TO service_role;

DROP TRIGGER IF EXISTS org_documents_updated_at ON public.organization_documents;
CREATE TRIGGER org_documents_updated_at
    BEFORE UPDATE ON public.organization_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS org_documents_file_select ON storage.objects;
CREATE POLICY org_documents_file_select
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'org_documents'
    AND public.has_permission((SELECT auth.uid()), 'documents.view'::text)
);

DROP POLICY IF EXISTS org_documents_file_insert ON storage.objects;
CREATE POLICY org_documents_file_insert
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'org_documents'
    AND public.has_permission((SELECT auth.uid()), 'documents.upload'::text)
);

DROP POLICY IF EXISTS org_documents_file_delete ON storage.objects;
CREATE POLICY org_documents_file_delete
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'org_documents'
    AND public.has_permission((SELECT auth.uid()), 'documents.upload'::text)
);

-- ============================================================================
-- 4. CHAT VÝBORU: committee_messages (správy + vláknové odpovede)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.committee_messages (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id        uuid REFERENCES public.committee_messages (id) ON DELETE CASCADE,
    author_member_id uuid REFERENCES public.members (id) ON DELETE SET NULL,
    content          text NOT NULL CHECK (length(btrim(content)) > 0),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.committee_messages IS
    'Nástenka / chat výboru: správy (parent_id IS NULL) a odpovede (parent_id).';

CREATE INDEX IF NOT EXISTS idx_committee_messages_parent
    ON public.committee_messages (parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_committee_messages_created
    ON public.committee_messages (created_at DESC);

ALTER TABLE public.committee_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS committee_messages_select ON public.committee_messages;
CREATE POLICY committee_messages_select
ON public.committee_messages FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS committee_messages_insert ON public.committee_messages;
CREATE POLICY committee_messages_insert
ON public.committee_messages FOR INSERT
TO authenticated
WITH CHECK (
    public.has_permission((SELECT auth.uid()), 'communication.send'::text)
    AND (
        author_member_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.id = author_member_id
              AND m.auth_user_id = (SELECT auth.uid())
        )
    )
);

DROP POLICY IF EXISTS committee_messages_update ON public.committee_messages;
CREATE POLICY committee_messages_update
ON public.committee_messages FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.id = author_member_id
          AND m.auth_user_id = (SELECT auth.uid())
    )
)
WITH CHECK (true);

DROP POLICY IF EXISTS committee_messages_delete ON public.committee_messages;
CREATE POLICY committee_messages_delete
ON public.committee_messages FOR DELETE
TO authenticated
USING (
    public.has_role((SELECT auth.uid()), 'ADMIN'::text)
    OR EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.id = author_member_id
          AND m.auth_user_id = (SELECT auth.uid())
    )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.committee_messages TO authenticated;
GRANT ALL ON public.committee_messages TO service_role;

DROP TRIGGER IF EXISTS committee_messages_updated_at ON public.committee_messages;
CREATE TRIGGER committee_messages_updated_at
    BEFORE UPDATE ON public.committee_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 5. PRÍSTUPOVÉ KÓDY: member_access_codes
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.member_access_codes (
    user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    code_hash  text NOT NULL,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.member_access_codes IS
    'Evidencia vygenerovaných prístupových kódov.';

ALTER TABLE public.member_access_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_access_codes_select ON public.member_access_codes;
CREATE POLICY member_access_codes_select
ON public.member_access_codes FOR SELECT
TO authenticated
USING (
    public.has_role((SELECT auth.uid()), 'ADMIN'::text)
    OR public.has_role((SELECT auth.uid()), 'VELITEL'::text)
);

DROP POLICY IF EXISTS member_access_codes_all ON public.member_access_codes;
CREATE POLICY member_access_codes_all
ON public.member_access_codes FOR ALL
TO authenticated
USING (
    public.has_role((SELECT auth.uid()), 'ADMIN'::text)
    OR public.has_role((SELECT auth.uid()), 'VELITEL'::text)
)
WITH CHECK (
    public.has_role((SELECT auth.uid()), 'ADMIN'::text)
    OR public.has_role((SELECT auth.uid()), 'VELITEL'::text)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_access_codes TO authenticated;
GRANT ALL ON public.member_access_codes TO service_role;

DROP TRIGGER IF EXISTS member_access_codes_updated_at ON public.member_access_codes;
CREATE TRIGGER member_access_codes_updated_at
    BEFORE UPDATE ON public.member_access_codes
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 6. FUNKCIE: search_path zahŕňa extensions pre pgcrypto (digest, crypt)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- is_email_login_allowed(email)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_email_login_allowed(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT
        EXISTS (
            SELECT 1
            FROM auth.users u
            JOIN public.user_roles ur ON ur.user_id = u.id
            JOIN public.roles r ON r.id = ur.role_id
            WHERE lower(u.email) = lower(p_email)
              AND r.code = 'ADMIN'
        )
        OR EXISTS (
            SELECT 1
            FROM public.members m
            WHERE lower(m.email) = lower(p_email)
              AND m.status = 'active'
              AND m.auth_user_id IS NOT NULL
        );
$$;

REVOKE ALL ON FUNCTION public.is_email_login_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_email_login_allowed(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- resolve_access_code(code) -> email používateľa
-- Pridané search_path = public, extensions a pgcrypto.digest(...)
-- ---------------------------------------------------------------------------
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
    WHERE mac.code_hash = encode(digest(lower(trim(coalesce(p_code, '')))::bytea, 'sha256'::text), 'hex')
      AND u.email IS NOT NULL
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_access_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_access_code(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- set_member_access_code(user_id, code)
-- Pridané search_path = public, extensions a pgcrypto funkcie
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_member_access_code(p_user_id uuid, p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid   uuid := (SELECT auth.uid());
    v_code  text := btrim(coalesce(p_code, ''));
    v_email text;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT (public.has_role(v_uid, 'ADMIN') OR public.has_role(v_uid, 'VELITEL')) THEN
        RAISE EXCEPTION 'Forbidden: ADMIN or VELITEL role required';
    END IF;
    IF length(v_code) < 6 THEN
        RAISE EXCEPTION 'Access code must be at least 6 characters';
    END IF;

    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user_id;
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    -- Kód = nové heslo účtu (bcrypt)
    UPDATE auth.users
       SET encrypted_password = crypt(v_code, gen_salt('bf', 10)),
           updated_at = now()
     WHERE id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    INSERT INTO public.member_access_codes (user_id, code_hash, created_by)
    VALUES (p_user_id, encode(digest(v_code::bytea, 'sha256'::text), 'hex'), v_uid)
    ON CONFLICT (user_id) DO UPDATE
        SET code_hash  = EXCLUDED.code_hash,
            created_by = EXCLUDED.created_by,
            updated_at = now();

    RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.set_member_access_code(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_member_access_code(uuid, text) TO authenticated;

-- ============================================================================
-- 7. user_roles / user_permissions: ADMIN alebo VELITEL môžu spravovať
-- ============================================================================

DROP POLICY IF EXISTS user_roles_manage_admin ON public.user_roles;
CREATE POLICY user_roles_manage_admin
ON public.user_roles FOR ALL TO authenticated
USING (public.has_role((SELECT auth.uid()), 'ADMIN') OR public.has_role((SELECT auth.uid()), 'VELITEL'))
WITH CHECK (public.has_role((SELECT auth.uid()), 'ADMIN') OR public.has_role((SELECT auth.uid()), 'VELITEL'));

DROP POLICY IF EXISTS user_permissions_manage_admin ON public.user_permissions;
CREATE POLICY user_permissions_manage_admin
ON public.user_permissions FOR ALL TO authenticated
USING (public.has_role((SELECT auth.uid()), 'ADMIN') OR public.has_role((SELECT auth.uid()), 'VELITEL'))
WITH CHECK (public.has_role((SELECT auth.uid()), 'ADMIN') OR public.has_role((SELECT auth.uid()), 'VELITEL'));