"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createInspection,
  updateInspection,
  deleteInspection,
} from "@/lib/equipment/inspections.service";
import { InspectionType, InspectionStatus } from "@/lib/equipment/inspections.validation";

function field(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length === 0 ? null : s;
}

function numField(formData: FormData, name: string): number | null {
  const raw = field(formData, name);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function redirectWithError(path: string, message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`${path}?${params.toString()}`);
}

export async function createInspectionAction(formData: FormData): Promise<void> {
  const equipmentId = field(formData, "equipment_id") ?? "";
  const typeRaw = field(formData, "type") ?? "";
  const title = field(formData, "title") ?? "";
  if (!equipmentId || !title) {
    redirectWithError("/inspections", "Technika a nazov su povinne.");
  }
  if (!(InspectionType as readonly string[]).includes(typeRaw)) {
    redirectWithError("/inspections", "Neplatny typ revizie.");
  }

  try {
    await createInspection({
      equipment_id: equipmentId,
      type: typeRaw as (typeof InspectionType)[number],
      title,
      description: field(formData, "description"),
      scheduled_date: field(formData, "scheduled_date"),
      performed_at: field(formData, "performed_at"),
      valid_until: field(formData, "valid_until"),
      performed_by: field(formData, "performed_by"),
      cost: numField(formData, "cost"),
      protocol_number: field(formData, "protocol_number"),
    });
    revalidatePath("/inspections");
    redirectWithSuccess("/inspections", "Revizia bola naplanovana.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri planovani revizie.";
    redirectWithError("/inspections", message);
  }
}

export async function updateInspectionAction(formData: FormData): Promise<void> {
  const inspectionId = field(formData, "inspection_id") ?? "";
  if (!inspectionId) redirectWithError("/inspections", "Chyba identifikator revizie.");

  const statusRaw = field(formData, "status");
  const status = (InspectionStatus as readonly string[]).includes(statusRaw ?? "")
    ? (statusRaw as (typeof InspectionStatus)[number])
    : undefined;

  try {
    await updateInspection(inspectionId, {
      title: field(formData, "title") ?? undefined,
      description: formData.has("description") ? field(formData, "description") : undefined,
      status,
      scheduled_date: formData.has("scheduled_date") ? field(formData, "scheduled_date") : undefined,
      performed_at: formData.has("performed_at") ? field(formData, "performed_at") : undefined,
      valid_until: formData.has("valid_until") ? field(formData, "valid_until") : undefined,
      performed_by: formData.has("performed_by") ? field(formData, "performed_by") : undefined,
      cost: formData.has("cost") ? numField(formData, "cost") : undefined,
      protocol_number: formData.has("protocol_number")
        ? field(formData, "protocol_number")
        : undefined,
    });
    revalidatePath("/inspections");
    redirectWithSuccess("/inspections", "Revizia bola aktualizovana.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri ukladani revizie.";
    redirectWithError("/inspections", message);
  }
}

export async function deleteInspectionAction(formData: FormData): Promise<void> {
  const inspectionId = field(formData, "inspection_id") ?? "";
  if (!inspectionId) redirectWithError("/inspections", "Chyba identifikator revizie.");

  try {
    await deleteInspection(inspectionId);
    revalidatePath("/inspections");
    redirectWithSuccess("/inspections", "Revizia bola vymazana.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri mazani revizie.";
    redirectWithError("/inspections", message);
  }
}


function redirectWithSuccess(path: string, message: string): never {
  const params = new URLSearchParams({ success: message });
  redirect(`${path}?${params.toString()}`);
}
