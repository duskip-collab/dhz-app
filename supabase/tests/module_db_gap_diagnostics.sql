-- ============================================================================
-- Diagnostika: modul ↔ DB medzery (READ-ONLY — žiadne zápisy)
-- Spustenie: v SQL editore / psql ako vlastník DB (DEV prostredie).
-- Výstup: RAISE NOTICE riadky. Cieľ: OK / CHÝBA / NEZHODA pri každej kontrole.
--
-- Pokrýva nálezy overenia modulov: push_subscriptions, member_guardians,
-- members (K8 model), audit_log (kanonický vs K8 model), audit_incident_changes,
-- RPC funkcie, view finance_account_balances.
-- ============================================================================

DO $diag$
DECLARE
    t text;
    c text;
    n_missing_tables int := 0;
    n_problems int := 0;
BEGIN
    RAISE NOTICE '== 1) Tabuľky používané aplikáciou (.from) ==';
    FOREACH t IN ARRAY ARRAY[
        'profiles','roles','permissions','role_permissions','user_roles',
        'user_permissions','audit_log','members','member_guardians',
        'trainings','training_attendance','competitions','competition_teams',
        'competition_lineups','equipment_categories','equipment_items',
        'vehicle_details','equipment_assignments','equipment_maintenance_logs',
        'incidents','incident_responders','incident_equipment',
        'finance_accounts','finance_categories','finance_transactions',
        'finance_plans','finance_transaction_attachments'
    ] LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE NOTICE 'CHÝBA tabuľka: public.%', t;
            n_missing_tables := n_missing_tables + 1;
        ELSE
            RAISE NOTICE 'OK tabuľka: public.%', t;
        END IF;
    END LOOP;

    RAISE NOTICE '== 2) push_subscriptions (modul Komunikácia) ==';
    IF to_regclass('public.push_subscriptions') IS NULL THEN
        RAISE NOTICE 'CHÝBA tabuľka: public.push_subscriptions (migrácia 20261026 pripravená, neaplikovaná)';
        n_problems := n_problems + 1;
    ELSE
        FOREACH c IN ARRAY ARRAY['user_id','endpoint','p256dh','auth'] LOOP
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema='public' AND table_name='push_subscriptions'
                             AND column_name=c) THEN
                RAISE NOTICE 'CHÝBA stĺpec push_subscriptions.%', c;
                n_problems := n_problems + 1;
            END IF;
        END LOOP;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint
                       WHERE conrelid='public.push_subscriptions'::regclass
                         AND contype='u'
                         AND pg_get_constraintdef(oid) ILIKE '%endpoint%') THEN
            RAISE NOTICE 'CHÝBA UNIQUE na push_subscriptions.endpoint (hook vyžaduje onConflict=endpoint)';
            n_problems := n_problems + 1;
        END IF;
    END IF;

    RAISE NOTICE '== 3) audit_log — kanonický vs K8 model ==';
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='audit_log'
                 AND column_name='entity_id') THEN
        RAISE NOTICE 'OK audit_log: kanonický model (entity_id) — aplikácia logSecurityEvent + typy potrebujú zmenu (viď výsledok overenia)';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='audit_log'
                    AND column_name='object_id') THEN
        RAISE NOTICE 'OK audit_log: K8 model (object_id) — DB triggre 20261007/08/10/15 budú zlyhávať';
        n_problems := n_problems + 1;
    ELSE
        RAISE NOTICE 'CHÝBA audit_log alebo nemá ani entity_id ani object_id';
        n_problems := n_problems + 1;
    END IF;

    RAISE NOTICE '== 4) members — core vs K8 model ==';
    FOREACH c IN ARRAY ARRAY['auth_user_id','member_number','membership_type','birth_date','left_at','photo_path'] LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='members'
                     AND column_name=c) THEN
            RAISE NOTICE 'OK members.% (K8 model)', c;
        ELSE
            RAISE NOTICE 'NEZHODA members.% chýba (aplikácia/typy ho očakávajú)', c;
            n_problems := n_problems + 1;
        END IF;
    END LOOP;
    IF to_regclass('public.member_guardians') IS NULL THEN
        RAISE NOTICE 'NEZHODA member_guardians: tabuľka neexistuje (guardians áno/nie: %)',
            (to_regclass('public.guardians') IS NOT NULL);
        n_problems := n_problems + 1;
    ELSE
        RAISE NOTICE 'OK tabuľka: public.member_guardians';
    END IF;

    RAISE NOTICE '== 5) RPC / funkcie a view ==';
    FOREACH t IN ARRAY ARRAY[
        'has_permission','has_role','save_team_with_lineup',
        'finance_create_transfer','finance_guard_transactions',
        'audit_incident_changes','set_updated_at'
    ] LOOP
        IF EXISTS (SELECT 1 FROM pg_proc p
                   JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname='public' AND p.proname=t) THEN
            RAISE NOTICE 'OK funkcia: public.%', t;
        ELSE
            RAISE NOTICE 'CHÝBA funkcia: public.%', t;
            n_problems := n_problems + 1;
        END IF;
    END LOOP;
    IF to_regclass('public.finance_account_balances') IS NULL THEN
        RAISE NOTICE 'CHÝBA view: public.finance_account_balances';
        n_problems := n_problems + 1;
    ELSE
        RAISE NOTICE 'OK view: public.finance_account_balances';
    END IF;

    RAISE NOTICE '== ZHRNUTIE: chýbajúce tabuľky=%, ostatné problémy=% ==',
        n_missing_tables, n_problems;
END;
$diag$;
