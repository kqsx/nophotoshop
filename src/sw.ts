/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Web Share Target: nhận ảnh từ app khác (Android), lưu tạm rồi mở app.
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith((async () => {
      const form = await event.request.formData();
      const cache = await caches.open('nps-share-target');
      let i = 0;
      for (const f of form.getAll('images')) {
        if (f instanceof File && f.type.startsWith('image/')) {
          await cache.put(`/shared/${Date.now()}-${i++}/${encodeURIComponent(f.name || 'anh.jpg')}`, new Response(f, { headers: { 'content-type': f.type } }));
        }
      }
      return Response.redirect('/?shared=1', 303);
    })());
  }
});

// SPA: mọi điều hướng trả index.html (trừ /api)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

// LUT tĩnh + LUT admin: cache lâu, dùng offline
registerRoute(({ url }) => url.pathname.startsWith('/luts/') && url.pathname.endsWith('.cube'), new CacheFirst({ cacheName: 'nps-luts', plugins: [new ExpirationPlugin({ maxEntries: 120 })] }));
registerRoute(({ url }) => url.pathname === '/api/luts' && url.searchParams.has('file'), new CacheFirst({ cacheName: 'nps-luts-admin', plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 30 * 86400 })] }));
registerRoute(({ url }) => url.pathname === '/api/luts' || url.pathname === '/luts/luts.json' || url.pathname === '/api/admin/config', new NetworkFirst({ cacheName: 'nps-meta', networkTimeoutSeconds: 4 }), 'GET');
registerRoute(({ request }) => request.destination === 'font', new CacheFirst({ cacheName: 'nps-fonts', plugins: [new ExpirationPlugin({ maxEntries: 60 })] }));
registerRoute(({ url }) => url.pathname.startsWith('/models/'), new CacheFirst({ cacheName: 'nps-models' }));
registerRoute(({ request }) => request.destination === 'image' && !request.url.includes('/api/'), new StaleWhileRevalidate({ cacheName: 'nps-img' }));
