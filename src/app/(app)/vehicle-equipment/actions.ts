"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addVehicleEquipment,
  updateVehicleEquipment,
  removeVehicleEquipment,
} from "@/lib/equipment/vehicles.service";

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

export async function addVehicleEquipmentAction(formData: FormData): Promise<void> {
  const vehicleId = field(formData, "vehicle_id") ?? "";
  const backPath = vehicleId ? `/vehicle-equipment?vehicle=${vehicleId}` : "/vehicle-equipment";
  const equipmentId = field(formData, "equipment_id") ?? "";
  if (!vehicleId || !equipmentId) {
    redirectWithError(backPath, "Vozidlo aj vybavenie su povinne.");
  }

  const quantityRaw = field(formData, "quantity");
  const quantity = quantityRaw ? Number(quantityRaw) : 1;

  try {
    await addVehicleEquipment({
      vehicle_id: vehicleId,
      equipment_id: equipmentId,
      quantity: Number.isFinite(quantity) ? quantity : 1,
      placement: field(formData, "placement"),
      notes: field(formData, "notes"),
    });
    revalidatePath("/vehicle-equipment");
    redirectWithSuccess(backPath, "Vybavenie bolo priradene k vozidlu.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri priradovani.";
    redirectWithError(backPath, message);
  }
}

export async function updateVehicleEquipmentAction(formData: FormData): Promise<void> {
  const rowId = field(formData, "row_id") ?? "";
  const vehicleId = field(formData, "vehicle_id") ?? "";
  const backPath = vehicleId ? `/vehicle-equipment?vehicle=${vehicleId}` : "/vehicle-equipment";
  if (!rowId) redirectWithError(backPath, "Chyba identifikator zaznamu.");

  const quantityRaw = field(formData, "quantity");

  try {
    await updateVehicleEquipment(rowId, {
      quantity: quantityRaw ? Number(quantityRaw) : undefined,
      placement: field(formData, "placement"),
      notes: field(formData, "notes"),
    });
    revalidatePath("/vehicle-equipment");
    redirectWithSuccess(backPath, "Zaznam bol ulozeny.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri ukladani.";
    redirectWithError(backPath, message);
  }
}

export async function removeVehicleEquipmentAction(formData: FormData): Promise<void> {
  const rowId = field(formData, "row_id") ?? "";
  const vehicleId = field(formData, "vehicle_id") ?? "";
  const backPath = vehicleId ? `/vehicle-equipment?vehicle=${vehicleId}` : "/vehicle-equipment";
  if (!rowId) redirectWithError(backPath, "Chyba identifikator zaznamu.");

  try {
    await removeVehicleEquipment(rowId);
    revalidatePath("/vehicle-equipment");
    redirectWithSuccess(backPath, "Vybavenie bolo odobrate z vozidla.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri odoberani.";
    redirectWithError(backPath, message);
  }
}
