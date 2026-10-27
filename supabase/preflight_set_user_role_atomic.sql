-- Read-only preflight for set_user_role_atomic (NO WRITES)
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS result
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='set_user_role_atomic';

SELECT p.prosecdef, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='set_user_role_atomic';

SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema='public' AND routine_name='set_user_role_atomic';

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('roles','user_roles','audit_log');

SELECT conname, contype FROM pg_constraint
WHERE conrelid IN ('public.roles'::regclass,'public.user_roles'::regclass);