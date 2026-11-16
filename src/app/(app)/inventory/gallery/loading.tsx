export default function InventoryGalleryLoading() {
  return (
    <section aria-label="Načítava sa galéria skladových položiek" aria-busy="true" className="space-y-6">
      <div className="h-5 w-56 animate-pulse rounded bg-gray-200" />
      <div className="h-10 w-72 animate-pulse rounded bg-gray-200" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="space-y-2 rounded-xl border border-gray-200 p-2">
            <div className="aspect-square animate-pulse rounded-lg bg-gray-200" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </section>
  );
}
