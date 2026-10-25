"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  assignResponsibleMember,
  getVehicles,
  removeResponsibleMember,
} from "@/lib/equipment/vehicles.service";

function redirectWithError(path: string, message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`${path}?${params.toString()}`);
}

function redirectWithSuccess(path: string, message: string): never {
  const params = new URLSearchParams({ success: message });
  redirect(`${path}?${params.toString()}`);
}

function field(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length === 0 ? null : s;
}

export async function refreshVehiclesAction(): Promise<void> {
  try {
    await getVehicles();
    revalidatePath("/vehicles");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri nacitavani vozidiel.";
    redirectWithError("/vehicles", message);
  }
}

export async function assignResponsibleMemberAction(formData: FormData): Promise<void> {
  const vehicleId = field(formData, "vehicle_id");
  const memberId = field(formData, "member_id");
  const role = field(formData, "role") ?? "MAINTENANCE";

  if (!vehicleId || !memberId) {
    redirectWithError(`/vehicles/${vehicleId ?? ""}`, "Vyberte člena a vozidlo.");
  }

  try {
    await assignResponsibleMember({
      vehicle_id: vehicleId,
      member_id: memberId,
      role,
      note: field(formData, "note"),
    });
    revalidatePath(`/vehicles/${vehicleId}`);
    revalidatePath("/vehicles");
    redirectWithSuccess(`/vehicles/${vehicleId}`, "Zodpovedná osoba bola priradená.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri priradení osoby.";
    redirectWithError(`/vehicles/${vehicleId}`, message);
  }
}

export async function removeResponsibleMemberAction(formData: FormData): Promise<void> {
  const responsibilityId = field(formData, "responsibility_id");
  const vehicleId = field(formData, "vehicle_id");

  if (!responsibilityId) {
    redirectWithError(`/vehicles/${vehicleId ?? ""}`, "Chýba identifikátor priradenia.");
  }

  try {
    await removeResponsibleMember(responsibilityId);
    revalidatePath(`/vehicles/${vehicleId ?? ""}`);
    revalidatePath("/vehicles");
    if (vehicleId) redirectWithSuccess(`/vehicles/${vehicleId}`, "Osoba bola odobratá.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri odobratí osoby.";
    redirectWithError(`/vehicles/${vehicleId ?? ""}`, message);
  }
}
