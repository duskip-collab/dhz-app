-- Proposed migration (NOT applied): atomic role replacement RPC
CREATE OR REPLACE FUNCTION public.set_user_role_atomic(
  p_user_id uuid,
  p_role_code text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_id uuid;
  v_admin_role_id uuid;
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_admin_count int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_caller AND r.code = 'ADMIN'
  ) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Explicit guard: ADMIN cannot be assigned via this RPC (no bootstrap/delegation).
  IF p_role_code = 'ADMIN' THEN
    INSERT INTO public.audit_log (user_id, module, action, object_id, data)
    VALUES (v_caller, 'users', 'role.assign.denied', p_user_id, jsonb_build_object('reason', 'admin_escalation_blocked', 'role_code', p_role_code));
    RAISE EXCEPTION 'admin assignment not allowed' USING ERRCODE = '42501';
  END IF;


  SELECT id INTO v_role_id FROM public.roles WHERE code = p_role_code;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'role not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('admin_count'));

  SELECT id INTO v_admin_role_id FROM public.roles WHERE code = 'ADMIN';

  IF EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role_id = v_admin_role_id
  ) AND p_role_code <> 'ADMIN' THEN
    SELECT count(*) INTO v_admin_count FROM public.user_roles WHERE role_id = v_admin_role_id;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'last admin' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  INSERT INTO public.user_roles (user_id, role_id) VALUES (p_user_id, v_role_id);

  INSERT INTO public.audit_log (user_id, module, action, object_id, data)
  VALUES (v_caller, 'users', 'role.assign', p_user_id, jsonb_build_object('role_code', p_role_code));
END $$;

REVOKE ALL ON FUNCTION public.set_user_role_atomic(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role_atomic(uuid, text) TO authenticated;