-- K15.2 Phase 5: Expiry Notifications Table
-- Date: 2026-10-18
-- Purpose: Track expiring courses, driving licenses, and documents
-- Notifications created by background job or on-demand

CREATE TABLE IF NOT EXISTS public.expiry_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,      -- course_expiring, license_expiring, document_expiring
  reference_id UUID,                           -- ID of course/license/document
  item_name VARCHAR(255) NOT NULL,             -- Display name (e.g., "Category B License")
  expiry_date DATE NOT NULL,                   -- When item expires
  days_until_expiry INTEGER,                   -- Calculated at creation time
  notification_sent_at TIMESTAMP WITH TIME ZONE,  -- When notification was sent (email/dashboard)
  viewed_at TIMESTAMP WITH TIME ZONE,         -- When user viewed the notification
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_expiry_notifications_user_id 
  ON public.expiry_notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_expiry_notifications_member_id 
  ON public.expiry_notifications(member_id);

CREATE INDEX IF NOT EXISTS idx_expiry_notifications_notification_sent_at 
  ON public.expiry_notifications(notification_sent_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_expiry_notifications_viewed_at 
  ON public.expiry_notifications(viewed_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_expiry_notifications_expiry_date 
  ON public.expiry_notifications(expiry_date ASC);

-- Enable RLS
ALTER TABLE public.expiry_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT - Users can only view their own notifications
-- Admins can view all notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'expiry_notifications' 
    AND policyname = 'select_own_or_admin'
  ) THEN
    CREATE POLICY select_own_or_admin 
      ON public.expiry_notifications 
      FOR SELECT 
      TO authenticated 
      USING (
        user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          INNER JOIN public.roles r ON ur.role_id = r.id
          WHERE ur.user_id = auth.uid()
          AND r.code = 'ADMIN'
        )
      );
  END IF;
END $$;

-- RLS Policy: INSERT - System/admin only (background job or API endpoint)
-- Service role (backend) can insert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'expiry_notifications' 
    AND policyname = 'insert_admin_only'
  ) THEN
    CREATE POLICY insert_admin_only 
      ON public.expiry_notifications 
      FOR INSERT 
      TO authenticated 
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          INNER JOIN public.roles r ON ur.role_id = r.id
          WHERE ur.user_id = auth.uid()
          AND r.code = 'ADMIN'
        )
      );
  END IF;
END $$;

-- RLS Policy: UPDATE - Users can update viewed_at, admins can update all fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'expiry_notifications' 
    AND policyname = 'update_user_viewed_or_admin'
  ) THEN
    CREATE POLICY update_user_viewed_or_admin 
      ON public.expiry_notifications 
      FOR UPDATE 
      TO authenticated 
      USING (
        user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          INNER JOIN public.roles r ON ur.role_id = r.id
          WHERE ur.user_id = auth.uid()
          AND r.code = 'ADMIN'
        )
      )
      WITH CHECK (
        user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          INNER JOIN public.roles r ON ur.role_id = r.id
          WHERE ur.user_id = auth.uid()
          AND r.code = 'ADMIN'
        )
      );
  END IF;
END $$;

-- RLS Policy: DELETE - Admins only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'expiry_notifications' 
    AND policyname = 'delete_admin_only'
  ) THEN
    CREATE POLICY delete_admin_only 
      ON public.expiry_notifications 
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
  EXECUTE 'GRANT SELECT, UPDATE ON public.expiry_notifications TO authenticated';
  EXECUTE 'GRANT ALL ON public.expiry_notifications TO service_role';
  EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Helper function: Create notifications for expiring courses
CREATE OR REPLACE FUNCTION create_expiring_course_notifications()
RETURNS void AS $$
DECLARE
  course RECORD;
  cutoff_date DATE;
BEGIN
  cutoff_date := CURRENT_DATE + INTERVAL '30 days';
  
  -- Find all courses expiring within 30 days without notification sent yet
  FOR course IN
    SELECT mc.id, mc.member_id, mc.course_name, mc.expiry_date,
           m.email, u.id as user_id
    FROM public.member_courses mc
    INNER JOIN public.members m ON mc.member_id = m.id
    INNER JOIN auth.users u ON m.auth_user_id = u.id
    WHERE mc.expiry_date IS NOT NULL
    AND mc.expiry_date > CURRENT_DATE
    AND mc.expiry_date <= cutoff_date
    AND NOT EXISTS (
      SELECT 1 FROM public.expiry_notifications en
      WHERE en.reference_id = mc.id
      AND en.notification_type = 'course_expiring'
    )
  LOOP
    INSERT INTO public.expiry_notifications (
      user_id, member_id, notification_type, reference_id,
      item_name, expiry_date, days_until_expiry
    ) VALUES (
      course.user_id, course.member_id, 'course_expiring', course.id,
      'Kurz: ' || course.course_name,
      course.expiry_date,
      (course.expiry_date - CURRENT_DATE)::INTEGER
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Helper function: Create notifications for expiring driving licenses
CREATE OR REPLACE FUNCTION create_expiring_license_notifications()
RETURNS void AS $$
DECLARE
  license RECORD;
  cutoff_date DATE;
BEGIN
  cutoff_date := CURRENT_DATE + INTERVAL '30 days';
  
  FOR license IN
    SELECT mdl.id, mdl.member_id, mdl.category, mdl.country_code, mdl.expiry_date,
           m.email, u.id as user_id
    FROM public.member_driving_licenses mdl
    INNER JOIN public.members m ON mdl.member_id = m.id
    INNER JOIN auth.users u ON m.auth_user_id = u.id
    WHERE mdl.expiry_date IS NOT NULL
    AND mdl.expiry_date > CURRENT_DATE
    AND mdl.expiry_date <= cutoff_date
    AND NOT EXISTS (
      SELECT 1 FROM public.expiry_notifications en
      WHERE en.reference_id = mdl.id
      AND en.notification_type = 'license_expiring'
    )
  LOOP
    INSERT INTO public.expiry_notifications (
      user_id, member_id, notification_type, reference_id,
      item_name, expiry_date, days_until_expiry
    ) VALUES (
      license.user_id, license.member_id, 'license_expiring', license.id,
      'Vodičský preukaz kategória ' || license.category || ' (' || license.country_code || ')',
      license.expiry_date,
      (license.expiry_date - CURRENT_DATE)::INTEGER
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Helper function: Create notifications for expiring documents
CREATE OR REPLACE FUNCTION create_expiring_document_notifications()
RETURNS void AS $$
DECLARE
  document RECORD;
  cutoff_date DATE;
BEGIN
  cutoff_date := CURRENT_DATE + INTERVAL '30 days';
  
  FOR document IN
    SELECT md.id, md.member_id, md.document_type, md.file_name, md.expiry_date,
           m.email, u.id as user_id
    FROM public.member_documents md
    INNER JOIN public.members m ON md.member_id = m.id
    INNER JOIN auth.users u ON m.auth_user_id = u.id
    WHERE md.expiry_date IS NOT NULL
    AND md.expiry_date > CURRENT_DATE
    AND md.expiry_date <= cutoff_date
    AND NOT EXISTS (
      SELECT 1 FROM public.expiry_notifications en
      WHERE en.reference_id = md.id
      AND en.notification_type = 'document_expiring'
    )
  LOOP
    INSERT INTO public.expiry_notifications (
      user_id, member_id, notification_type, reference_id,
      item_name, expiry_date, days_until_expiry
    ) VALUES (
      document.user_id, document.member_id, 'document_expiring', document.id,
      'Dokument: ' || document.document_type || ' (' || document.file_name || ')',
      document.expiry_date,
      (document.expiry_date - CURRENT_DATE)::INTEGER
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Audit log
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
    INSERT INTO public.audit_log (action, table_name, details, created_at)
    VALUES ('MIGRATION', 'expiry_notifications', 'Created expiry_notifications table and helper functions', now())
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

COMMIT;
