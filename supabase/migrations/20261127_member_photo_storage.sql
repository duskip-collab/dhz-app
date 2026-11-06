-- Private Storage bucket and permission policies for member profile photos.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'member-photos',
    'member-photos',
    false,
    5242880,
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

DROP POLICY IF EXISTS member_photos_select ON storage.objects;
CREATE POLICY member_photos_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'member-photos'
    AND public.has_permission((SELECT auth.uid()), 'members.view'::text)
);

DROP POLICY IF EXISTS member_photos_insert ON storage.objects;
CREATE POLICY member_photos_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'member-photos'
    AND public.has_permission((SELECT auth.uid()), 'members.edit'::text)
);

DROP POLICY IF EXISTS member_photos_update ON storage.objects;
CREATE POLICY member_photos_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'member-photos'
    AND public.has_permission((SELECT auth.uid()), 'members.edit'::text)
)
WITH CHECK (
    bucket_id = 'member-photos'
    AND public.has_permission((SELECT auth.uid()), 'members.edit'::text)
);

DROP POLICY IF EXISTS member_photos_delete ON storage.objects;
CREATE POLICY member_photos_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'member-photos'
    AND public.has_permission((SELECT auth.uid()), 'members.edit'::text)
);
