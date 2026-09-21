// Stage 1: registration skeleton only. No fetch handler — this does not intercept or cache
// any requests, on purpose, so it can't cause stale-content bugs. Push handling (the actual
// point of having a service worker at all) comes in a later stage.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
