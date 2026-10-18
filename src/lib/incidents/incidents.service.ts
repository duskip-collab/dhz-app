// Incident & Operations Service - Server Authorization Layer
// K12 – Výjazdová činnosť a zásahy DHZ
//
// Architektúra: getAuthContext -> permission check -> Supabase RLS.
// RLS zostáva druhou bezpečnostnou vrstvou (defense-in-depth).
//
// Schéma: 20261014_incidents_module.sql

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import { auditIncident } from "@/lib/audit/audit.service";
import { createAuthError } from "@/lib/members/members.errors";
import {
  validateCreateIncident,
  validateUpdateIncident,
  validateResponderList,
  validateEquipmentList,
} from "@/lib/incidents/incidents.validation";
import type {
  Incident,
  IncidentWithDetails,
  ResponderWithMember,
  EquipmentWithItem,
  CreateIncidentInput,
  UpdateIncidentInput,
  ListIncidentsFilters,
  ResponderInput,
  EquipmentInput,
  IncidentStats,
} from "@/types/incidents";

export type {
  Incident,
  IncidentResponder,
  IncidentEquipment,
  IncidentWithDetails,
  CreateIncidentInput,
  UpdateIncidentInput,
  ListIncidentsFilters,
} from "@/types/incidents";

// =============================================================================
// AUTHENTICATION GUARD
// =============================================================================

async function requireAuthenticated(): Promise<AuthContext> {
  try {
    return await getAuthContext();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Unable to load authenticated user") ||
      message.includes("Session expired")
    ) {
      throw createAuthError(401, "Prihlásenie vypršalo alebo neplatí.");
    }
    throw error;
  }
}

async function assertPermission(ctx: AuthContext, permission: Permission): Promise<void> {
  const ok =
    ctx.permissions.includes(permission) || (await hasPermissionServer(ctx.userId, permission));
  if (!ok) {
    throw createAuthError(403, "Nemáte oprávnenie na túto operáciu.");
  }
}

const RESPONDER_SELECT =
  "*, member:members!incident_responders_member_id_fkey(id, first_name, last_name, member_number)";
const EQUIPMENT_SELECT =
  "*, equipment:equipment_items!incident_equipment_equipment_id_fkey(id, name, inventory_number)";

// =============================================================================
// HELPERS – množiny existujúcich ID pre validáciu referencií
// =============================================================================

async function existingMemberIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("members").select("id");
  if (error) {
    console.error("[incidents] members load error:", error);
    throw createAuthError(500, "Chyba pri kontrole členov.");
  }
  return new Set(((data || []) as { id: string }[]).map((m) => m.id));
}

async function existingEquipmentIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("equipment_items").select("id");
  if (error) {
    console.error("[incidents] equipment load error:", error);
    throw createAuthError(500, "Chyba pri kontrole techniky.");
  }
  return new Set(((data || []) as { id: string }[]).map((m) => m.id));
}

// =============================================================================
// READ – getIncidents
// Vyžaduje `incidents.view`. Filtre: type, status, date_from, date_to + stránkovanie.
// =============================================================================

export async function getIncidents(filters: ListIncidentsFilters = {}): Promise<Incident[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INCIDENTS_VIEW);

  const supabase = await createClient();
  let query = supabase.from("incidents").select("*").order("reported_at", { ascending: false });

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.date_from) query = query.gte("reported_at", filters.date_from);
  if (filters.date_to) query = query.lte("reported_at", filters.date_to);

  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) {
    console.error("[getIncidents] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní zásahov.");
  }
  return (data || []) as Incident[];
}

// =============================================================================
// READ – getIncidentById
// Vyžaduje `incidents.view`. Detail + posádka + technika.
// =============================================================================

export async function getIncidentById(incidentId: string): Promise<IncidentWithDetails> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INCIDENTS_VIEW);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("incidents")
    .select("*")
    .eq("id", incidentId)
    .single();
  if (error) {
    console.error("[getIncidentById] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Zásah sa nenašiel.");
    throw createAuthError(500, "Chyba pri načítavaní zásahu.");
  }

  const { data: responders, error: rErr } = await supabase
    .from("incident_responders")
    .select(RESPONDER_SELECT)
    .eq("incident_id", incidentId)
    .order("created_at", { ascending: true });
  if (rErr) {
    console.error("[getIncidentById] responders error:", rErr);
    throw createAuthError(500, "Chyba pri načítavaní posádky.");
  }

  const { data: equipment, error: eErr } = await supabase
    .from("incident_equipment")
    .select(EQUIPMENT_SELECT)
    .eq("incident_id", incidentId)
    .order("created_at", { ascending: true });
  if (eErr) {
    console.error("[getIncidentById] equipment error:", eErr);
    throw createAuthError(500, "Chyba pri načítavaní techniky.");
  }

  return {
    ...(data as Incident),
    responders: (responders || []) as ResponderWithMember[],
    equipment: (equipment || []) as EquipmentWithItem[],
  };
}

// =============================================================================
// READ – getIncidentStats
// Vyžaduje `incidents.view`. Súhrnné štatistiky pre dashboard.
// =============================================================================

export async function getIncidentStats(): Promise<IncidentStats> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INCIDENTS_VIEW);

  const supabase = await createClient();
  const { data, error } = await supabase.from("incidents").select("status, type");
  if (error) {
    console.error("[getIncidentStats] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní štatistík.");
  }

  const rows = (data || []) as { status: Incident["status"]; type: Incident["type"] }[];
  const byType: Record<string, number> = {};
  let completedCount = 0;
  for (const r of rows) {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
    if (r.status === "COMPLETED") completedCount += 1;
  }

  let mostFrequentType: Incident["type"] | null = null;
  let max = 0;
  for (const [type, count] of Object.entries(byType)) {
    if (count > max) {
      max = count;
      mostFrequentType = type as Incident["type"];
    }
  }

  // Súčty motohodín a kilometrov z incident_equipment.
  const { data: eqRows, error: eqErr } = await supabase
    .from("incident_equipment")
    .select("engine_hours_used, kilometers_driven");
  let totalEngineHours = 0;
  let totalKilometers = 0;
  if (!eqErr && eqRows) {
    for (const r of eqRows as { engine_hours_used: number | null; kilometers_driven: number | null }[]) {
      totalEngineHours += r.engine_hours_used ?? 0;
      totalKilometers += r.kilometers_driven ?? 0;
    }
  }

  return {
    total: rows.length,
    completedCount,
    totalEngineHours,
    totalKilometers,
    mostFrequentType,
    byType: byType as IncidentStats["byType"],
  };
}


// =============================================================================
// WRITE – createIncident
// Vyžaduje `incidents.create`. Vytvorí zásaz + posádku + techniku.
//
// POZNÁMKA K ATOMICITE: Projekt nemá RPC/transakčnú podporu v Supabase JS
// klientovi. Zápis je preto sériou nezávislých vkladov (incidents ->
// incident_responders -> incident_equipment) a NIE JE transakčne atomické.
// Pri zlyhaní uprostred môže ostať zásaz uložený bez časti posádky/techniky.
// Pre plnú atomicitu bola potrebná DB funkcia (RPC), ktorá v K12 vytvorená nebola
// (mimo scope; dá sa doplniť neskôr ako K10.5 robil pre súťaže).
// =============================================================================

export async function createIncident(data: CreateIncidentInput): Promise<Incident> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INCIDENTS_CREATE);

  const parsed = validateCreateIncident(data);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje zásahu.", parsed.errors);
  }

  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from("incidents")
    .insert({ ...parsed.data, created_by: ctx.userId, updated_by: ctx.userId })
    .select("*")
    .single();

  if (error) {
    console.error("[createIncident] Supabase error:", error);
    throw createAuthError(500, "Chyba pri vytváraní zásahu.");
  }

  const incident = created as Incident;

  // Posádka
  if (data.responders && data.responders.length > 0) {
    const memberIds = await existingMemberIds();
    const rParsed = validateResponderList(data.responders, memberIds);
    if (!rParsed.ok) {
      throw createAuthError(400, "Neplatná posádka.", rParsed.errors);
    }
    const rows = rParsed.data.map((r) => ({
      incident_id: incident.id,
      member_id: r.member_id,
      role: r.role,
      notes: r.notes ?? null,
    }));
    const { error: rErr } = await supabase.from("incident_responders").insert(rows);
    if (rErr) {
      console.error("[createIncident] responders error:", rErr);
      if (rErr.code === "23505") throw createAuthError(409, "Posádka už je priradená.");
      throw createAuthError(500, "Chyba pri ukladaní posádky.");
    }
  }

  // Technika
  if (data.equipment && data.equipment.length > 0) {
    const equipIds = await existingEquipmentIds();
    const eParsed = validateEquipmentList(data.equipment, equipIds);
    if (!eParsed.ok) {
      throw createAuthError(400, "Neplatná technika.", eParsed.errors);
    }
    const rows = eParsed.data.map((e) => ({
      incident_id: incident.id,
      equipment_id: e.equipment_id,
      engine_hours_used: e.engine_hours_used,
      kilometers_driven: e.kilometers_driven,
      notes: e.notes ?? null,
    }));
    const { error: eErr } = await supabase.from("incident_equipment").insert(rows);
    if (eErr) {
      console.error("[createIncident] equipment error:", eErr);
      if (eErr.code === "23505") throw createAuthError(409, "Technika už je priradená.");
      throw createAuthError(500, "Chyba pri ukladaní techniky.");
    }
  }

  await auditIncident(ctx.userId, "create", incident.id, {
    title: incident.title,
    type: incident.type,
    reported_at: incident.reported_at,
  });
  return incident;
}


// =============================================================================
// WRITE – updateIncident
// Vyžaduje `incidents.edit`. Ak sú poskytnuté responders/equipment, nahrádza
// existujúce riadky (DELETE + INSERT). Taktiež NIE je transakčne atomické
// (viď poznámku vyššie).
// =============================================================================

export async function updateIncident(
  incidentId: string,
  data: UpdateIncidentInput
): Promise<Incident> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INCIDENTS_EDIT);

  const supabase = await createClient();

  const { data: existing, error: loadError } = await supabase
    .from("incidents")
    .select("reported_at, dispatched_at, arrived_at, returned_at")
    .eq("id", incidentId)
    .single();
  if (loadError) {
    if (loadError.code === "PGRST116") throw createAuthError(404, "Zásah sa nenašiel.");
    console.error("[updateIncident] load error:", loadError);
    throw createAuthError(500, "Chyba pri načítavaní zásahu.");
  }

  const parsed = validateUpdateIncident(data, existing);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje zásahu.", parsed.errors);
  }

  const update = { ...parsed.data, updated_by: ctx.userId };
  const { data: updated, error } = await supabase
    .from("incidents")
    .update(update)
    .eq("id", incidentId)
    .select("*")
    .single();
  if (error) {
    console.error("[updateIncident] Supabase error:", error);
    throw createAuthError(500, "Chyba pri ukladaní zásahu.");
  }

  if (data.responders !== undefined) {
    await replaceResponders(supabase, incidentId, data.responders);
  }
  if (data.equipment !== undefined) {
    await replaceEquipment(supabase, incidentId, data.equipment);
  }

  const incident = updated as Incident;
  await auditIncident(ctx.userId, "update", incidentId, parsed.data);
  return incident;
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function replaceResponders(
  supabase: SupabaseClient,
  incidentId: string,
  responders: ResponderInput[]
): Promise<void> {
  if (responders.length === 0) {
    const { error } = await supabase
      .from("incident_responders")
      .delete()
      .eq("incident_id", incidentId);
    if (error) throw createAuthError(500, "Chyba pri odstraňovaní posádky.");
    return;
  }

  const memberIds = await existingMemberIds();
  const parsed = validateResponderList(responders, memberIds);
  if (!parsed.ok) throw createAuthError(400, "Neplatná posádka.", parsed.errors);

  const { error: delError } = await supabase
    .from("incident_responders")
    .delete()
    .eq("incident_id", incidentId);
  if (delError) throw createAuthError(500, "Chyba pri výmene posádky.");

  const rows = parsed.data.map((r) => ({
    incident_id: incidentId,
    member_id: r.member_id,
    role: r.role,
    notes: r.notes ?? null,
  }));
  const { error } = await supabase.from("incident_responders").insert(rows);
  if (error) {
    if (error.code === "23505") throw createAuthError(409, "Posádka už je priradená.");
    throw createAuthError(500, "Chyba pri ukladaní posádky.");
  }
}

async function replaceEquipment(
  supabase: SupabaseClient,
  incidentId: string,
  equipment: EquipmentInput[]
): Promise<void> {
  if (equipment.length === 0) {
    const { error } = await supabase
      .from("incident_equipment")
      .delete()
      .eq("incident_id", incidentId);
    if (error) throw createAuthError(500, "Chyba pri odstraňovaní techniky.");
    return;
  }

  const equipIds = await existingEquipmentIds();
  const parsed = validateEquipmentList(equipment, equipIds);
  if (!parsed.ok) throw createAuthError(400, "Neplatná technika.", parsed.errors);

  const { error: delError } = await supabase
    .from("incident_equipment")
    .delete()
    .eq("incident_id", incidentId);
  if (delError) throw createAuthError(500, "Chyba pri výmene techniky.");

  const rows = parsed.data.map((e) => ({
    incident_id: incidentId,
    equipment_id: e.equipment_id,
    engine_hours_used: e.engine_hours_used,
    kilometers_driven: e.kilometers_driven,
    notes: e.notes ?? null,
  }));
  const { error } = await supabase.from("incident_equipment").insert(rows);
  if (error) {
    if (error.code === "23505") throw createAuthError(409, "Technika už je priradená.");
    throw createAuthError(500, "Chyba pri ukladaní techniky.");
  }
}

// =============================================================================
// WRITE – deleteIncident
// Vyžaduje `incidents.delete`. Odstráni záznam (posádka/technika CASCADE).
// =============================================================================

export async function deleteIncident(incidentId: string): Promise<{ id: string }> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INCIDENTS_DELETE);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incidents")
    .delete()
    .eq("id", incidentId)
    .select("id, title")
    .single();

  if (error) {
    console.error("[deleteIncident] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Zásah sa nenašiel.");
    throw createAuthError(500, "Chyba pri odstraňovaní zásahu.");
  }

  await auditIncident(ctx.userId, "delete", incidentId, { title: data.title });
  return { id: incidentId };
}

