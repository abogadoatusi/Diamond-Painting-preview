/* オフライン用サービスワーカー。
 * 方式は stale-while-revalidate: まずキャッシュを返し、裏で最新を取り直す。
 * 次に開いたときに新しい版が反映される。 */
var VERSION = 'v1';
var CACHE = 'diamond-art-maker-' + VERSION;
var ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/dmc.js', './js/color.js', './js/quantize.js',
  './js/render.js', './js/pdf.js', './js/app.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      });
    })
  );
});
