// 앱 파일은 네트워크 우선(업데이트 바로 반영), 오프라인이면 캐시 사용.
// 앨범 아트·폰트는 캐시 우선.
const VERSION = 'v7';
const APP = `kono-app-${VERSION}`;
const MEDIA = 'kono-media';
const SHELL = ['./', 'index.html', 'config.js', 'styles.css', 'app.js', 'data/songs.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('kono-app-') && k !== APP).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(APP).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
    );
    return;
  }

  if (/mzstatic\.com$/.test(url.hostname) || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.open(MEDIA).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      })))
    );
  }
});
