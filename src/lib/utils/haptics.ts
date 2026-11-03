export function triggerHapticFeedback(duration = 10): void {
  if (typeof window === "undefined" || !("vibrate" in navigator)) {
    return;
  }

  try {
    navigator.vibrate(duration);
  } catch {
    // Vibration can be unavailable or blocked by the browser at runtime.
  }
}
