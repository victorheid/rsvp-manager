// Service worker for web push (§9). Kept deliberately tiny: it shows what the
// server sent and opens the right page when it's tapped. No offline caching.

self.addEventListener("push", (event) => {
  const message = event.data ? event.data.json() : null;

  if (!message) {
    return;
  }

  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      data: { url: message.url },
      icon: "/favicon.ico",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          return client.navigate(url).then((navigated) => (navigated ?? client).focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
