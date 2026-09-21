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
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'golf-notification',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    }),
  );
});
