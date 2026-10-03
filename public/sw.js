// DentalHub service worker.
// 1) App shell cache so the PWA starts fast offline (metadata only, never file bytes).
// 2) Web Push: notifications carry no payload, so nothing sensitive is shown on a lock screen.

const SHELL = "dentalhub-shell-v1";
const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never cache: API calls, auth round-trips, signed file URLs, cross-origin.
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_serverFn") ||
    url.pathname.startsWith("/~oauth")
  ) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      return cached || caches.match("/");
    }),
  );
});

self.addEventListener("push", (event) => {
  // Deliberately generic: no file name, no sender, no patient data.
  let body = "Masz nowy plik w aplikacji.";
  try {
    if (event.data) {
      const t = event.data.text();
      if (t) body = t;
    }
  } catch (e) {
    // payload-less push is the normal case
  }
  event.waitUntil(
    self.registration.showNotification("DentalHub", {
      body,
      icon: "/icon-512.png",
      badge: "/icon-512.png",
      tag: "dentalhub-inbox",
      data: { url: "/inbox" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/inbox";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
