// No fetch handler — this does not intercept or cache any requests, on purpose, so it can't
// cause stale-content bugs. It only exists to receive push events and show notifications.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Golf Card Game', body: 'Something happened in your game.' };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    // Malformed/non-JSON payload — fall back to the generic message above rather than fail silently.
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'golf-notification',
      });
      // No count argument — renders as a plain dot/circle rather than a number. Requires
      // notification permission to already be granted (it silently no-ops otherwise), which is
      // exactly the case whenever we get this far anyway. Supported on iOS 16.4+ for a PWA
      // installed to the home screen; harmlessly does nothing on platforms that don't support it.
      if ('setAppBadge' in navigator) {
        try {
          await navigator.setAppBadge();
        } catch {
          // Not fatal — the notification itself already went out above.
        }
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    }),
  );
});
