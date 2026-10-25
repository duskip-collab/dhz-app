# Admin Client View Key Warning Report

## Root cause
`membersWithRoles.map` used `key={m.id}`. If `id` is missing/undefined for some members, React warns. Changed to stable fallback chain `m.id ?? m.auth_user_id ?? m.member_number`.

## Files changed
- src/app/(app)/admin/AdminClientView.tsx

## Checks
- tsc/build pending.