// 社用車管理クラウドのサービスワーカー（ホーム画面アプリ用）
//
// 方針
// - データ（/api/）には一切さわらない。入力した内容は必ずサーバーに保存し、常に最新を表示する。
// - 画面は通信できるときは常にサーバーから取得し、圏外のときだけ「オフラインです」を出す。
// - 変更されない静的ファイル（/_next/static/ とアイコン）だけ端末に残して、起動を速くする。
// 仕組みを変えたら VERSION を上げる（古い保存分は自動で消える）。

const VERSION = 'v1';
const CACHE = `fleet-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fleet-static-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
  }
});
