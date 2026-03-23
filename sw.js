/* ═══════════════════════════════════════════════════════════════
   DaviPlata Service Worker  v3.0.0
   Estrategia: Network First con timeout + fallback a cache
   ─────────────────────────────────────────────────────────────
   Cambios v3.0.0
   • Network First con timeout de 4 s para todos los assets propios
   • Stale-While-Revalidate para dependencias CDN (lectura rápida)
   • Exclusión explícita de Supabase, webhooks, chrome-extension
   • postMessage 'SW_UPDATED' a todos los clientes al activar
   • skipWaiting inmediato → clientes controlados de inmediato
   ═══════════════════════════════════════════════════════════════ */

const CACHE_VERSION  = 'v3.0.0';
const CACHE_APP      = `daviplata-app-${CACHE_VERSION}`;
const CACHE_CDN      = `daviplata-cdn-${CACHE_VERSION}`;
const NETWORK_TIMEOUT_MS = 4000;

/* Assets propios a pre-cachear en install */
const APP_ASSETS = [
  './',
  './index.html',
  './mobile.html',
  './desktop.html',
  './manifest.json',
  './css/styles.css',
  './js/config.js',
  './js/supabase.js',
  './js/upload.js',
  './js/movements.js',
  './js/pdf.js',
  './js/app.js',
  './js/redirect.js',
];

/* CDN assets a cachear on-the-fly con stale-while-revalidate */
const CDN_ORIGINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'i.ibb.co',
];

/* Requests que NUNCA se cachean */
const BYPASS_PATTERNS = [
  /supabase\.co/,
  /luispintasolutions\.com\/webhook/,
  /chrome-extension/,
];

/* ── Helpers ──────────────────────────────────────────────── */

function isBypassed(url) {
  return BYPASS_PATTERNS.some(p => p.test(url));
}

function isCdnRequest(url) {
  return CDN_ORIGINS.some(origin => url.includes(origin));
}

/** Race fetch vs timeout; rechaza si la red tarda más de ms */
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SW timeout')), ms);
    fetch(request).then(
      res  => { clearTimeout(timer); resolve(res); },
      err  => { clearTimeout(timer); reject(err);  }
    );
  });
}

/** Guarda en cache solo respuestas válidas (2xx, opaque) */
async function cacheResponse(cacheName, request, response) {
  if (!response) return;
  if (response.status === 200 || response.type === 'opaque') {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
}

/* ── INSTALL: pre-cache app shell ─────────────────────────── */
self.addEventListener('install', event => {
  console.log(`[SW ${CACHE_VERSION}] install`);
  event.waitUntil(
    caches.open(CACHE_APP).then(cache => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting(); // toma control inmediatamente
});

/* ── ACTIVATE: purge caches viejos + notificar clientes ───── */
self.addEventListener('activate', event => {
  console.log(`[SW ${CACHE_VERSION}] activate`);
  event.waitUntil(
    caches.keys().then(async keys => {
      await Promise.all(
        keys
          .filter(k => k !== CACHE_APP && k !== CACHE_CDN)
          .map(k => { console.log('[SW] Eliminando cache obsoleto:', k); return caches.delete(k); })
      );
      // Tomar control de todos los clientes sin esperar reload
      await self.clients.claim();
      // Avisar a todos los clientes que hay una nueva versión activa
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }));
    })
  );
});

/* ── FETCH ────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  // Ignorar no-GET y requests excluidos
  if (request.method !== 'GET' || isBypassed(url)) return;

  if (isCdnRequest(url)) {
    // ── CDN: Stale-While-Revalidate ──────────────────────────
    // Devuelve cache inmediatamente (si existe) y actualiza en background
    event.respondWith(
      caches.open(CACHE_CDN).then(async cache => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request).then(response => {
          cacheResponse(CACHE_CDN, request, response);
          return response;
        }).catch(() => null);
        return cached || fetchPromise;
      })
    );
  } else {
    // ── App shell / assets propios: Network First con timeout ─
    event.respondWith(
      fetchWithTimeout(request, NETWORK_TIMEOUT_MS)
        .then(response => {
          // Actualizar cache con respuesta fresca
          cacheResponse(CACHE_APP, request, response);
          return response;
        })
        .catch(async () => {
          // Red no disponible o timeout → servir desde cache
          const cached = await caches.match(request);
          if (cached) return cached;
          // Último recurso: index.html para rutas SPA
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        })
    );
  }
});
