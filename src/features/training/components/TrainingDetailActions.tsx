"use client";
import { useRouter } from "next/navigation";
import { deleteTrainingAction } from "@/app/(app)/training/actions";

export function TrainingDetailActions({ id }: { id: string }) {
  const router = useRouter();
  async function handleDelete() {
    if (!window.confirm("Naozaj vymazať tento tréning?")) return;
    await deleteTrainingAction(id);
    router.push("/training");
    router.refresh();
  }
  return (
    <div className="flex gap-2">
      <button onClick={handleDelete} className="px-3 py-1 bg-red-600 text-white rounded">Vymazať</button>
    </div>
  );
}
