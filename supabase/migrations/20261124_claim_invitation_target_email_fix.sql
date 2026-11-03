-- ============================================================================
-- Migration: K17.1.8 – Oprava uplatňovania pozývacích kódov s target_email
-- Date: 20261124
--
-- BEZPEČNÁ OPRÁVA RPC public.claim_invitation_code:
--  - Ak pozvánka má vyplnený target_email, môže ju uplatniť iba prihlásený
--    používateľ, ktorého e-mail v auth.users sa zhoduje (case-insensitive,
--    bez okrajových medzier) s target_email.
--  - E-mail sa načíta autoritatívne z auth.users podľa auth.uid(), NIKDY
--    zo spaľavateľského parametra p_email.
--  - Vyžaduje sa potvrdený e-mail (email_confirmed_at IS NOT NULL).
--  - Všetky existujúce ochrany sú zachované: SHA-256 hash kódu, expirácia,
--    stav pozvánky, use_count < max_uses, atomické uplatnenie (UPDATE ... RETURNING
--    zamkne riadok), priradenie roly iba z databázovej pozvánky, väzba na
--    auth.uid(), auditné udalosti, SECURITY DEFINER, search_path, GRANT/REVOKE.
--  - Pôvodná signatúra RPC sa zachová: (p_code text, p_user_id uuid, p_email text) RETURNS jsonb.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_invitation_code(
    p_code    text,
    p_user_id uuid,
    p_email   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_normalized text;
    v_hash       text;
    v_invitation uuid;
    v_role       text;
    v_role_id    uuid;
    v_uid        uuid := auth.uid();
    v_auth_email text;
    v_email_confirmed boolean;
BEGIN
    -- 1) p_user_id nesmie byť NULL.
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
    END IF;

    -- 2) Autorizácia: používateľ MUSÍ byť prihlásený a p_user_id musí byť jeho vlastný id.
    --    service_role fallback je zachovaný (bez auth.uid() nie je možné overiť
    --    target_email ani email_confirmed_at, takže tieto kontroly sa pre
    --    service_role preskakujú – zachovanie existujúceho bezpečného správania).
    IF v_uid IS NOT NULL THEN
        IF p_user_id <> v_uid THEN
            RAISE EXCEPTION 'Forbidden: user id mismatch' USING ERRCODE = '42501';
        END IF;

        -- 3) Autoritatívny e-mail z auth.users (nie z klientského parametra p_email).
        SELECT email, email_confirmed_at IS NOT NULL
        INTO v_auth_email, v_email_confirmed
        FROM auth.users
        WHERE id = v_uid;

        IF v_auth_email IS NULL OR NOT v_email_confirmed THEN
            RETURN jsonb_build_object('success', false, 'error', 'email_not_confirmed');
        END IF;
    ELSIF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    -- 4) Normalizácia kódu (identická s TS a pôvodnou logikou).
    v_normalized := upper(regexp_replace(btrim(coalesce(p_code, '')), '[^A-Za-z0-9-]', '', 'g'));
    v_hash := encode(digest(v_normalized::bytea, 'sha256'::text), 'hex');

    -- 5) Atomická rezervácia s kontrolou target_email priamo v WHERE.
    --    UPDATE zamkne riadok, takže súbežné požiadavky nemôžu prekročiť max_uses.
    --    target_email sa porovnáva s autoritatívnym e-mailom z auth.users.
    --    Pre service_role (v_uid IS NULL) sa kontrola target_email preskakuje
    --    (zachovanie existujúceho správania).
    UPDATE public.invitations i
       SET use_count = i.use_count + 1
     WHERE i.code_hash = v_hash
       AND i.status = 'active'
       AND i.use_count < i.max_uses
       AND i.expires_at > now()
       AND (
           i.target_email IS NULL
           OR v_uid IS NULL
           OR (
               v_uid IS NOT NULL
               AND lower(btrim(coalesce(i.target_email, ''))) =
                   lower(btrim(coalesce(v_auth_email, '')))
           )
       )
   RETURNING i.id, i.role INTO v_invitation, v_role;

    IF v_invitation IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.invitations i WHERE i.code_hash = v_hash
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'code_unusable');
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
    END IF;

    -- 6) Rola pochádza IBA z pozvánky.
    SELECT r.id INTO v_role_id
    FROM public.roles r
    WHERE r.code = v_role;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Role does not exist' USING ERRCODE = '23503';
    END IF;

    -- 7) Idempotentné priradenie roly (INSERT – user_roles nemá id stĺpec).
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (p_user_id, v_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;

    -- 8) Evidencia uplatnenia (e-mail z auth.users, nie parameter p_email).
    INSERT INTO public.invitation_claims (invitation_id, user_id, email)
    VALUES (v_invitation, p_user_id, lower(btrim(coalesce(v_auth_email, ''))));

    -- 9) Audit (bez kódu a bez hashu).
    INSERT INTO public.audit_log (
        user_id, action, module, entity_type, entity_id, new_data
    ) VALUES (
        p_user_id, 'invitation.consumed', 'auth', 'invitation', v_invitation,
        jsonb_build_object('role', v_role)
    );

    INSERT INTO public.audit_log (
        user_id, action, module, entity_type, entity_id, new_data
    ) VALUES (
        p_user_id, 'invitation.role_assigned', 'auth', 'invitation', v_invitation,
        jsonb_build_object('role', v_role)
    );

    RETURN jsonb_build_object(
        'success', true,
        'invitation_id', v_invitation,
        'role', v_role
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invitation_code(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_invitation_code(text, uuid, text) TO authenticated, service_role;

-- ============================================================================
-- KONIEC migrácie 20261124_claim_invitation_target_email_fix.sql
-- ============================================================================