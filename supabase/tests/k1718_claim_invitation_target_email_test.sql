-- ============================================================================
-- K17.1.8 — claim_invitation_code tests for target_email / identity checks
-- Date: 20261124
-- STATUS: BLOCKED WITHOUT LIVE SUPABASE DB
-- PURPOSE: manual/live verification only; do not claim PASS without real DB proof.
--
-- This file is intentionally safe to run in a transaction. It sets up isolated
-- fixtures, but every security scenario remains in a BLOCKED state unless it is
-- explicitly executed against a live Supabase/Postgres database and validated.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Setup fixtures for manual live validation
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    u uuid;
BEGIN
    FOREACH u IN ARRAY ARRAY[
        '11111111-1111-1111-1111-111111111111'::uuid,
        '22222222-2222-2222-2222-222222222222'::uuid,
        '33333333-3333-3333-3333-333333333333'::uuid,
        '44444444-4444-4444-4444-444444444444'::uuid,
        '55555555-5555-5555-5555-555555555555'::uuid
    ] LOOP
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, created_at, updated_at,
            raw_app_meta_data, raw_user_meta_data
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
            'k1718_' || replace(u::text, '-', '') || '@test.local', '',
            NOW(), NOW(), NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{}'::jsonb
        )
        ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            email_confirmed_at = EXCLUDED.email_confirmed_at,
            updated_at = NOW();
    END LOOP;

    DELETE FROM public.invitation_claims WHERE invitation_id IN (
        'aaaaaaaa-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000003',
        'aaaaaaaa-0000-0000-0000-000000000004',
        'aaaaaaaa-0000-0000-0000-000000000005',
        'aaaaaaaa-0000-0000-0000-000000000006',
        'aaaaaaaa-0000-0000-0000-000000000007',
        'aaaaaaaa-0000-0000-0000-000000000008',
        'aaaaaaaa-0000-0000-0000-000000000009'
    );

    DELETE FROM public.invitations WHERE id IN (
        'aaaaaaaa-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000003',
        'aaaaaaaa-0000-0000-0000-000000000004',
        'aaaaaaaa-0000-0000-0000-000000000005',
        'aaaaaaaa-0000-0000-0000-000000000006',
        'aaaaaaaa-0000-0000-0000-000000000007',
        'aaaaaaaa-0000-0000-0000-000000000008',
        'aaaaaaaa-0000-0000-0000-000000000009'
    );

    INSERT INTO public.invitations (
        id, code_hash, role, max_uses, use_count, expires_at,
        created_by, target_email, status, notes
    ) VALUES
        ('aaaaaaaa-0000-0000-0000-000000000001', encode(digest(upper(regexp_replace(trim('K1718-TARGET-NULL'), '[^A-Za-z0-9-]', '', 'g'))::bytea, 'sha256'), 'hex'), 'CLEN', 3, 0, NOW() + INTERVAL '7 days', '11111111-1111-1111-1111-111111111111', NULL, 'active', 'scenario null target'),
        ('aaaaaaaa-0000-0000-0000-000000000002', encode(digest(upper(regexp_replace(trim('K1718-TARGET-MATCH'), '[^A-Za-z0-9-]', '', 'g'))::bytea, 'sha256'), 'hex'), 'CLEN', 3, 0, NOW() + INTERVAL '7 days', '11111111-1111-1111-1111-111111111111', 'jan.novak@test.local', 'active', 'scenario match'),
        ('aaaaaaaa-0000-0000-0000-000000000003', encode(digest(upper(regexp_replace(trim('K1718-TARGET-MISMATCH'), '[^A-Za-z0-9-]', '', 'g'))::bytea, 'sha256'), 'hex'), 'CLEN', 2, 0, NOW() + INTERVAL '7 days', '11111111-1111-1111-1111-111111111111', 'other@test.local', 'active', 'scenario mismatch'),
        ('aaaaaaaa-0000-0000-0000-000000000004', encode(digest(upper(regexp_replace(trim('K1718-P-EMAIL-BAD'), '[^A-Za-z0-9-]', '', 'g'))::bytea, 'sha256'), 'hex'), 'CLEN', 2, 0, NOW() + INTERVAL '7 days', '11111111-1111-1111-1111-111111111111', 'target@test.local', 'active', 'scenario p_email mismatch'),
        ('aaaaaaaa-0000-0000-0000-000000000005', encode(digest(upper(regexp_replace(trim('K1718-P-EMAIL-IGNORED'), '[^A-Za-z0-9-]', '', 'g'))::bytea, 'sha256'), 'hex'), 'CLEN', 2, 0, NOW() + INTERVAL '7 days', '11111111-1111-1111-1111-111111111111', 'jan.novak@test.local', 'active', 'scenario p_email ignored'),
        ('aaaaaaaa-0000-0000-0000-000000000006', encode(digest(upper(regexp_replace(trim('K1718-CASE-INSENSITIVE'), '[^A-Za-z0-9-]', '', 'g'))::bytea, 'sha256'), 'hex'), 'CLEN', 2, 0, NOW() + INTERVAL '7 days', '11111111-1111-1111-1111-111111111111', 'JAN.NOVAK@TEST.LOCAL', 'active', 'scenario case insensitive'),
        ('aaaaaaaa-0000-0000-0000-000000000007', encode(digest(upper(regexp_replace(trim('K1718-TRIM-WHITESPACE'), '[^A-Za-z0-9-]', '', 'g'))::bytea, 'sha256'), 'hex'), 'CLEN', 2, 0, NOW() + INTERVAL '7 days', '11111111-1111-1111-1111-111111111111', ' jan.novak@test.local ', 'active', 'scenario trim whitespace'),
        ('aaaaaaaa-0000-0000-0000-000000000008', encode(digest(upper(regexp_replace(trim('K1718-EMAIL-NULL'), '[^A-Za-z0-9-]', '', 'g'))::bytea, 'sha256'), 'hex'), 'CLEN', 1, 0, NOW() + INTERVAL '7 days', '11111111-1111-1111-1111-111111111111', 'missing@test.local', 'active', 'scenario missing auth email'),
        ('aaaaaaaa-0000-0000-0000-000000000009', encode(digest(upper(regexp_replace(trim('K1718-ROLE-ASSIGNMENT'), '[^A-Za-z0-9-]', '', 'g'))::bytea, 'sha256'), 'hex'), 'CLEN', 1, 0, NOW() + INTERVAL '7 days', '11111111-1111-1111-1111-111111111111', 'role@test.local', 'active', 'scenario role assignment')
    ON CONFLICT (id) DO UPDATE
    SET code_hash = EXCLUDED.code_hash,
        role = EXCLUDED.role,
        max_uses = EXCLUDED.max_uses,
        use_count = EXCLUDED.use_count,
        expires_at = EXCLUDED.expires_at,
        created_by = EXCLUDED.created_by,
        target_email = EXCLUDED.target_email,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        updated_at = NOW();
END $$;

RESET request.jwt.claims;

-- ----------------------------------------------------------------------------
-- Required scenario checks (manual / blocked unless executed live)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE 'BLOCKED [1]: target_email match / null-target behavior requires live DB proof using auth.users email and explicit claim_invitation_code assertions.';
    RAISE NOTICE 'BLOCKED [2]: mismatched target_email rejection requires a valid authenticated user with email_confirmed_at set and a conflicting target_email.';
    RAISE NOTICE 'BLOCKED [3]: p_email cannot bypass target_email validation; must be checked by verifying auth.users email is authoritative and use_count remains unchanged.';
    RAISE NOTICE 'BLOCKED [4]: case-insensitive comparison must be validated with upper/lower normalization (JAN.NOVAK@TEST.LOCAL vs jan.novak@test.local).';
    RAISE NOTICE 'BLOCKED [5]: trim/whitespace normalization requires a live assertion that target_email = '' jan.novak@test.local '' equals the user email after btrim().';
    RAISE NOTICE 'BLOCKED [6]: missing or invalid auth.users email must reject the claim and leave use_count unchanged.';
    RAISE NOTICE 'BLOCKED [7]: email_confirmed_at = NULL must reject the claim even when target_email and auth.uid() are otherwise valid.';
    RAISE NOTICE 'BLOCKED [8]: auth.uid() and p_user_id must match exactly; expected SQLSTATE 42501 when they differ.';
    RAISE NOTICE 'BLOCKED [9]: anonymous callers must be rejected by the security-definer function.';
    RAISE NOTICE 'BLOCKED [10]: service_role fallback is only valid when auth.uid() is NULL; this must be verified with a trusted service-role context and explicit DB identity checks.';
    RAISE NOTICE 'BLOCKED [11]: max_uses atomicity must be proven by two sequential/live claims or a real concurrency test across two sessions.';
END $$;

-- Real concurrency must be tested in two independent DB sessions; never in one session.
DO $$
BEGIN
    RAISE NOTICE 'BLOCKED [12]: real concurrency check requires two independent database sessions and cannot be marked PASS from a single session.';
    RAISE NOTICE 'Manual procedure:';
    RAISE NOTICE '  1) Create an invitation with max_uses=1 and valid auth.users records for two identities.';
    RAISE NOTICE '  2) Execute claim_invitation_code in Session A and Session B at the same time.';
    RAISE NOTICE '  3) Verify one claim succeeds, the other fails, and use_count never exceeds max_uses.';
    RAISE NOTICE '  4) Confirm the claim_count and DB state match the actual Postgres result, not just the RPC JSON payload.';
END $$;

ROLLBACK;

-- ============================================================================
-- END OF FILE
-- ============================================================================