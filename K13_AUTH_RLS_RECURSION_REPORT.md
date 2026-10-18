# K13 AUTH FIX 2 — RLS Role Recursion Report

## Scope

Targeted fix for the authenticated role-loading path in [src/lib/auth/server.ts](./src/lib/auth/server.ts), specifically the HTTP 500:

```text
Unable to load user roles: infinite recursion detected in policy for relation "roles"
```

This report separates **static findings** from **runtime findings**. No runtime/RLS verification against an authorized DEV database was available in this session.

---

## 1. Exact cause

### Triggering application query

The first query in `getAuthContext()` that activates the recursion is:

```ts
supabase
  .from("user_roles")
  .select("roles!user_roles_role_id_fkey(code)")
  .eq("user_id", user.id)
```

Location: [src/lib/auth/server.ts](./src/lib/auth/server.ts) lines corresponding to the `user_roles` select.

### Relevant schema facts

From [src/types/database.types.ts](./src/types/database.types.ts):

- `user_roles.role_id -> roles.id` via `user_roles_role_id_fkey`
- `user_permissions.permission_id -> permissions.id` via `user_permissions_permission_id_fkey`
- `role_permissions.permission_id -> permissions.id` via `role_permissions_permission_id_fkey`
- RPCs exist for `has_role` and `has_permission`
- RPC `has_any_permission` does **not** exist in generated types

From [supabase/migrations/20261006_core_database.sql](./supabase/migrations/20261006_core_database.sql):

- RLS is enabled on:
  - `public.roles`
  - `public.permissions`
  - `public.role_permissions`
  - `public.user_roles`
  - `public.user_permissions`
- Existing helper functions:
  - `public.has_role(uuid, text)` — `SECURITY DEFINER`, `STABLE`, `set search_path = public`
  - `public.has_permission(uuid, text)` — `SECURITY DEFINER`, `STABLE`, `set search_path = public`
- There is **no** `public.has_any_permission(...)` function in migrations

### Recursive policy cycle

The confirmed problematic policies in [supabase/migrations/20261006_core_database.sql](./supabase/migrations/20261006_core_database.sql) are:

- `roles_manage_admin`
- `permissions_manage_admin`
- `role_permissions_manage_admin`
- `user_roles_manage_admin`
- `user_permissions_manage_admin`

They all use the same admin check pattern:

```sql
exists (
  select 1
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
)
```

Because these are `FOR ALL` policies, they also participate in `SELECT` evaluation.

### Dependency graph

#### Policy graph for the failing request

1. `getAuthContext()` selects from `public.user_roles`
2. RLS on `public.user_roles` evaluates `user_roles_manage_admin`
3. `user_roles_manage_admin` reads:
   - `public.user_roles`
   - `public.roles`
4. Reading `public.roles` evaluates `roles_manage_admin`
5. `roles_manage_admin` again reads:
   - `public.user_roles`
   - `public.roles`
6. `public.roles` policy evaluation re-enters `roles_manage_admin`
7. PostgreSQL detects infinite recursion on relation `roles`

### Minimal confirmed cycle

```text
user_roles SELECT
  -> policy user_roles_manage_admin
    -> subquery reads roles
      -> policy roles_manage_admin
        -> subquery reads roles
          -> roles_manage_admin
            -> ...
```

There is also a sibling recursive path through `permissions_manage_admin` for the direct-permissions query:

```text
user_permissions SELECT
  -> embedded permissions SELECT
    -> policy permissions_manage_admin
      -> subquery reads user_roles + roles
        -> roles_manage_admin / user_roles_manage_admin
          -> recursion
```

---

## 2. Why the fix is minimal and justified

The repository already has an approved helper for role checks:

```sql
create or replace function public.has_role(p_user_id uuid, p_role_code text)
returns boolean
language sql
stable
security definer
set search_path = public
```

This is important because:

- it is already part of the approved schema,
- it already has restricted `EXECUTE` grants (`authenticated`, `service_role`),
- it uses a fixed `search_path`,
- it matches the existing authorization architecture,
- replacing inline policy subqueries with `public.has_role((select auth.uid()), 'ADMIN')`
  removes the recursive policy graph **without** disabling RLS and **without** granting broad access.

No new table, column, role, permission key, or `service_role` bypass was introduced.

---

## 3. Applied SQL change

### New migration

Added:

- [supabase/migrations/20261023_auth_rls_recursion_fix.sql](./supabase/migrations/20261023_auth_rls_recursion_fix.sql)

### Concrete SQL diff

```sql
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
```

### Rollback

Rollback is a policy recreation back to the original inline `EXISTS (...) JOIN public.roles ...` form:

```sql
drop policy if exists roles_manage_admin on public.roles;
create policy roles_manage_admin
on public.roles for all to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
))
with check (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
));

drop policy if exists permissions_manage_admin on public.permissions;
create policy permissions_manage_admin
on public.permissions for all to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
))
with check (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
));

drop policy if exists role_permissions_manage_admin on public.role_permissions;
create policy role_permissions_manage_admin
on public.role_permissions for all to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
))
with check (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
));

drop policy if exists user_roles_manage_admin on public.user_roles;
create policy user_roles_manage_admin
on public.user_roles for all to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
))
with check (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
));

drop policy if exists user_permissions_manage_admin on public.user_permissions;
create policy user_permissions_manage_admin
on public.user_permissions for all to authenticated
using (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
))
with check (exists (
  select 1 from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and r.code = 'ADMIN'
));
```

---

## 4. Affected files and policies

### Changed file

- [supabase/migrations/20261023_auth_rls_recursion_fix.sql](./supabase/migrations/20261023_auth_rls_recursion_fix.sql)

### Inspected application file

- [src/lib/auth/server.ts](./src/lib/auth/server.ts)

### Inspected schema/type files

- [supabase/migrations/20261006_core_database.sql](./supabase/migrations/20261006_core_database.sql)
- [src/types/database.types.ts](./src/types/database.types.ts)

### Policies changed by the migration

- `roles_manage_admin`
- `permissions_manage_admin`
- `role_permissions_manage_admin`
- `user_roles_manage_admin`
- `user_permissions_manage_admin`

### Helper functions inspected

- `public.has_role(uuid, text)` — exists, security definer, fixed search path, granted to `authenticated`
- `public.has_permission(uuid, text)` — exists, security definer, fixed search path, granted to `authenticated`
- `public.has_any_permission(...)` — not present in migrations or generated DB types

---

## 5. Validation results

## 5.1 Static validation

| Check | Result | Notes |
|---|---|---|
| Policy cause analysis | PASS | Confirmed recursion comes from inline admin subqueries inside auth-table RLS policies |
| FK / column verification | PASS | `user_roles_role_id_fkey`, `user_permissions_permission_id_fkey`, `role_permissions_permission_id_fkey` match migrations and generated types |
| Existing helper architecture | PASS | Reused existing `public.has_role(uuid, text)` |
| Node auth unit tests | PASS | `node --test src/lib/auth/server.test.ts` -> 4/4 passing |
| ESLint on auth files | PASS | `npx eslint src/lib/auth/server.ts src/lib/auth/permissions.ts src/lib/auth/roles.ts` |

## 5.2 Static validation with known repository failures

| Check | Result | Notes |
|---|---|---|
| Project TypeScript | FAIL (pre-existing + auth RPC typing) | `npx tsc --noEmit` still reports `src/lib/auth/server.ts` RPC typing errors plus many unrelated repository errors |
| Next build | FAIL (type-check stage) | `next build` compiled, then failed during TypeScript with many repository errors, including the same auth RPC typing mismatch |

Relevant auth TS errors still present after this task:

```text
src/lib/auth/server.ts(128,5): error TS2345: Argument of type '{ p_user_id: string; p_permission_code: Permission; }' is not assignable to parameter of type 'undefined'.
src/lib/auth/server.ts(138,5): error TS2345: Argument of type '{ p_user_id: string; p_role_code: AppRole; }' is not assignable to parameter of type 'undefined'.
```

These are outside the RLS recursion fix requested here. No application TypeScript was changed in this task.

## 5.3 Runtime / database validation

| Check | Result | Notes |
|---|---|---|
| 1. Authenticated user with valid role loads auth context without recursion | BLOCKED | No authorized DEV DB available |
| 2. User without assigned role gets no role automatically | BLOCKED | No authorized DEV DB available |
| 3. User cannot read/change other users' roles without permission | BLOCKED | No authorized DEV DB available |
| 4. Regular member cannot access finance | BLOCKED | No authorized DEV DB available |
| 5. Unauthenticated user cannot access protected data | BLOCKED | No authorized DEV DB available |
| 6. DB error does not grant access | PASS (static) / BLOCKED (runtime) | Static code remains fail-closed in `getAuthContext()`; runtime DB execution not available |
| 7. `has_role` and `has_permission` remain functional | PASS (static) / BLOCKED (runtime) | Functions still exist with same signatures and grants; no live DB execution available |

---

## 6. Remaining risks

1. **Runtime not executed against a real database**  
   The migration is statically sound, but the actual removal of recursion is **not runtime-confirmed** in this session.

2. **Broader anti-pattern still exists outside this auth fix scope**  
   The same inline `EXISTS (...) JOIN public.user_roles/public.roles` admin-check pattern appears in other policies in [supabase/migrations/20261006_core_database.sql](./supabase/migrations/20261006_core_database.sql) (for example profiles/members/guardians/audit log).  
   Those were intentionally **not changed here** because the requested scope was the auth role-loading recursion. They remain candidates for the same class of RLS recursion elsewhere.

3. **Repository-wide TypeScript state is already broken**  
   Build/typecheck cannot currently prove end-to-end health because the repository contains many pre-existing type errors, including two in [src/lib/auth/server.ts](./src/lib/auth/server.ts) unrelated to this RLS migration.

---

## 7. Final assessment

- **Confirmed cause:** recursive admin-check subqueries inside auth-related RLS policies
- **Minimal fix applied:** replace those inline admin subqueries with the existing `public.has_role((select auth.uid()), 'ADMIN')`
- **RLS preserved:** yes
- **`service_role` bypass introduced:** no
- **Broad `USING (true)` manage policy introduced:** no
- **Runtime confirmation on DEV DB:** **BLOCKED**

