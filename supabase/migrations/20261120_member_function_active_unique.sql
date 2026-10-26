-- Migration: unique active member function assignment
create unique index if not exists ux_mfa_active_member_function
  on public.member_function_assignments (member_id, function_code)
  where valid_to is null;
