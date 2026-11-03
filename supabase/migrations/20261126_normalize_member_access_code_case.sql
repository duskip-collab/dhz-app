-- Keep generated access-code hashes and login lookups case-insensitive.
-- The raw code remains stored only as a SHA-256 hash.

CREATE OR REPLACE FUNCTION public.resolve_access_code(p_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT u.email
    FROM public.member_access_codes mac
    JOIN auth.users u ON u.id = mac.user_id
    WHERE mac.code_hash = encode(
        digest(upper(btrim(coalesce(p_code, '')))::bytea, 'sha256'::text),
        'hex'
    )
      AND u.email IS NOT NULL
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_access_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_access_code(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_member_access_code(p_user_id uuid, p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid   uuid := (SELECT auth.uid());
    v_code  text := upper(btrim(coalesce(p_code, '')));
    v_email text;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT (public.has_role(v_uid, 'ADMIN') OR public.has_role(v_uid, 'VELITEL')) THEN
        RAISE EXCEPTION 'Forbidden: ADMIN or VELITEL role required';
    END IF;
    IF length(v_code) < 6 THEN
        RAISE EXCEPTION 'Access code must be at least 6 characters';
    END IF;

    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user_id;
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'User not found or has no email';
    END IF;

    UPDATE auth.users
       SET encrypted_password = crypt(v_code, gen_salt('bf', 10)),
           updated_at = now()
     WHERE id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    INSERT INTO public.member_access_codes (user_id, code_hash, created_by)
    VALUES (p_user_id, encode(digest(v_code::bytea, 'sha256'::text), 'hex'), v_uid)
    ON CONFLICT (user_id) DO UPDATE
        SET code_hash  = EXCLUDED.code_hash,
            created_by = EXCLUDED.created_by,
            updated_at = now();

    RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.set_member_access_code(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_member_access_code(uuid, text) TO authenticated;
