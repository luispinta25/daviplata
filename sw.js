const CACHE_NAME = 'daviplata-v2.1.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/supabase.js',
  './js/upload.js',
  './js/movements.js',
  './js/pdf.js',
  './js/app.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://i.ibb.co/FLFGvTNp/DAVIPLATALOGO.png'
];

/**
 * Estrategia Network First: Intenta red por defecto, cae en cache si falla.
 * Esto obliga a que la PWA use la versión más reciente si hay internet.
 */
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones a Supabase y Webhooks para no cachear datos dinámicos ni auth
  if (
    event.request.url.includes('supabase.co') || 
    event.request.url.includes('luispintasolutions.com/webhook')
  ) {
    return;
  }

  // Ignorar métodos que no sean GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clonar la respuesta y guardarla en cache si es válida
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // Si la red falla, intentar desde el cache
        return caches.match(event.request);
      })
  );
});

// Instalación: Cachear recursos iniciales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Cacheando recursos esenciales v2.1.0');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activación: Limpiar caches antiguos e invalidar versiones previas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('SW: Invalidando cache anterior:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});
