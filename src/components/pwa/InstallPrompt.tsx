"use client";

import { useCallback, useEffect, useState } from "react";
import { useStandalone } from "@/hooks/useStandalone";

/**
 * Shape of the Chromium-specific `beforeinstallprompt` event.
 * Typed locally because the DOM lib does not declare this event.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "dhz_pwa_install_dismissed";

/** SSR-safe detection of iOS-family devices (iPhone / iPad / iPod). */
function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * InstallPrompt renders a single, non-blocking prompt:
 * - Chromium (Android/desktop): install card driven by `beforeinstallprompt`.
 * - iOS: short Slovak hint (Share -> Add to Home Screen).
 * - Standalone PWA: nothing is rendered.
 */
export function InstallPrompt() {
  const isStandalone = useStandalone();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);

  // Read browser-only state after mount, outside the synchronous effect body
  // (avoids SSR/hydration mismatch and the setState-in-effect lint error).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (localStorage.getItem(DISMISS_KEY) === "true") {
        setDismissed(true);
      }
      setIsIOS(isIOSDevice());
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  // Capture the Chromium install prompt (prevent the default mini-bar).
  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event): void => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleDismiss = useCallback((): void => {
    setDismissed(true);
    setDeferredPrompt(null);
    localStorage.setItem(DISMISS_KEY, "true");
  }, []);

  const handleInstall = useCallback(async (): Promise<void> => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      // Resolves once the user accepts or dismisses the native prompt.
      await deferredPrompt.userChoice;
    } finally {
      // Always clear the consumed event - it cannot be reused.
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  // Never show anything when already running as an installed PWA.
  if (isStandalone || dismissed) {
    return null;
  }

  // Chromium / Android / desktop Chrome - full install card.
  if (deferredPrompt) {
    return (
      <div
        role="dialog"
        aria-label="Nainštalovať aplikáciu"
        className="fixed bottom-20 left-4 right-4 z-50 mx-auto pointer-events-none lg:bottom-6"
      >
        <div className="pointer-events-auto max-w-md mx-auto bg-white border border-gray-200 rounded-2xl shadow-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-[#C62828] text-white flex items-center justify-center shrink-0">
              <span className="text-sm font-bold">DHZ</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">DHZ Ružindol</h3>
              <p className="text-xs text-gray-500">Nainštalovať aplikáciu</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Nainštalujte DHZ Digital OS pre rýchlejší prístup a offline použitie.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleInstall}
              className="flex-1 py-2.5 px-4 bg-[#C62828] text-white font-semibold rounded-xl hover:bg-[#8E0000] transition"
            >
              Nainštalovať
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="flex-1 py-2.5 px-4 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition"
            >
              Teraz nie
            </button>
          </div>
        </div>
      </div>
    );
  }

  // iOS / Safari - short hint (no install API available).
  if (isIOS) {
    return (
      <div
        role="status"
        aria-label="Ako pridať aplikáciu na plochu"
        className="fixed bottom-20 left-4 right-4 z-50 mx-auto pointer-events-none lg:bottom-6"
      >
        <div className="pointer-events-auto max-w-md mx-auto bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-[#C62828] text-white flex items-center justify-center shrink-0">
            <span className="text-[11px] font-bold">DHZ</span>
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-700">
              Aplikáciu môžete pridať na plochu cez <strong>Zdieľať → Pridať na plochu</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition"
            aria-label="Zavrieť"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // Desktop without a captured prompt - browser shows its own install affordance.
  return null;
}
