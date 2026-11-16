"use client";

import Link from "next/link";
import { ImageOff } from "lucide-react";
import { useState } from "react";

export interface InventoryPhotoGalleryEntry {
  equipmentId: string;
  name: string;
  categoryName: string;
  photos: string[];
}

export function InventoryPhotoGrid({
  items,
}: {
  items: InventoryPhotoGalleryEntry[];
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.flatMap((item) =>
        item.photos.map((src, index) => (
          <InventoryPhotoCard
            key={`${item.equipmentId}:${index}:${src}`}
            item={item}
            src={src}
            photoNumber={index + 1}
          />
        ))
      )}
    </ul>
  );
}

function InventoryPhotoCard({
  item,
  src,
  photoNumber,
}: {
  item: InventoryPhotoGalleryEntry;
  src: string;
  photoNumber: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <li className="min-w-0">
      <Link
        href={`/inventory/${item.equipmentId}`}
        aria-label={`Otvoriť detail položky ${item.name}, fotografia ${photoNumber}`}
        className="group block rounded-xl border border-gray-200 bg-white p-2 shadow-sm outline-none transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#C62828] focus-visible:ring-offset-2"
      >
        <span className="relative block aspect-square overflow-hidden rounded-lg bg-gray-100">
          {!loaded && !failed ? (
            <span className="absolute inset-0 animate-pulse bg-gray-200" aria-hidden="true" />
          ) : null}
          {failed ? (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-center text-xs text-gray-500">
              <ImageOff className="h-6 w-6" aria-hidden="true" />
              Fotografia nie je dostupná
            </span>
          ) : (
            // Signed Supabase URLs are private and short-lived; use a native image instead of Next image optimization.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={`${item.name}, fotografia ${photoNumber}`}
              loading="lazy"
              decoding="async"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className={`h-full w-full object-cover transition duration-200 group-hover:scale-105 ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
        </span>
        <span className="mt-2 block truncate text-sm font-semibold text-gray-900">
          {item.name}
        </span>
        <span className="block truncate text-xs text-gray-500">{item.categoryName}</span>
      </Link>
    </li>
  );
}
