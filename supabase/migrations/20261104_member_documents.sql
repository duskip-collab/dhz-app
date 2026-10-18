-- K15.2 Phase 4: Member Documents Table & Storage
-- Date: 2026-10-18
-- Purpose: Track member documents (passports, certificates, medical forms, etc.)
-- Stores metadata; actual files in Supabase Storage

CREATE TABLE IF NOT EXISTS public.member_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL,         -- passport, medical, certificate, insurance, ID, training, etc.
  file_name VARCHAR(255) NOT NULL,            -- Original filename
  file_path TEXT NOT NULL,                    -- Supabase Storage path: members/{member_id}/documents/...
  file_size INTEGER,                          -- File size in bytes
  mime_type VARCHAR(100),                     -- Content type (application/pdf, image/jpeg, etc.)
  issue_date DATE,                            -- When document was issued
  expiry_date DATE,                           -- When document expires (NULL = no expiry)
  notes TEXT,                                 -- Additional notes or restrictions
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_member_documents_member_id 
  ON public.member_documents(member_id);

CREATE INDEX IF NOT EXISTS idx_member_documents_document_type 
  ON public.member_documents(document_type);

CREATE INDEX IF NOT EXISTS idx_member_documents_expiry_date 
  ON public.member_documents(expiry_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_member_documents_created_at 
  ON public.member_documents(created_at DESC);

-- Enable RLS
ALTER TABLE public.member_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT - All authenticated users can view member documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'member_documents' 
    AND policyname = 'select_authenticated_users'
  ) THEN
    CREATE POLICY select_authenticated_users 
      ON public.member_documents 
      FOR SELECT 
      TO authenticated 
      USING (true);
  END IF;
END $$;

-- RLS Policy: INSERT - Users with MEMBERS_EDIT role or admin roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'member_documents' 
    AND policyname = 'insert_members_edit_role'
  ) THEN
    CREATE POLICY insert_members_edit_role 
      ON public.member_documents 
      FOR INSERT 
      TO authenticated 
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          INNER JOIN public.roles r ON ur.role_id = r.id
          WHERE ur.user_id = auth.uid()
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
        )
      );
  END IF;
END $$;

-- RLS Policy: UPDATE - Users with MEMBERS_EDIT role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'member_documents' 
    AND policyname = 'update_members_edit_role'
  ) THEN
    CREATE POLICY update_members_edit_role 
      ON public.member_documents 
      FOR UPDATE 
      TO authenticated 
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          INNER JOIN public.roles r ON ur.role_id = r.id
          WHERE ur.user_id = auth.uid()
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          INNER JOIN public.roles r ON ur.role_id = r.id
          WHERE ur.user_id = auth.uid()
          AND r.code IN ('ADMIN', 'VEDENIE', 'VELITEL', 'TRENER')
        )
      );
  END IF;
END $$;

-- RLS Policy: DELETE - Only ADMIN role can delete documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'member_documents' 
    AND policyname = 'delete_admin_only'
  ) THEN
    CREATE POLICY delete_admin_only 
      ON public.member_documents 
      FOR DELETE 
      TO authenticated 
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          INNER JOIN public.roles r ON ur.role_id = r.id
          WHERE ur.user_id = auth.uid()
          AND r.code = 'ADMIN'
        )
      );
  END IF;
END $$;

-- Grant permissions
DO $$
BEGIN
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.member_documents TO authenticated';
  EXECUTE 'GRANT ALL ON public.member_documents TO service_role';
  EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Trigger: Auto-update updated_at
CREATE OR REPLACE FUNCTION update_member_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_member_documents_updated_at 
  ON public.member_documents;

CREATE TRIGGER trigger_member_documents_updated_at
  BEFORE UPDATE ON public.member_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_member_documents_updated_at();

-- Trigger: Auto-set created_by on INSERT
CREATE OR REPLACE FUNCTION set_member_documents_created_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_member_documents_created_by 
  ON public.member_documents;

CREATE TRIGGER trigger_member_documents_created_by
  BEFORE INSERT ON public.member_documents
  FOR EACH ROW
  EXECUTE FUNCTION set_member_documents_created_by();

-- Audit log
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
    INSERT INTO public.audit_log (action, table_name, details, created_at)
    VALUES ('MIGRATION', 'member_documents', 'Created member_documents table', now())
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

COMMIT;
