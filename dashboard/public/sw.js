// Bump this whenever the shell/UI changes so activate wipes stale caches.
const CACHE_NAME = "screentime-shell-v5";

self.addEventListener("install", () => {
  // Activate immediately on install — don't wait for all tabs to close.
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("push", (event) => {
  let payload = { title: "ScreenTime", body: "" };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    // non-JSON push payload — fall back to the default above
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow("/");
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept API — always network, never cache.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // App shell / HTML: network-first so new deploys appear right away.
  const isNavigation =
    req.mode === "navigate" ||
    url.pathname === "/" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isNavigation) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Static assets (hashed JS/CSS, icons): stale-while-revalidate.
  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request, { cache: "no-store" });
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await cache.match("/");
    if (fallback) return fallback;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Refresh cache in the background; return cached copy immediately.
    networkPromise.catch(() => {});
    return cached;
  }

  const fresh = await networkPromise;
  if (fresh) return fresh;
  return new Response("Offline", { status: 503, statusText: "Offline" });
}
