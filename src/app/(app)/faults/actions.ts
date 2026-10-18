"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { reportFault, updateFault, deleteFault } from "@/lib/equipment/faults.service";
import { FaultSeverity, FaultPriority, FaultStatus } from "@/lib/equipment/faults.validation";

function field(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length === 0 ? null : s;
}

function redirectWithError(path: string, message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`${path}?${params.toString()}`);
}

function redirectWithSuccess(path: string, message: string): never {
  const params = new URLSearchParams({ success: message });
  redirect(`${path}?${params.toString()}`);
}

function isSeverity(v: string | null): v is (typeof FaultSeverity)[number] {
  return v !== null && (FaultSeverity as readonly string[]).includes(v);
}


export async function reportFaultAction(formData: FormData): Promise<void> {
  const equipmentId = field(formData, "equipment_id") ?? "";
  const title = field(formData, "title") ?? "";
  if (!equipmentId || !title) {
    redirectWithError("/faults", "Technika a nazov poruchy su povinne.");
  }

  const severityRaw = field(formData, "severity");
  const priorityRaw = field(formData, "priority");

  try {
    const fault = await reportFault({
      equipment_id: equipmentId,
      title,
      description: field(formData, "description"),
      severity: isSeverity(severityRaw) ? severityRaw : "MEDIUM",
      priority: isPriority(priorityRaw) ? priorityRaw : "NORMAL",
    });
    revalidatePath("/faults");
    redirectWithSuccess("/faults", "Porucha bola nahlasena.");
    void fault;
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri nahlasovani poruchy.";
    redirectWithError("/faults", message);
  }
}

export async function updateFaultAction(formData: FormData): Promise<void> {
  const faultId = field(formData, "fault_id") ?? "";
  if (!faultId) redirectWithError("/faults", "Chyba identifikator poruchy.");

  const statusRaw = field(formData, "status");
  const severityRaw = field(formData, "severity");
  const priorityRaw = field(formData, "priority");

  try {
    await updateFault(faultId, {
      title: field(formData, "title") ?? undefined,
      description: formData.has("description") ? field(formData, "description") : undefined,
      severity: isSeverity(severityRaw) ? severityRaw : undefined,
      priority: isPriority(priorityRaw) ? priorityRaw : undefined,
      status: isStatus(statusRaw) ? statusRaw : undefined,
    });
    revalidatePath("/faults");
    redirectWithSuccess("/faults", "Porucha bola aktualizovana.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri ukladani poruchy.";
    redirectWithError("/faults", message);
  }
}

export async function deleteFaultAction(formData: FormData): Promise<void> {
  const faultId = field(formData, "fault_id") ?? "";
  if (!faultId) redirectWithError("/faults", "Chyba identifikator poruchy.");

  try {
    await deleteFault(faultId);
    revalidatePath("/faults");
    redirectWithSuccess("/faults", "Porucha bola vymazana.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri mazani poruchy.";
    redirectWithError("/faults", message);
  }
}

function isPriority(v: string | null): v is (typeof FaultPriority)[number] {
  return v !== null && (FaultPriority as readonly string[]).includes(v);
}

function isStatus(v: string | null): v is (typeof FaultStatus)[number] {
  return v !== null && (FaultStatus as readonly string[]).includes(v);
}
