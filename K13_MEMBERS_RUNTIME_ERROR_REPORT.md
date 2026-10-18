# K13 Members Runtime Error Diagnosis

## Status

- **Static inspection:** PASS
- **Local unit tests:** PASS
- **ESLint:** PASS with two existing unused-import warnings in the dashboard
- **TypeScript:** FAIL on existing schema/type drift and auth RPC signatures
- **Authorized database runtime:** BLOCKED (local Supabase requires Docker Desktop, which is unavailable)

The exact live PostgREST error cannot be confirmed from the supplied log because it prints the error object as `{}`. Explicit safe diagnostics have been added for the next authenticated request.

## 1. Diagnosis

### Query and authorization path

`DashboardPage` first checks `dashboard.view` through `requirePermission()`. When the user also has `incidents.view`, it loads incident stats, incidents, equipment and members.

`listMembers()` then:

1. calls `requireAuthenticated()` / `getAuthContext()`;
2. requires `members.view`, checking the auth context and then `has_permission` as a fallback;
3. runs a `public.members` `SELECT *`, optionally filtering `status`, `membership_type`, and search.

The server-side `members.view` authorization check is preserved. No `service_role` or RLS bypass is used.

### Confirmed repository schema disagreement

The checked-in core migration, [20261006_core_database.sql](./supabase/migrations/20261006_core_database.sql), defines:

- `public.members` with `profile_id`, `first_name`, `last_name`, `date_of_birth`, `member_type`, and other legacy columns;
- `public.member_status` enum values `active` and `inactive` (lowercase);
- `members_select_authenticated` as `FOR SELECT TO authenticated USING (true)`.

In contrast, [database.types.ts](./src/types/database.types.ts) and `members.service.ts` expect:

- `auth_user_id`, `member_number`, `title`, `birth_date`, `membership_type`, `left_at`, `photo_path`, `created_by`, and `updated_by`;
- `member_status` values `ACTIVE` and `INACTIVE` (uppercase).

No checked-in migration alters the core members table or replaces the lowercase status enum. Therefore, **if the deployed DB follows the checked-in migrations**, the dashboard query `.eq("status", "ACTIVE")` conflicts with the database enum and can fail with PostgreSQL invalid-enum-input error `22P02`. The returned `SELECT *` row shape would also not match the service's `Member` type.

However, generated types indicate a different schema version, and there is no authorized live DB in this session to establish which version is deployed. Therefore `22P02` is a strongly evidenced candidate, not a runtime-confirmed exact cause. Changing the filter or mapping the whole model without resolving which schema is deployed could make the other schema fail.

### RLS and recursion review

- The core migration's SELECT policy for `members` is `members_select_authenticated ... USING (true)`. That permits any authenticated database role with table `SELECT` grant to read member rows directly through Supabase, regardless of `members.view`.
- The app's `listMembers()` server-side check still requires `members.view`; it is not bypassed by this patch.
- No members-specific SELECT policy in the checked-in migrations calls `roles` or `user_roles`, so that SELECT policy does not itself produce the reported `roles` recursion.
- [20261023_auth_rls_recursion_fix.sql](./supabase/migrations/20261023_auth_rls_recursion_fix.sql) changes auth-table manage policies to use the existing `has_role` helper. Static inspection shows no new members-policy recursion from that migration.
- The broad authenticated SELECT policy is a separate least-privilege concern and was not changed because this task is diagnosing the runtime query failure, and the deployed schema/policy state cannot be verified here.

## 2. Changes made

### Safe Supabase error diagnostics

In [members.service.ts](./src/lib/members/members.service.ts), the `listMembers()` error log now explicitly records only:

- `message`
- `code`
- `details`
- `hint`
- HTTP `status` and `statusText`

It does **not** log query data, member records, user tokens, cookies, or credentials. The service still throws a generic 500 `AuthError`, preserving its existing outward behavior.

```diff
-  const { data, error } = await query;
+  const { data, error, status, statusText } = await query;
   if (error) {
-    console.error("[listMembers] Supabase error:", error);
+    console.error("[listMembers] Supabase error", {
+      message: error.message,
+      code: error.code,
+      details: error.details,
+      hint: error.hint,
+      status,
+      statusText,
+    });
     throw createAuthError(500, "Chyba pri načítavaní členov.");
   }
```

### Dashboard behavior

The dashboard previously put `listMembers()` in the same `Promise.all()` as incidents and equipment. One member-query failure rejected the whole batch, discarding otherwise successful dashboard data. It also invoked the members service for incident viewers without first checking the `members.view` permission.

The dashboard now:

- checks `members.view` before requesting member rows;
- fetches members separately from core incident/equipment data;
- logs a generic warning if this optional member list fails, while retaining successful incident/equipment results.

The server-side `listMembers()` authorization remains the defense-in-depth check.

```diff
 const canViewIncidents = hasPermission(ctx.permissions, PERMISSIONS.INCIDENTS_VIEW);
+const canViewMembers = hasPermission(ctx.permissions, PERMISSIONS.MEMBERS_VIEW);
 ...
-const [s, i, m, e] = await Promise.all([
+const [s, i, e] = await Promise.all([
   getIncidentStats(),
   getIncidents(),
-  listMembers({ status: "ACTIVE" }),
   getEquipmentItems({}),
 ]);
 ...
-members = m;
 ...
+if (canViewMembers) {
+  try {
+    members = await listMembers({ status: "ACTIVE" });
+  } catch (error) {
+    console.warn(
+      "[DashboardPage] Could not load the optional member list.",
+      error instanceof Error ? error.message : "Unknown error",
+    );
+  }
+}
```

No schema, migration, RLS policy, or permission key was changed.

## 3. Test results

### PASS

- `npx eslint src/lib/members/members.service.ts "src/app/(app)/dashboard/page.tsx"` — no lint errors; two warnings remain in the dashboard for unused imports `Plus` and `IncidentType`, unrelated to this change.
- `node --test src/lib/auth/server.test.ts` — 4 tests passed, 0 failed.

### FAIL

- `npx tsc --noEmit` — errors exist in `members.service.ts` where its member CRUD model does not match `Database` generated types (for example `member_number`/`membership_type` against `never`), and in `server.ts` for existing `has_permission` / `has_role` RPC typing. This change does not add a new diagnostic error in `listMembers()` or `DashboardPage`.

### BLOCKED

- Local DB check: `supabase status` reports it cannot inspect the Supabase container because the Docker Desktop Linux engine is unavailable.
- No authorized DEV database/session is available to execute `listMembers()` or inspect deployed `information_schema`, enum labels, grants, and RLS policies.
- Consequently, the supplied `{}` error cannot be matched to an actual `code`/`message` yet.

## 4. Concrete next runtime diagnostic

After deploying the application change, reproduce the issue with an authenticated account that has `members.view` and inspect the server log line:

```text
[listMembers] Supabase error {
  message: ...,
  code: ...,
  details: ...,
  hint: ...,
  status: ...,
  statusText: ...
}
```

If `code` is `22P02` and the message names enum value `ACTIVE`, the deployed DB uses the lowercase enum from the checked-in core migration. Before changing the filter, reconcile the deployed table/enum schema with the generated types and full members service, rather than changing only one query predicate.

If the code is `42501`, `42P01`, or `42703`, the returned `message`/`details` will instead identify a permissions/grants, missing relation, or missing-column issue.

## 5. Remaining risks

1. **Schema drift is confirmed in source files.** The core migration and generated DB types/service describe different `members` schemas. Full CRUD safety/type correctness cannot be established until the intended deployed schema is confirmed.
2. **Runtime root cause remains BLOCKED.** The uppercase enum mismatch is proven against the checked-in migration, but not against the live DB.
3. **SELECT RLS is broader than the app permission check.** The checked-in `members_select_authenticated` policy uses `USING (true)` for authenticated users. App server methods enforce `members.view`, but direct authenticated Supabase access may not. This policy was not modified in this task; review it separately against approved policy requirements.
4. Dashboard core incident/equipment fetches retain the prior all-or-empty behavior if one of those core requests fails. Only the optional members request was isolated because the supplied failure specifically originates there.

