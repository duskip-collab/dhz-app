"use client";

import { useEffect, useState } from "react";

/**
 * Mount-gate komponent aj hook: server aj klient pri prvotnom renderi
 * produkujú NULOVÝ strom a skutočný stav siete sa číta až v `useEffect`
 * po hydratácii (K13.4.1/4.2: offline banner + `useOfflineStatus`).
 */

/**
 * Displays an offline indicator when the browser loses network connectivity.
 * Non-blocking: appears as a small, dismissible banner and does not interfere
 * with the main UI or business logic.
 *
 * HYDRATION (SSR): server aj klient musia pri prvotnom renderi vyprodukovat
 * ZHJODNY strom — `navigator.onLine` na serveri neexistuje. Komponent preto
 * do `useEffect` (po hydratacii) vykresli NIC a az potom synchronizuje
 * skutocny stav pripojenia. Ziadny layout mounting nie je potrebny.
 */
export function OfflineIndicator() {
  // SSR: vzdy false (server aj klient prvy render) → ziadny hydration mismatch.
  const [isClient, setIsClient] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    // RAF deferral — rovnaky vzor ako useSWController (mimo synchronickeho
    // effect body; setState len v callbacku, nie priamo v effecte).
    const frame = requestAnimationFrame(() => {
      setIsClient(true);
      setIsOffline(typeof navigator !== "undefined" ? !navigator.onLine : false);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!isClient) {
      return;
    }
    const handleOnline = (): void => {
      setIsOffline(false);
      setDismissed(false);
    };

    const handleOffline = (): void => {
      setIsOffline(true);
      setDismissed(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [isClient]);

  if (dismissed || !isOffline) {
    return null;
  }

  // Po hydratacii: banner len ked sme SKUTOCNE na kliente a offline.
  // (Pred isClient=true sa nikdy nerenderuje → SSR ≡ prvy klientsky render.)
  if (!isClient) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-0 left-0 right-0 z-50 mx-4 max-w-3xl mx-auto pointer-events-none"
    >
      <div className="pointer-events-auto flex items-center gap-3 px-4 py-3 bg-red-500/95 text-white rounded-t-2xl shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
        <svg
          className="w-5 h-5 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 0112.728 0M12 9v4m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z"
          />
        </svg>
        <p className="text-sm font-medium">
          Ste offline. Niektoré funkce nie sú dostupné.
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="ml-4 p-1 rounded hover:bg-white/20 transition"
          aria-label="Zavrieť oznam o offline režime"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * Provides offline status as a simple boolean value (non-UI hook).
 *
 * HYDRATION (SSR): prvy render vzdy `false` (server ≡ klient); skutocny
 * stav sa synchronizuje az v `useEffect` po hydratacii. Konzumenti teda
 * nikdy nedostanu server/klient mismatch v podmienkovom renderovani.
 */
export function useOfflineStatus(): boolean {
  const [isClient, setIsClient] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsClient(true);
      setIsOffline(typeof navigator !== "undefined" ? !navigator.onLine : false);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!isClient) {
      return;
    }

    const handleOnline = (): void => setIsOffline(false);
    const handleOffline = (): void => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [isClient]);

  return isOffline;
}
