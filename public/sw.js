// DHZ Digital OS — PWA Service Worker (K13.4.1 v2)
// ============================================================================
// Stratégie podľa typu požiadavky:
//   * immutable statické assety (/_next/static)   → CACHE-FIRST
//   * jednoduché assety (ikony, manifest, favicon) → STALE-WHILE-REVALIDATE
//   * prevádzkové zoznamy (členia, technika, …)    → NETWORK-FIRST + offline cache
//   * auth, API, Supabase, financie, reporty       → NETWORK-ONLY (NIKDY cache)
//
// BEZPEČNOSŤ (K13.4.1):
//   * Trvalý offline cache obsahuje VÝHRADNE prevádzkové stránky
//     (members/training/…); ŽIADNE finančné údaje, žiadne reporty,
//     žiadne API/Supabase odpovede, žiadne auth tokeny.
//   * Cache `dhz-pages-v2` sa pri odhlásení maže na klientskej stránke
//     (`clearOfflinePagesCache()` v AppShell/UserMenu) — RLS dáta
//     nezostávajú na zdieľanom zariadení.
//   * Session/RLS: cache neobchádza autorizáciu — uložená HTML odpoveď
//     vznikla len pre prihláseného používateľa s príslušnými oprávneniami.

const STATIC_CACHE_NAME = "dhz-static-v2";
const PAGES_CACHE_NAME = "dhz-pages-v2";

// Pre-cache počas install (bezpečné, nemenné súbory).
const STATIC_CACHE_FILES = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/favicon.ico",
];

// Citlivé/dynamické cesty — VŽDY network-only, NIKDY cache.
const FORBIDDEN_PATHS = [
  "/auth",
  "/login",
  "/logout",
  "/signout",
  "/oauth",
  "/refresh",
  "/api/",
  "/rest/v1/",
  "/graphql/",
  "/functions/",
  "/supabase/",
  "/dashboard",
  "/finance",
  "/documents",
  "/reports",
  "/profile",
  "/settings",
  "/admin",
];

// Prevádzkové zoznamy — NETWORK-FIRST + offline cache (žiadne financie).
const PAGES_PATTERNS = [
  /^\/members(\/|$)/,
  /^\/training(\/|$)/,
  /^\/competitions(\/|$)/,
  /^\/calendar(\/|$)/,
  /^\/inventory(\/|$)/,
  /^\/inventories(\/|$)/,
  /^\/vehicles(\/|$)/,
  /^\/vehicle-equipment(\/|$)/,
  /^\/gear(\/|$)/,
];

// Nemenné assety (hashované build assety) — CACHE-FIRST.
const IMMUTABLE_STATIC_PATTERNS = [/^\/_next\/static\//];

// Jednoduché, zriedka meniace sa assety — STALE-WHILE-REVALIDATE.
const REVALIDATE_STATIC_PATTERNS = [
  /^\/icons\//,
  /\/manifest\.webmanifest$/,
  /\/favicon\.ico$/,
];

/** Check if a URL is cross-origin or has an unsafe protocol. */
function isCrossOrigin(url) {
  return url.origin !== self.location.origin || !url.protocol.startsWith("http");
}

/** Check if a path is forbidden (auth, API, finance, reports, user data). */
function isForbiddenPath(pathname) {
  return FORBIDDEN_PATHS.some((p) => pathname.includes(p));
}

/** Check if a navigation target is a cacheable operational list page. */
function isOperationalPage(pathname) {
  return PAGES_PATTERNS.some((pattern) => pattern.test(pathname));
}

/** Cache-first for immutable hashed assets. */
function isImmutableStatic(pathname) {
  return IMMUTABLE_STATIC_PATTERNS.some((pattern) => pattern.test(pathname));
}

/** Stale-while-revalidate for simple static assets. */
function isRevalidateStatic(pathname) {
  return REVALIDATE_STATIC_PATTERNS.some((pattern) => pattern.test(pathname));
}

/** Offline fallback response (text, nie HTML stránka). */
function offlineResponse() {
  return new Response("Offline", {
    status: 503,
    headers: { "Content-Type": "text/plain" },
  });
}

// Install: Cache pre-defined safe static files.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) =>
        cache.addAll(STATIC_CACHE_FILES).catch((err) => {
          console.warn("[SW] Some static cache files failed:", err);
        })
      )
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn("[SW] Install event failed:", err);
      })
  );
});

// Activate: Remove old DHZ caches (vrátane v1), preserve other apps' caches.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name.startsWith("dhz-"))
            .filter(
              (name) => name !== STATIC_CACHE_NAME && name !== PAGES_CACHE_NAME
            )
            .map((oldCache) => {
              console.log(`[SW] Deleting old cache: ${oldCache}`);
              return caches.delete(oldCache);
            })
        )
      )
      .then(() => self.clients.claim())
      .catch((err) => {
        console.warn("[SW] Activation failed:", err);
      })
  );
});

// Fetch: stratégia podľa typu požiadavky.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Only handle GET requests with safe protocols.
  if (request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // 2. Cross-origin (Supabase REST/auth, CDN): network-only, never cache.
  if (isCrossOrigin(url)) {
    event.respondWith(fetch(request).catch(() => offlineResponse()));
    return;
  }

  // 3. Forbidden paths (auth, API, financie, reporty, dashboard): network-only.
  if (isForbiddenPath(url.pathname)) {
    event.respondWith(fetch(request).catch(() => offlineResponse()));
    return;
  }

  // 4. Prevádzkové zoznamy (navigácie): NETWORK-FIRST + offline cache.
  //    Čerstvosť má prednosť; offline sa použije posledná uložená HTML verzia.
  if (request.mode === "navigate" && isOperationalPage(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Ukladaj len čisté, ne-presmerované 200 odpovede.
          if (response.ok && response.status === 200 && !response.redirected) {
            const clone = response.clone();
            caches.open(PAGES_CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || offlineResponse();
        })
    );
    return;
  }

  // 5. Immutable build assety: CACHE-FIRST (nemenné, hashované).
  if (isImmutableStatic(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((response) => {
          if (response.ok && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // 6. Jednoduché assety (ikony, manifest, favicon):
  //    STALE-WHILE-REVALIDATE — okamžitá odpoveď z cache + tichá obnova.
  if (isRevalidateStatic(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => null);
        return cached || (await network) || offlineResponse();
      })
    );
    return;
  }

  // 7. Všetko ostatné (RSC prefetches, ostatné HTML): network-only.
  event.respondWith(fetch(request).catch(() => offlineResponse()));
});



// ============================================================================
// PUSH NOTIFICATIONS (K13.4.2)
// ============================================================================
// Payload (JSON z Edge Function / cronu): { title, body, url, icon, tag }.
// Bezpečnosť: `url` MUSÍ byť relatívna cesta (začína "/", nie "//") —
// zrkadlí `parsePushPayload()` z src/hooks/push-utils.ts (SW nemôže importovať
// TS modul, logika sa udržiava zhodná; unit testy kryjú klientsku verziu).

function parsePushPayloadSafe(raw) {
  const fallback = {
    title: "DHZ Digital OS",
    body: "",
    url: null,
    icon: null,
    tag: null,
  };
  if (!raw) return fallback;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (typeof data !== "object" || data === null) return fallback;
  const str = (v) => (typeof v === "string" && v.length > 0 ? v : null);
  const safeUrl = (v) => {
    const s = str(v);
    return s !== null && s.startsWith("/") && !s.startsWith("//") ? s : null;
  };
  return {
    title: str(data.title) ?? fallback.title,
    body: str(data.body) ?? "",
    url: safeUrl(data.url),
    icon: safeUrl(data.icon),
    tag: str(data.tag),
  };
}

// Push: zobrazenie notifikácie (žiadne cacheovanie, žiadny fetch navyše).
self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = parsePushPayloadSafe(event.data ? event.data.text() : null);
  } catch {
    payload = parsePushPayloadSafe(null);
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag || undefined,
      data: { url: payload.url || "/dashboard" },
    })
  );
});

// Notificationclick: focus otvoreného okna alebo otvorenie cieľovej route.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (() => {
    const u = event.notification.data && event.notification.data.url;
    return typeof u === "string" && u.startsWith("/") && !u.startsWith("//")
      ? u
      : "/dashboard";
  })();

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // 1) Nájsť už otvorené okno tejto aplikácie a prepnúť naň.
        for (const client of clientList) {
          if ("focus" in client) {
            void client.focus();
            if ("navigate" in client) {
              void client.navigate(targetUrl);
              return undefined;
            }
            return undefined;
          }
        }
        // 2) Žiadne okno — otvoriť nové s cieľovou route.
        return self.clients.openWindow(targetUrl);
      })
  );
});

