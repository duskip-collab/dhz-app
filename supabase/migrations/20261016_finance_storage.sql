-- ============================================================================
-- Migration: K13.1.2 – Supabase Storage pre prílohy finančných dokladov
-- Date: 20261016
-- Purpose: Privátny bucket `finance_documents` pre účtenky/faktúry/doklady
--          + Storage RLS politiky na `storage.objects`, konzistentné s
--          kanonickým O5 permission modelom (has_permission).
-- ============================================================================

-- ============================================================================
-- 1. BUCKET (idempotentné vytvorenie / aktualizácia nastavení)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'finance_documents',
    'finance_documents',
    false,
    10485760,
    ARRAY[
        'application/pdf'::text,
        'image/jpeg'::text,
        'image/png'::text,
        'image/webp'::text
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- 2. STORAGE RLS (na storage.objects)
-- ============================================================================
-- Poznámka: ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; vynechávame, 
-- pretože RLS je na storage.objects zapnuté predvolene a príkaz vyžaduje vlastnáctvo tabuľky.

-- --- SELECT: čítanie pre finance.view ---
DROP POLICY IF EXISTS finance_documents_select ON storage.objects;
CREATE POLICY finance_documents_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'finance_documents'
    AND public.has_permission((SELECT auth.uid()), 'finance.view'::text)
);

-- --- INSERT: nahrávanie pre finance.create ---
DROP POLICY IF EXISTS finance_documents_insert ON storage.objects;
CREATE POLICY finance_documents_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'finance_documents'
    AND public.has_permission((SELECT auth.uid()), 'finance.create'::text)
);

-- --- UPDATE: úprava/nahradenie len pre finance.edit ---
DROP POLICY IF EXISTS finance_documents_update ON storage.objects;
CREATE POLICY finance_documents_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'finance_documents'
    AND public.has_permission((SELECT auth.uid()), 'finance.edit'::text)
)
WITH CHECK (
    bucket_id = 'finance_documents'
    AND public.has_permission((SELECT auth.uid()), 'finance.edit'::text)
);

-- --- DELETE: odstránenie len pre finance.edit ---
DROP POLICY IF EXISTS finance_documents_delete ON storage.objects;
CREATE POLICY finance_documents_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'finance_documents'
    AND public.has_permission((SELECT auth.uid()), 'finance.edit'::text)
);