/* ── sw.js — Service Worker de Armonía de Color ──
   Estrategia:
   - Navegación / HTML  → network-first (los usuarios online siempre ven la última versión;
                          offline cae al index.html cacheado). Evita la "app vieja pegada".
   - Estáticos same-origin (iconos, splash, manifest) → stale-while-revalidate (rápido + se refresca).
   - Cross-origin (Google Fonts, etc.) → se deja pasar a la red (no se cachea aquí).

   Sube CACHE_VERSION en cada deploy para invalidar lo viejo.
*/
'use strict';

var CACHE_VERSION = 'ac-v11.2.24';
var CACHE_NAME    = 'armonia-' + CACHE_VERSION;

/* App shell mínimo a pre-cachear (rutas relativas al scope ./). */
var PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      /* addAll falla si UNA sola petición falla; usamos add individual tolerante */
      return Promise.all(PRECACHE.map(function (url) {
        return cache.add(url).catch(function () { /* recurso opcional, ignora */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_NAME) return caches.delete(k); /* limpia versiones viejas */
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;

  /* Cross-origin (fuentes, etc.): dejar pasar a la red sin interferir. */
  if (!sameOrigin) return;

  /* Navegación / documento HTML → network-first. */
  var isHTML = req.mode === 'navigate' ||
               (req.headers.get('accept') || '').indexOf('text/html') !== -1;

  if (isHTML) {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (r) {
          return r || caches.match('./');
        });
      })
    );
    return;
  }

  /* Estáticos same-origin → stale-while-revalidate. */
  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
