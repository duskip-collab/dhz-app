"use server";

import { revalidatePath } from "next/cache";
import {
  getIncidents,
  getIncidentById,
  getIncidentStats,
  createIncident,
  updateIncident,
  deleteIncident,
} from "@/lib/incidents/incidents.service";
import type {
  CreateIncidentInput,
  UpdateIncidentInput,
  ListIncidentsFilters,
} from "@/types/incidents";

// Štandardný výsledok server action v tomto projekte.
export type IncidentActionState =
  | { ok: true; incidentId?: string }
  | { ok: false; errors: Record<string, string>; message: string };

// Revalidácia ciest modulu (prehľad + detail).
const REVALIDATE_PATHS = ["/dashboard/incidents"];

function revalidateIncidents(incidentId?: string): void {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
  if (incidentId) revalidatePath(`/dashboard/incidents/${incidentId}`);
}

function fail(message: string, errors: Record<string, string> = {}): IncidentActionState {
  return { ok: false, errors, message };
}

function detailsFrom(e: unknown): Record<string, string> {
  if (e && typeof e === "object" && "details" in e) {
    return (e as { details?: Record<string, string> }).details ?? {};
  }
  return {};
}

function handleError(e: unknown, fallback: string): IncidentActionState {
  const status = (e as { statusCode?: number }).statusCode ?? 500;
  if (status === 403) return fail("Nemáte oprávnenie.");
  if (status === 404) return fail("Zásah sa nenašiel.");
  if (status === 409) return fail(e instanceof Error ? e.message : "Konflikt údajov.");
  if (status === 400) return fail(e instanceof Error ? e.message : "Neplatné údaje.");
  return fail(fallback);
}

// Načítanie dát pre stránky (server-side, s permission checkom v službe).
export async function loadIncidents(filters: ListIncidentsFilters = {}) {
  return getIncidents(filters);
}

export async function loadIncidentById(id: string) {
  return getIncidentById(id);
}

export async function loadIncidentStats() {
  return getIncidentStats();
}

// =============================================================================
// CREATE / UPDATE / DELETE (používané formuláromi)
// =============================================================================

export async function createIncidentAction(
  _prev: IncidentActionState | null,
  data: CreateIncidentInput
): Promise<IncidentActionState> {
  try {
    const incident = await createIncident(data);
    revalidateIncidents();
    return { ok: true, incidentId: incident.id };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 400) {
      return fail("Skontrolujte zvýraznené polia.", detailsFrom(e));
    }
    return handleError(e, "Chyba pri vytváraní zásahu.");
  }
}

export async function updateIncidentAction(
  incidentId: string,
  _prev: IncidentActionState | null,
  data: UpdateIncidentInput
): Promise<IncidentActionState> {
  try {
    await updateIncident(incidentId, data);
    revalidateIncidents(incidentId);
    return { ok: true, incidentId };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 400) {
      return fail("Skontrolujte zvýraznené polia.", detailsFrom(e));
    }
    return handleError(e, "Chyba pri ukladaní zásahu.");
  }
}

export async function deleteIncidentAction(incidentId: string): Promise<IncidentActionState> {
  try {
    await deleteIncident(incidentId);
    revalidateIncidents();
    return { ok: true, incidentId };
  } catch (e) {
    return handleError(e, "Chyba pri odstraňovaní zásahu.");
  }
}
