// Offline pages cache helper (K13.4.1)
// ============================================================================
// Cache `dhz-pages-v2` (public/sw.js) ukladá HTML prevádzkových zoznamov
// (members, training, …) pre offline režim. Keďže obsahuje RLS chránené
// dáta prihláseného používateľa, MUSÍ sa vymazať pri odhlásení — inak by
// zostali na zdieľanom zariadení dostupné bez autorizácie.

/** Názov cache s offline prevádzkovými stránkami — MUSÍ sedieť s sw.js. */
export const OFFLINE_PAGES_CACHE_NAME = "dhz-pages-v2";

/**
 * Vymaže offline cache prevádzkových stránok. Bezpečné v SSR (nič nerobí)
 * a tiché pri chybe (odhlásenie nesmie zlyhať kôli cache).
 */
export async function clearOfflinePagesCache(): Promise<void> {
  if (typeof caches === "undefined") {
    return;
  }
  try {
    await caches.delete(OFFLINE_PAGES_CACHE_NAME);
  } catch {
    // Cache API nemusí byť dostupné (private mode) — ignorovať.
  }
}
