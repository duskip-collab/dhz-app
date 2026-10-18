-- ============================================================================
-- Migration: K13 AUTH FIX 2 — auth RLS recursion fix
-- Date: 20261023
-- Purpose:
--   Remove confirmed RLS recursion in auth metadata tables used by
--   src/lib/auth/server.ts#getAuthContext().
--
-- Root cause:
--   The manage policies on public.roles, public.permissions,
--   public.role_permissions, public.user_roles and public.user_permissions
--   perform admin checks with a subquery that joins public.user_roles to
--   public.roles. Because those same tables are protected by RLS and the
--   policies are FOR ALL, evaluating the policy graph during SELECT can recurse:
--
--     roles/user_roles/permissions/... policy
--       -> subquery reads public.user_roles + public.roles
--       -> public.roles policy evaluation
--       -> roles_manage_admin subquery reads public.roles again
--       -> infinite recursion
--
-- Fix:
--   Reuse the existing SECURITY DEFINER helper public.has_role(uuid, text),
--   which is already granted to authenticated and has a fixed search_path.
--   This preserves RLS on the tables while removing the recursive policy graph.
-- ============================================================================

drop policy if exists roles_manage_admin on public.roles;
create policy roles_manage_admin
on public.roles for all to authenticated
using (public.has_role((select auth.uid()), 'ADMIN'))
with check (public.has_role((select auth.uid()), 'ADMIN'));

drop policy if exists permissions_manage_admin on public.permissions;
create policy permissions_manage_admin
on public.permissions for all to authenticated
using (public.has_role((select auth.uid()), 'ADMIN'))
with check (public.has_role((select auth.uid()), 'ADMIN'));

drop policy if exists role_permissions_manage_admin on public.role_permissions;
create policy role_permissions_manage_admin
on public.role_permissions for all to authenticated
using (public.has_role((select auth.uid()), 'ADMIN'))
with check (public.has_role((select auth.uid()), 'ADMIN'));

drop policy if exists user_roles_manage_admin on public.user_roles;
create policy user_roles_manage_admin
on public.user_roles for all to authenticated
using (public.has_role((select auth.uid()), 'ADMIN'))
with check (public.has_role((select auth.uid()), 'ADMIN'));

drop policy if exists user_permissions_manage_admin on public.user_permissions;
create policy user_permissions_manage_admin
on public.user_permissions for all to authenticated
using (public.has_role((select auth.uid()), 'ADMIN'))
with check (public.has_role((select auth.uid()), 'ADMIN'));
