/* 오프라인 캐시: 화면 파일은 캐시 우선(백그라운드 갱신), 장부(data.json)는 네트워크 우선·실패 시 마지막 사본 */
const CACHE = 'turtle-app-v2';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('.json') || url.pathname.endsWith('.enc')) {      // 장부·날짜별 상세(평문 .json 또는 암호화 .enc)와 meta.json: 네트워크 우선, 실패하면 마지막 사본
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, copy)); } return r; })
      .catch(() => caches.match(url.pathname).then((r) => {
        if (!r) return Response.error();
        const h = new Headers(r.headers); h.set('x-from-cache', '1');
        return r.blob().then((b) => new Response(b, { status: 200, headers: h }));
      })));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
