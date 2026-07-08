self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {
      title: 'Glowth reminder',
      body: event.data ? event.data.text() : 'Routine ka time ho gaya.'
    };
  }

  const title = data.title || 'Glowth reminder';
  const options = {
    body: data.body || 'Routine ka time ho gaya. Skin ko ghost mat karo.',
    icon: data.icon || '/assests/logo.png',
    badge: data.badge || '/assests/logo.png',
    tag: data.tag || `glowth-${data.type || 'reminder'}`,
    renotify: true,
    data: {
      url: data.url || '/dashboard/routine.html',
      type: data.type || 'reminder'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard/routine.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((client) => client.url.includes(url));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});