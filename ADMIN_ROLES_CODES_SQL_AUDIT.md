# ADMIN_ROLES_CODES_SQL_AUDIT.md

## Summary
Audit of admin, roles, permissions, and registration/invite codes.

### Findings
- Admin page requires PERMISSIONS.ADMIN_USERS. Overview loaded via loadAdminOverview (admin.service). If fails, error card shown.
- No registration/invite/activation codes exist in codebase (search returned 0 results). Codes feature: NOT IMPLEMENTED.
- Roles canonical: ADMIN, VEDENIE, VELITEL, POKLADNIK, TRENER, CLEN, RODIC (src/lib/auth/roles.ts).
- Auth server provides getAuthContext, requirePermission, requireRole, hasPermissionServer.
- DB runtime/RLS verification: BLOCKED (no DB access).
- React key warning: fixed in AdminClientView (key fallback chain).

### Status
- Admin overview load: PASS (static)
- Role change server-side enforcement: not fully audited (BLOCKED runtime)
- Codes: NOT IMPLEMENTED
- SQL/RLS: BLOCKED