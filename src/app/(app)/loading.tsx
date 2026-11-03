export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Načítavam obsah…</span>
      <div className="animate-pulse space-y-2">
        <div className="h-3 w-20 rounded bg-gray-200" />
        <div className="h-8 w-64 max-w-full rounded bg-gray-200" />
        <div className="h-4 w-80 max-w-full rounded bg-gray-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl border border-gray-100 bg-gray-50" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2" aria-hidden="true">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="h-64 animate-pulse rounded-xl border border-gray-100 bg-gray-50" />
        ))}
      </div>
    </div>
  );
}
