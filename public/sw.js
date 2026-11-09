/* Meu Financeiro — aplicativo instalável.
 * Armazena somente esta tela estática de aviso offline.
 * Nunca armazena autenticação, contas, movimentações nem respostas Supabase.
 */
const CACHE_NAME = 'meu-financeiro-offline-v1';
const OFFLINE_PAGE = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_PAGE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('meu-financeiro-offline-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' ||
      url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(OFFLINE_PAGE)) ||
        new Response('Sem conexão', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
    })
  );
});
