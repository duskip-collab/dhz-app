-- Course Catalog migration
-- K29.0: Cesta k kurzom a kvalifikáciam členov

-- 1. CREATE TABLE course_catalog
CREATE TABLE IF NOT EXISTS public.course_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    name TEXT NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 200),
    description TEXT,
    issuing_authority TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(code)
);

COMMENT ON TABLE public.course_catalog IS 'Katalóg aktívnych kurzov a tréningov k dispozícii pre udelenie';
COMMENT ON COLUMN public.course_catalog.code IS 'Kód kurzu (unikátny identifikátor)';
COMMENT ON COLUMN public.course_catalog.name IS 'Názov kurzu';
COMMENT ON COLUMN public.course_catalog.description IS 'Popis kurzu';
COMMENT ON COLUMN public.course_catalog.issuing_authority IS 'Inštitúcia/kurzova škola';

-- 2. INDEXES
CREATE INDEX IF NOT EXISTS idx_course_catalog_code ON public.course_catalog(code);
CREATE INDEX IF NOT EXISTS idx_course_catalog_name ON public.course_catalog(name);

-- 3. RLS POLICIES
DROP POLICY IF EXISTS course_catalog_select_all ON public.course_catalog;
CREATE POLICY course_catalog_select_all ON public.course_catalog FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS course_catalog_insert_roles ON public.course_catalog;
CREATE POLICY course_catalog_insert_roles ON public.course_catalog FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid()
          AND (r.code = 'ADMIN' OR r.code = 'VEDENIE' OR r.code = 'VELITEL' OR r.code = 'TRENER')
    )
);

DROP POLICY IF EXISTS course_catalog_update_roles ON public.course_catalog;
CREATE POLICY course_catalog_update_roles ON public.course_catalog FOR UPDATE TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid()
          AND (r.code = 'ADMIN' OR r.code = 'VEDENIE' OR r.code = 'VELITEL' OR r.code = 'TRENER')
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid()
          AND (r.code = 'ADMIN' OR r.code = 'VEDENIE' OR r.code = 'VELITEL' OR r.code = 'TRENER')
    )
);

DROP POLICY IF EXISTS course_catalog_delete_admin ON public.course_catalog;
CREATE POLICY course_catalog_delete_admin ON public.course_catalog FOR DELETE TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid()
          AND r.code = 'ADMIN'
    )
);

-- 4. TRIGGER
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS course_catalog_set_updated_at ON public.course_catalog;
CREATE TRIGGER course_catalog_set_updated_at BEFORE UPDATE ON public.course_catalog FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. SAMPLE DATA
INSERT INTO public.course_catalog (code, name, description, issuing_authority) VALUES
    ('CPR-001', 'Základy reanimácie (CPR)', 'Základné skúsenosti s odbornej reanimáciou podľa AHA western guidelines.', 'SamoSelyová JPZ SK'),
    ('FIRST-AID-002', 'Prvá pomoc pre lekárskeho personálu', 'Odborné tréningy z prvej pomoci s ohľadom chirurgických postrehov.', 'Národný zdravotnícky servis'),
    ('HARVEST-LED-003', 'Rozhranie HL-702K (LED MDR)', 'Technické zkúsenosti s odstraňovačom ľadových cesiení HL-702K.', 'Hyperqualizer'),
    ('FIRE-SAFETY-004', 'Odborná bezpečnosť a prevencia hnutia ohnia', 'Základné znalosti z bezpečnosti v pracovisku a prevencie výbuchov a požiara.', 'PRAVO ČR'),
    ('DIVING-005', 'Diverzná tréningová brána (RTB)', 'Individuálna tréningová brána pre diverziju s teglovou technikou.', 'DKS Slovakia'),
    ('DRIVER-006', 'E-learningová trieda žiakov C1', 'E-learningová tréningová časť zákona o vozidle č. C1.', 'Štart Info s.r.o'),
    ('COMP-007', 'Kontrola znalosti práva na sociálne poistenie', 'Skúška z povinného sociálneho poistenia pre učiteľov.', 'Slovenská komora učiteľov a školárova'),
    ('LIFEGUARD-008', 'Životovo chrániace zručnosti (BAZK)', 'Tréning životne chrániaceho personálu pre bazény.', 'Slovenský zväz bazeňáci'),
    ('AVALANCHE-009', 'Prvá pomoc pri avalançi', 'Odborný kurz prvej pomoci pri avalačných udalostiach.', 'Slovak Avalanche Rescue'),
    ('COASTAL-010', 'Kolektívne trenovanie nárazníkov č. 1', 'Kolektívne trenovanie z euforického nárazníka pre každodennú používanie na tréningi.', 'KNI-1 Mutual Ltd.')
ON CONFLICT (code) DO NOTHING;