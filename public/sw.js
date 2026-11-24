const CACHE_NAME = "flipdoc-static-v1";
const PRECACHE_URLS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/pdf.worker.min.mjs",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache dynamic API or auth routes
  if (url.pathname.startsWith("/api/")) return;

  // Cache-first for static PDF worker, cmaps, and icons
  if (
    url.pathname === "/pdf.worker.min.mjs" ||
    url.pathname.startsWith("/cmaps/") ||
    url.pathname.startsWith("/standard_fonts/") ||
    url.pathname.startsWith("/icon-")
  ) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return res;
          })
      )
    );
  }
});
