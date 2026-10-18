import { useEffect, useState } from "react";

/**
 * Detects if the app is running in standalone mode (PWA installed on home screen).
 * - Desktop: window.matchMedia('(display-mode: standalone)').matches
 * - iOS: navigator.standalone (if available)
 */
export function useStandalone(): boolean {
  const [isStandalone, setIsStandalone] = useState<boolean>(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const check = (): void => {
      const standalone =
        mediaQuery.matches ||
        ((navigator as Navigator & { standalone?: boolean })?.standalone ?? false);
      setIsStandalone(Boolean(standalone));
    };

    // Initial check
    check();

    // Listen for changes
    mediaQuery.addEventListener("change", check);
    window.addEventListener("storage", check);

    return () => {
      mediaQuery.removeEventListener("change", check);
      window.removeEventListener("storage", check);
    };
  }, []);

  return isStandalone;
}

/**
 * Checks if the app is running in standalone mode (non-react helper).
 */
export function isStandaloneMode(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ((navigator as Navigator & { standalone?: boolean })?.standalone ?? false)
  );
}
