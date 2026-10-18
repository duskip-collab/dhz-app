-- ============================================================================
-- Migration: incidents — audit_incident_changes() : column-model fix
-- Date: 20261027
-- Status: NÁVRH — NEAPLIKOVAŤ bez overenia na autorizovanom DEV prostredí
--         (supabase db push --dry-run; až po schválení DBA).
--
-- Prečo: public.audit_incident_changes() (20261014:284-355) INSERTuje do
--        public.audit_log stĺpce (object_id, old_values, new_values), ktoré
--        v checked-in DDL NEEXISTUJÚ (20261006:216-236 definuje kanonické
--        entity_type, entity_id, old_data, new_data).
--        Na kanonickej DB preto KAŽDÝ INSERT/UPDATE/DELETE na
--        incidents, incident_responders a incident_equipment zlyhá chybou
--        42703 "column object_id of relation audit_log does not exist"
--        (rovnaká trieda chyby ako AUDIT_LOG_SCHEMA_FIX.md Chyba 1, ktorá
--        opravila 20261007/20261008/20261010 — 20261014 v zozname CHÝBA).
--
--        Navyše vetva INSERT číta NEW.created_by pre VŠETKY tri tabuľky, ale
--        incident_responders ani incident_equipment stĺpec created_by NEMAJÚ
--        → chyba 42703 "record new has no field created_by" (trieda Chyba 2).
--
-- Riešenie (forward-only, bez prepisu histórie):
--   CREATE OR REPLACE FUNCTION s TELOM, ktoré sa PRISPÔSOBÍ modelu DB:
--     * ak audit_log obsahuje entity_id  → kanonické INSERT (entity_id/old_data/new_data),
--     * inak (K8 schéma s object_id)     → pôvodné INSERT (object_id/old_values/new_values).
--   Detekcia prebieha pri KAŽDOM volaní dotazom na information_schema.columns,
--   takže funkcia je bezpečná na oboch modeloch a migrácia NIKDY neblokuje push.
--   (SQL vnútri nebežiacej vetvy sa neplánuje → neexistujúce stĺpce nevadia.)
--
--   Súčasne opravené určenie aktéra: NEW.created_by sa číta LEN pre
--   incidents (jediná z troch tabuliek, ktorá ho má); inak auth.uid().
--
-- Trigger väzby sa NEMENIA (CREATE OR REPLACE zachováva OID → triggre
-- incidents_audit_trigger / incident_responders_audit_trigger /
-- incident_equipment_audit_trigger zostávajú napojené).
--
-- Poznámka k pořadí (poučenie z K13.4.5): značka 20261027 je JEDINEČNÁ a vyššia
-- než všetky existujúce (max 20261024) — žiadna kolízia timestampu.
--
-- Idempotencia: CREATE OR REPLACE FUNCTION — opakované spustenie bezpečné.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_incident_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
    v_action TEXT;
    v_module TEXT;
    v_uid uuid;
    v_id uuid;
    v_old jsonb;
    v_new jsonb;
    v_canonical boolean;
BEGIN
    IF TG_TABLE_NAME = 'incidents' THEN
        v_module := 'incidents';
    ELSIF TG_TABLE_NAME = 'incident_responders' THEN
        v_module := 'incident_responders';
    ELSE
        v_module := 'incident_equipment';
    END IF;

    -- Aktér: NEW.created_by existuje LEN na incidents; ostatné tabuľky → auth.uid().
    -- (Vnorené IF: vnútorná vetva sa vyhodnocuje až po potvrdení TG_TABLE_NAME,
    --  takže NEW.created_by sa nikdy nečíta pre tabuľky bez tohto stĺpca.)
    IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'incidents' THEN
        IF NEW.created_by IS NOT NULL THEN
            v_uid := NEW.created_by;
        ELSE
            v_uid := (SELECT auth.uid());
        END IF;
    ELSE
        v_uid := (SELECT auth.uid());
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_action := CASE
            WHEN TG_TABLE_NAME = 'incidents' THEN 'INCIDENT_CREATE'
            WHEN TG_TABLE_NAME = 'incident_responders' THEN 'INCIDENT_RESPONDER_CREATE'
            ELSE 'INCIDENT_EQUIPMENT_CREATE'
        END;
        v_id := NEW.id;
        v_old := NULL;
        v_new := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := CASE
            WHEN TG_TABLE_NAME = 'incidents' THEN 'INCIDENT_UPDATE'
            WHEN TG_TABLE_NAME = 'incident_responders' THEN 'INCIDENT_RESPONDER_UPDATE'
            ELSE 'INCIDENT_EQUIPMENT_UPDATE'
        END;
        v_id := NEW.id;
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        v_action := CASE
            WHEN TG_TABLE_NAME = 'incidents' THEN 'INCIDENT_DELETE'
            WHEN TG_TABLE_NAME = 'incident_responders' THEN 'INCIDENT_RESPONDER_DELETE'
            ELSE 'INCIDENT_EQUIPMENT_DELETE'
        END;
        v_id := OLD.id;
        v_old := to_jsonb(OLD);
        v_new := NULL;
    ELSE
        RETURN NULL;
    END IF;

    -- Ktorý model stĺpcov audit_log daná DB používa?
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'audit_log'
          AND column_name = 'entity_id'
    ) INTO v_canonical;

    IF v_canonical THEN
        -- Kanonický model (20261006): entity_id uuid / old_data / new_data.
        INSERT INTO public.audit_log (
            user_id, action, module, entity_id, old_data, new_data
        ) VALUES (
            v_uid,
            v_action,
            v_module,
            v_id,
            v_old,
            v_new
        );
    ELSE
        -- K8 model: object_id / old_values / new_values.
        INSERT INTO public.audit_log (
            user_id, action, module, object_id, old_values, new_values
        ) VALUES (
            v_uid,
            v_action,
            v_module,
            v_id::text,
            v_old,
            v_new
        );
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$fn$;

-- ============================================================================
-- Overenie po aplikácii (kontrolný SELECT — spúšťa DBA na DEV):
--   SELECT proname, prosecdef FROM pg_proc
--    WHERE proname = 'audit_incident_changes';
--   INSERT/UPDATE/DELETE cvičného riadku incidents v BEGIN…ROLLBACK a kontrola,
--   že riadok v audit_log má entity_id (kanonická DB) resp. object_id (K8 DB).
-- ============================================================================
