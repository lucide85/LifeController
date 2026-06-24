// Minimal service worker — present only so the browser treats LifeController as an
// installable PWA (which is what unlocks "Share → LifeController" via the Web Share
// Target). It intentionally does NOT cache anything; offline support is a later phase.
// The fetch handler is a no-op pass-through so every request behaves exactly as if no
// service worker were installed.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // no-op: do not call event.respondWith(), so the browser handles requests normally.
});
