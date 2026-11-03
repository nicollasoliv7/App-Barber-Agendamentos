// Service Worker do Agendou — recebe push e abre /painel/agenda ao clicar.
// Escopo raiz (/sw.js) para cobrir todo o domínio.

self.addEventListener('push', (event) => {
  let title = 'Agendou';
  let body = '';
  let url = '/painel/agenda';

  let tag = 'agendou-aviso';
  try {
    const data = event.data?.json();
    if (data?.title) title = data.title;
    if (data?.body) body = data.body;
    if (data?.url) url = data.url;
    tag = 'agendamento-' + (data?.agendamentoId ?? 'geral') + '-' + (data?.tipo ?? 'aviso');
  } catch {
    body = event.data?.text() ?? '';
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag,
      renotify: true,
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? '/painel/agenda';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return clients.openWindow(targetUrl);
      })
  );
});
