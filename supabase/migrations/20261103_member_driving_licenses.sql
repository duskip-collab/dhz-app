-- K15.2 Phase 3: Member Driving Licenses Table
-- Date: 2026-10-18
-- Purpose: Track driver's licenses (categories, expiry dates, countries)
-- Idempotent: Uses IF NOT EXISTS guards for safe re-execution

-- Create enum for license categories (optional - can use VARCHAR instead)
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'license_category') THEN
--     CREATE TYPE license_category AS ENUM ('A', 'B', 'C', 'D', 'AM', 'A1', 'A2', 'B1', 'C1', 'D1');
--   END IF;
-- END $$;

-- Main table: member_driving_licenses
CREATE TABLE IF NOT EXISTS public.member_driving_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  category VARCHAR(10) NOT NULL,                    -- A, B, C, D, AM, A1, A2, B1, C1, D1, etc.
  issue_date DATE NOT NULL,                         -- When license was issued
  expiry_date DATE,                                 -- When license expires (NULL = no expiry/unknown)
  country_code VARCHAR(2) NOT NULL,                 -- CZ, SK, DE, AT, etc. (ISO 3166-1 alpha-2)
  license_number VARCHAR(50) NOT NULL UNIQUE,       -- Unique identifier on physical license
  authority VARCHAR(255),                           -- Issuing authority (e.g., "SPŠ Banská Bystrica")
  notes TEXT,                                       -- Additional notes or restrictions
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Unique constraint: Member can have at most 1 license per category per country
-- (member_id=123, category=B, country_code=SK should be unique)
-- Note: This allows multiple entries if any column is NULL, which is acceptable
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_member_driving_licenses_category_country'
  ) THEN
    ALTER TABLE public.member_driving_licenses
      ADD CONSTRAINT uq_member_driving_licenses_category_country 
      UNIQUE(member_id, category, country_code);
  END IF;
END $$;

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_member_driving_licenses_member_id 
  ON public.member_driving_licenses(member_id);

CREATE INDEX IF NOT EXISTS idx_member_driving_licenses_expiry_date 
  ON public.member_driving_licenses(expiry_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_member_driving_licenses_created_at 
  ON public.member_driving_licenses(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_member_driving_licenses_license_number 
  ON public.member_driving_licenses(license_number);

-- Enable RLS
ALTER TABLE public.member_driving_licenses ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT - All authenticated users can view member licenses
-- (Assumption: viewing license info of other members is allowed for admins/trainers)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'member_driving_licenses' 
    AND policyname = 'select_authenticated_users'
  ) THEN
    CREATE POLICY select_authenticated_users 
      ON public.member_driving_licenses 
      FOR SELECT 
      TO authenticated 
      USING (true);
  END IF;
END $$;

-- RLS Policy: INSERT - Users with MEMBERS_EDIT role or admin roles
-- Roles: ADMIN, VEDENIE, VELITEL, TRENER (all can manage member data)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'member_driving_licenses' 
    AND policyname = 'insert_members_edit_role'
  ) THEN
    CREATE POLICY insert_members_edit_role 
      ON public.member_driving_licenses 
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

-- RLS Policy: UPDATE - Users with MEMBERS_EDIT role or admin roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'member_driving_licenses' 
    AND policyname = 'update_members_edit_role'
  ) THEN
    CREATE POLICY update_members_edit_role 
      ON public.member_driving_licenses 
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

-- RLS Policy: DELETE - Only ADMIN role can delete licenses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'member_driving_licenses' 
    AND policyname = 'delete_admin_only'
  ) THEN
    CREATE POLICY delete_admin_only 
      ON public.member_driving_licenses 
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

-- Grant permissions to authenticated users and service_role
DO $$
BEGIN
  -- Authenticated users: SELECT, INSERT, UPDATE (controlled by RLS)
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.member_driving_licenses TO authenticated';
  
  -- Service role: Full access (used by trusted backend code)
  EXECUTE 'GRANT ALL ON public.member_driving_licenses TO service_role';
  
  -- Add execute permissions on sequence for auto-increment if present
  EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role';
  
  EXCEPTION WHEN OTHERS THEN
    -- Permissions may already exist
    NULL;
END $$;

-- Optional: Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_member_driving_licenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_member_driving_licenses_updated_at 
  ON public.member_driving_licenses;

CREATE TRIGGER trigger_member_driving_licenses_updated_at
  BEFORE UPDATE ON public.member_driving_licenses
  FOR EACH ROW
  EXECUTE FUNCTION update_member_driving_licenses_updated_at();

-- Optional: Trigger to auto-set updated_by to current user
CREATE OR REPLACE FUNCTION update_member_driving_licenses_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_member_driving_licenses_updated_by 
  ON public.member_driving_licenses;

CREATE TRIGGER trigger_member_driving_licenses_updated_by
  BEFORE UPDATE ON public.member_driving_licenses
  FOR EACH ROW
  EXECUTE FUNCTION update_member_driving_licenses_updated_by();

-- Optional: Trigger to auto-set created_by to current user on INSERT
CREATE OR REPLACE FUNCTION set_member_driving_licenses_created_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_member_driving_licenses_created_by 
  ON public.member_driving_licenses;

CREATE TRIGGER trigger_member_driving_licenses_created_by
  BEFORE INSERT ON public.member_driving_licenses
  FOR EACH ROW
  EXECUTE FUNCTION set_member_driving_licenses_created_by();

-- Audit Log Entry (if audit_log table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
    INSERT INTO public.audit_log (action, table_name, details, created_at)
    VALUES ('MIGRATION', 'member_driving_licenses', 'Created member_driving_licenses table', now())
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

COMMIT;
