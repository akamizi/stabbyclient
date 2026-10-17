// Caches the app shell only. Requests outside /app/ (/api/, /oauth/, the instance's
// own pages) are never touched. Network first, so an update reaches the device on
// the next online load (files are revalidated, never served from the browser's own
// HTTP cache); the cache is the offline fallback.
const CACHE = "xenoclient-v2";
const PRECACHE = [
  "/app/",
  "/app/index.html",
  "/app/manifest.webmanifest",
  "/app/css/app.css",
  "/app/icons/icon-192.png",
  "/app/icons/icon-512.png",
  "/app/js/api.js",
  "/app/js/app.js",
  "/app/js/auth.js",
  "/app/js/cache.js",
  "/app/js/composer.js",
  "/app/js/config.js",
  "/app/js/i18n.js",
  "/app/js/locales/en.js",
  "/app/js/locales/it.js",
  "/app/js/me.js",
  "/app/js/notifications-view.js",
  "/app/js/notifications.js",
  "/app/js/sanitize.js",
  "/app/js/status-card.js",
  "/app/js/session-expiry.js",
  "/app/js/statuses.js",
  "/app/js/theme.js",
  "/app/js/thread-view.js",
  "/app/js/more.js",
  "/app/js/diagnostics.js",
  "/app/js/profile.js",
  "/app/js/quote.js",
  "/app/js/lightbox.js",
  "/app/js/markers.js",
  "/app/js/emoji-panel.js",
  "/app/js/rich-editor.js",
  "/app/js/modal.js",
  "/app/js/emoji-text.js",
  "/app/js/tabs.js",
  "/app/js/card-swap.js",
  "/app/js/announcements.js",
  "/app/js/emoji-picker.js",
  "/app/js/inline-form.js",
  "/app/js/thread.js",
  "/app/js/timeline.js",
  "/app/js/toast.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/app/")) return;
  event.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === "navigate" ? caches.match("/app/index.html") : Response.error())),
  );
});
