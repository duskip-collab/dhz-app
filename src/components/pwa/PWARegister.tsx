"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker and handles registration errors gracefully.
 * Non-blocking: does not block page rendering or affect the main UI flow.
 */
export function PWARegister() {
  useEffect(() => {
    // Guard against SSR and non-secure contexts (file:// – localhost is OK).
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator) ||
      !window.location.protocol.startsWith("http")
    ) {
      return;
    }

    const registerSW = async (): Promise<void> => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        const installing = registration.installing;
        if (installing) {
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && registration.waiting) {
              // SW is installed and waiting to activate.
            }
          });
        }

        registration.addEventListener("updatefound", () => {
          console.log("[SW] Update found, new SW installing...");
        });

        registration.onupdatefound = (): void => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && !navigator.serviceWorker.controller) {
                console.log("[SW] New content is available, reload needed.");
              }
            });
          }
        };
      } catch (err) {
        console.warn("[SW] Registration failed:", err);
      }
    };

    void registerSW();

    // Re-check registration when the page regains focus.
    window.addEventListener("focus", registerSW);

    return () => {
      window.removeEventListener("focus", registerSW);
    };
  }, []);

  return null; // No UI rendered, registration happens in background.
}

/**
 * Checks if the service worker is currently controlling the page.
 * Initial value is read SSR-safely; updates come from `controllerchange`.
 */
export function useSWController(): boolean {
  const [controller, setController] = useState<boolean>(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return false;
    }
    return Boolean(navigator.serviceWorker.controller);
  });

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // setState only inside this callback (never synchronously in the effect body).
    const sync = (): void => {
      setController(Boolean(navigator.serviceWorker.controller));
    };

    navigator.serviceWorker.addEventListener("controllerchange", sync);

    // Sync once after the first frame, outside the synchronous effect body.
    const frame = requestAnimationFrame(sync);

    return () => {
      cancelAnimationFrame(frame);
      navigator.serviceWorker.removeEventListener("controllerchange", sync);
    };
  }, []);

  return controller;
}
