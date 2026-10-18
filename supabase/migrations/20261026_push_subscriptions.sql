-- ============================================================================
-- Migration: push_subscriptions — Web Push odbery (modul Komunikácia)
-- Date: 20261026
-- Status: NÁVRH — NEAPLIKOVAŤ bez overenia na autorizovanom DEV prostredí
--         (supabase db push --dry-run; až po schválení DBA).
--
-- Prečo: aplikácia (src/hooks/usePushNotifications.ts:74-99) aj Edge funkcia
--        send-push (supabase/functions/send-push/index.ts:133,169) pracujú
--        s tabuľkou public.push_subscriptions, ktorá v žiadnej migrácii
--        NEEXISTUJE (overené: 0 zhôd v supabase/migrations/*).
--        Hook preto končí stavom granted-local a send-push vracia 503.
--
-- Zdroj DDL: K13.4.2_COMPLETION_REPORT.md §6 (idempotentná verzia) + doplnené:
--   - index na user_id,
--   - samostatné UPDATE a DELETE politiky (PostgREST upsert s onConflict=endpoint
--     vyžaduje aj UPDATE právo na vlastný riadok),
--   - updated_at trigger cez existujúcu public.set_updated_at() (20261006).
--
-- Poznámka k pořadí (poučenie z K13.4.5): značka 20261026 je JEDINEČNÁ a vyššia
-- než všetky existujúce (max 20261024) — žiadna kolízia timestampu.
--
-- Idempotencia: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS / CREATE +
--               DROP TRIGGER IF EXISTS / CREATE. Opakované spustenie je bezpečné.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
    ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Aplikácia NIKDY nevypĺňa user_id explicitne (hook posiela len
-- endpoint/p256dh/auth) — default auth.uid() ho doplní z JWT relácie.
ALTER TABLE public.push_subscriptions
    ALTER COLUMN user_id SET DEFAULT auth.uid();

-- updated_at udržiava existujúca generická funkcia (nemení sa jej definícia).
DROP TRIGGER IF EXISTS push_subscriptions_set_updated_at
    ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_set_updated_at
    BEFORE UPDATE ON public.push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- --- RLS: vlastník vidí a mení len svoje odbery ---
DROP POLICY IF EXISTS push_sub_self_select ON public.push_subscriptions;
CREATE POLICY push_sub_self_select ON public.push_subscriptions
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_sub_self_insert ON public.push_subscriptions;
CREATE POLICY push_sub_self_insert ON public.push_subscriptions
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_sub_self_update ON public.push_subscriptions;
CREATE POLICY push_sub_self_update ON public.push_subscriptions
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_sub_self_delete ON public.push_subscriptions;
CREATE POLICY push_sub_self_delete ON public.push_subscriptions
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- --- Práva: service_role potrebuje čítať/mazať všetky odbery (send-push) ---
REVOKE ALL ON TABLE public.push_subscriptions FROM public, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;

-- ============================================================================
-- Overenie po aplikácii (kontrolný SELECT — spúšťa DBA na DEV):
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'push_subscriptions';
--   SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'push_subscriptions';
-- Očakávané: endpoint UNIQUE; user_id DEFAULT auth.uid(); 4 politiky.
-- ============================================================================
