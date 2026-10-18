"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getVehicles } from "@/lib/equipment/vehicles.service";

function redirectWithError(path: string, message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`${path}?${params.toString()}`);
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
