import { Inbox } from "lucide-react";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
        <Inbox className="w-6 h-6 text-gray-400" />
      </div>
      <p className="font-semibold text-gray-900">{title}</p>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-sm">{description}</p>}
    </div>
  );
}

export function LoadingState({ label = "Načítavam…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-10" role="status" aria-live="polite">
      <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-[#C62828] animate-spin" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
