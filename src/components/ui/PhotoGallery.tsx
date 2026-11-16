"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";

export interface PhotoGalleryPhoto {
  src: string;
  alt: string;
}

function PhotoThumbnail({
  photo,
  index,
  onClick,
}: {
  photo: PhotoGalleryPhoto;
  index: number;
  onClick: (button: HTMLButtonElement) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <button
      type="button"
      aria-label={`Zobraziť fotografiu ${index + 1}`}
      onClick={(event) => onClick(event.currentTarget)}
      className="group relative aspect-square w-full overflow-hidden rounded-xl bg-gray-100 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#C62828] focus-visible:ring-offset-2"
    >
      {!loaded && !failed ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-gray-200"
        />
      ) : null}
      {failed ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-gray-500">
          <ImageOff className="h-6 w-6" aria-hidden="true" />
          Fotografia nie je dostupná
        </span>
      ) : (
        // Signed Supabase URLs are private and short-lived; use a native image instead of Next image optimization.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.src}
          alt={photo.alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover transition duration-200 group-hover:scale-105 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </button>
  );
}

function ViewerPhoto({
  photo,
  onSwipe,
}: {
  photo: PhotoGalleryPhoto;
  onSwipe: (distance: number) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const touchStartX = useRef<number | null>(null);

  return (
    <div
      className="relative flex min-h-0 flex-1 items-center justify-center"
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const startX = touchStartX.current;
        const endX = event.changedTouches[0]?.clientX;
        touchStartX.current = null;
        if (startX !== null && endX !== undefined) onSwipe(endX - startX);
      }}
    >
      {!loaded && !failed ? (
        <span className="absolute animate-pulse text-sm text-white/70" role="status">
          Načítava sa fotografia…
        </span>
      ) : null}
      {failed ? (
        <p className="flex items-center gap-2 text-sm text-white/80" role="alert">
          <ImageOff className="h-5 w-5" aria-hidden="true" />
          Fotografia sa nepodarila načítať.
        </p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.src}
          alt={photo.alt}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`max-h-full max-w-full object-contain transition-opacity ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}

export function PhotoGallery({
  photos,
  title = "Fotografie",
  emptyMessage = "Fotografie nie sú k dispozícii.",
}: {
  photos: PhotoGalleryPhoto[];
  title?: string;
  emptyMessage?: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const headingId = useId();
  const isViewerOpen = activeIndex !== null;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!isViewerOpen) {
      if (dialog.open) dialog.close();
      return;
    }

    if (!dialog.open) dialog.showModal();
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [isViewerOpen]);

  function closeViewer() {
    setActiveIndex(null);
  }

  function moveViewer(direction: -1 | 1) {
    if (photos.length < 2 || activeIndex === null) return;
    setActiveIndex((activeIndex + direction + photos.length) % photos.length);
  }

  const activePhoto = activeIndex === null ? null : photos[activeIndex];

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-3 text-base font-bold text-gray-900">
        {title}
      </h2>
      {photos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
          {emptyMessage}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo, index) => (
            <li key={`${photo.src}:${index}`} className="min-w-0">
              <PhotoThumbnail
                photo={photo}
                index={index}
                onClick={(button) => {
                  triggerRef.current = button;
                  setActiveIndex(index);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        aria-label={`${title} – prehliadač`}
        aria-modal="true"
        tabIndex={-1}
        onCancel={(event) => {
          event.preventDefault();
          closeViewer();
        }}
        onClose={() => setActiveIndex(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeViewer();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            moveViewer(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            moveViewer(1);
          }
        }}
        className="fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none flex-col border-0 bg-black/95 p-4 text-white backdrop:bg-black/95 open:flex"
      >
        {activePhoto ? (
          <>
            <div className="flex min-h-11 items-center justify-between gap-4">
              <p className="text-sm text-white/80" aria-live="polite">
                {(activeIndex ?? 0) + 1} / {photos.length}
              </p>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Zavrieť prehliadač fotografií"
                onClick={closeViewer}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                <X className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center gap-2 sm:gap-4">
              {photos.length > 1 ? (
                <button
                  type="button"
                  aria-label="Predchádzajúca fotografia"
                  onClick={() => moveViewer(-1)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                >
                  <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                </button>
              ) : null}
              <ViewerPhoto
                key={activePhoto.src}
                photo={activePhoto}
                onSwipe={(distance) => {
                  if (distance > 50) moveViewer(-1);
                  else if (distance < -50) moveViewer(1);
                }}
              />
              {photos.length > 1 ? (
                <button
                  type="button"
                  aria-label="Nasledujúca fotografia"
                  onClick={() => moveViewer(1)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                >
                  <ChevronRight className="h-6 w-6" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </dialog>
    </section>
  );
}
