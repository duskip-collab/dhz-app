-- K15.2 Schema Verification Query
-- Purpose: Check if 20261028_fix_members_and_guardians.sql has been applied
-- Date: 2026-10-18

-- ============================================================================
-- 1. CHECK: members table columns (added by 20261028)
-- ============================================================================

-- Expected columns from 20261028:
-- - auth_user_id UUID
-- - member_number TEXT
-- - title TEXT
-- - birth_date DATE
-- - membership_type TEXT
-- - left_at DATE
-- - notes TEXT
-- - photo_path TEXT
-- - created_by UUID
-- - updated_by UUID

SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'members'
  AND column_name IN (
    'auth_user_id', 'member_number', 'title', 'birth_date',
    'membership_type', 'left_at', 'notes', 'photo_path',
    'created_by', 'updated_by'
  )
ORDER BY column_name;

-- ============================================================================
-- 2. CHECK: member_status enum values (should have 'archived')
-- ============================================================================

SELECT enumlabel 
FROM pg_enum
WHERE enumtypid = 'public.member_status'::regtype
ORDER BY enumlabel;

-- ============================================================================
-- 3. CHECK: member_guardians table exists and has correct columns
-- ============================================================================

SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'member_guardians'
ORDER BY column_name;

-- ============================================================================
-- 4. CHECK: Sample data (to verify column population)
-- ============================================================================

SELECT 
  COUNT(*) as total_members,
  COUNT(auth_user_id) as members_with_auth_id,
  COUNT(member_number) as members_with_number,
  COUNT(birth_date) as members_with_birth_date,
  COUNT(photo_path) as members_with_photo
FROM public.members;

-- ============================================================================
-- 5. CHECK: member_guardians data
-- ============================================================================

SELECT 
  COUNT(*) as total_guardians,
  COUNT(DISTINCT member_id) as members_with_guardians
FROM public.member_guardians;

-- ============================================================================
-- 6. FINAL VERDICT
-- ============================================================================

-- If above queries return data with expected columns → 20261028 IS APPLIED ✅
-- If queries fail or columns missing → 20261028 NOT APPLIED ❌
