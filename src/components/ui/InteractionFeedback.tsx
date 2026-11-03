"use client";

import { useEffect } from "react";
import { triggerHapticFeedback } from "@/lib/utils/haptics";

const INTERACTIVE_SELECTOR = [
  "button:not(:disabled)",
  "a[href]",
  'input:not([type="hidden"]):not(:disabled)',
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "summary",
  '[role="button"]:not([aria-disabled="true"])',
  '[role="link"]:not([aria-disabled="true"])',
].join(", ");

export function InteractionFeedback() {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (event.target.closest(INTERACTIVE_SELECTOR)) {
        triggerHapticFeedback();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, []);

  return null;
}
