export default function Loading() {
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
      <div className="w-10 h-10 rounded-full border-2 border-gray-200 border-t-[#C62828] animate-spin" />
      <span className="sr-only">Načítavam…</span>
    </div>
  );
}
