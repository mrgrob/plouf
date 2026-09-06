/* Service worker de Ploufplouf.
   Deux principes, et pas un de plus :
   - la coquille (HTML, icônes) est mise en cache pour que l'application
     s'ouvre sans réseau ;
   - les appels à l'API météo ne sont JAMAIS interceptés. Le cache métier,
     c'est localStorage, dans la page. Deux couches de cache sur la même
     donnée, ce sont deux vérités et un bug impossible à reproduire. */

var VERSION = '1.2.0';
var CACHE = 'plouf-coquille-v' + VERSION;
var COQUILLE = ['./', './index.html', './manifest.webmanifest', './icone.svg', './icone-192.png', './icone-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(COQUILLE.map(function (u) {
      return c.add(u).catch(function () { /* un fichier absent ne doit pas faire échouer l'installation */ });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (noms) {
    return Promise.all(noms.map(function (n) { return n === CACHE ? null : caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.indexOf('open-meteo.com') >= 0) return;   // l'API passe toujours par le réseau
  if (url.origin !== self.location.origin) return;

  var estPage = e.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  if (estPage) {
    // Réseau d'abord, cache au bout de 2,5 s : on ne veut jamais servir une
    // version périmée de la page si le réseau répond.
    e.respondWith(Promise.race([
      fetch(e.request).then(function (r) {
        var copie = r.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copie); });
        return r;
      }),
      new Promise(function (res) {
        setTimeout(function () { caches.match(e.request).then(function (r) { if (r) res(r); }); }, 2500);
      })
    ]).catch(function () {
      return caches.match(e.request).then(function (r) { return r || caches.match('./index.html'); });
    }));
    return;
  }
  e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request); }));
});
