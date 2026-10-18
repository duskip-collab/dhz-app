"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createInventoryCheck,
  updateInventoryCheck,
  verifyInventoryItem,
  deleteInventoryCheck,
} from "@/lib/equipment/inventories.service";
import { InventoryCheckStatus } from "@/lib/equipment/inventories.validation";

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

export async function createInventoryCheckAction(formData: FormData): Promise<void> {
  const title = field(formData, "title") ?? "";
  if (!title) redirectWithError("/inventories", "Nazov kontroly je povinny.");

  try {
    const check = await createInventoryCheck({
      title,
      description: field(formData, "description"),
    });
    revalidatePath("/inventories");
    redirect(`/inventories/${check.id}`);
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri vytvarani kontroly.";
    redirectWithError("/inventories", message);
  }
}

export async function updateInventoryCheckAction(formData: FormData): Promise<void> {
  const checkId = field(formData, "check_id") ?? "";
  if (!checkId) redirectWithError("/inventories", "Chyba identifikator kontroly.");

  const statusRaw = field(formData, "status");
  const status = (InventoryCheckStatus as readonly string[]).includes(statusRaw ?? "")
    ? (statusRaw as (typeof InventoryCheckStatus)[number])
    : undefined;

  try {
    await updateInventoryCheck(checkId, { status });
    revalidatePath("/inventories");
    revalidatePath(`/inventories/${checkId}`);
    redirectWithSuccess(`/inventories/${checkId}`, "Stav kontroly bol zmeneny.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri ukladani kontroly.";
    redirectWithError(`/inventories/${checkId}`, message);
  }
}

export async function verifyInventoryItemAction(formData: FormData): Promise<void> {
  const checkId = field(formData, "check_id") ?? "";
  const equipmentId = field(formData, "equipment_id") ?? "";
  const foundRaw = field(formData, "found");
  if (!checkId || !equipmentId || (foundRaw !== "true" && foundRaw !== "false")) {
    redirectWithError(`/inventories/${checkId}`, "Vyplnte vysledok overenia.");
  }

  try {
    await verifyInventoryItem({
      check_id: checkId,
      equipment_id: equipmentId,
      found: foundRaw === "true",
      condition_found: field(formData, "condition_found"),
      notes: field(formData, "notes"),
    });
    revalidatePath(`/inventories/${checkId}`);
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri overovani polozky.";
    redirectWithError(`/inventories/${checkId}`, message);
  }
}

export async function deleteInventoryCheckAction(formData: FormData): Promise<void> {
  const checkId = field(formData, "check_id") ?? "";
  if (!checkId) redirectWithError("/inventories", "Chyba identifikator kontroly.");

  try {
    await deleteInventoryCheck(checkId);
    revalidatePath("/inventories");
    redirectWithSuccess("/inventories", "Kontrola bola vymazana.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri mazani kontroly.";
    redirectWithError("/inventories", message);
  }
}
