// 社用車管理クラウドのサービスワーカー（ホーム画面アプリ用）
//
// 方針
// - データ（/api/）には一切さわらない。入力した内容は必ずサーバーに保存し、常に最新を表示する。
// - 画面は通信できるときは常にサーバーから取得し、圏外のときだけ「オフラインです」を出す。
// - 変更されない静的ファイル（/_next/static/ とアイコン）だけ端末に残して、起動を速くする。
// 仕組みを変えたら VERSION を上げる（古い保存分は自動で消える）。

const VERSION = 'v3';
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

// --- プッシュ通知 ---
// サーバーからは「合図」だけが届く（本文は付かない）。合図を受けたら /api/push/latest で本文を取得して表示する。
// 取得できなくても、必ず何かを表示する（表示しないと、ブラウザが通知の許可を取り消すことがある）。
// ホーム画面のアプリアイコンの件数（バッジ）。アプリを開いているときは画面側が正しい件数を伝えてくる（badge-sync）。
// 閉じているときにプッシュが届いたら、ここで+1する。
const BADGE_CACHE = 'fleet-badge';
async function badgeGet() {
  try {
    const r = await (await caches.open(BADGE_CACHE)).match('badge');
    return r ? Number(await r.text()) || 0 : 0;
  } catch (e) {
    return 0;
  }
}
async function badgeSet(n) {
  try {
    await (await caches.open(BADGE_CACHE)).put('badge', new Response(String(n)));
  } catch (e) {
    // 保存できなくても通知は出す
  }
  try {
    if (self.navigator && self.navigator.setAppBadge) {
      // 結果は待たない（端末によっては返事が来ないことがあり、通知の表示を止めてしまうため）
      if (n > 0) self.navigator.setAppBadge(n).catch(() => undefined);
      else self.navigator.clearAppBadge().catch(() => undefined);
    }
  } catch (e) {
    // 対応していない端末では何もしない
  }
}
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'badge-sync') event.waitUntil(badgeSet(Number(event.data.n) || 0));
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      // 件数の更新は通知の表示をじゃましない（端末によって時間がかかっても、通知は先に出す）
      const badgeDone = Promise.race([badgeGet().then((n) => badgeSet(n + 1)), new Promise((r) => setTimeout(r, 3000))]).catch(() => undefined);
      let msg = { title: 'お知らせがあります', body: 'アプリを開いて確認してください。', url: '/?notices=1' };
      try {
        const res = await fetch('/api/push/latest', { cache: 'no-store' });
        if (res.ok) msg = { ...msg, ...(await res.json()) };
      } catch (e) {
        // 圏外などのときは、既定の文面で表示する
      }
      await self.registration.showNotification(msg.title, {
        body: msg.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png', // 通知の小さいアイコン（白一色・背景透明）
        tag: 'fleet-notice',
        renotify: true,
        data: { url: msg.url || '/?notices=1' },
        // 至急の通知は、押すまで消えず、振動も長くする（対応に対応していない端末では通常の通知になる）
        ...(msg.urgent ? { requireInteraction: true, vibrate: [300, 150, 300, 150, 600] } : {}),
      });
      await badgeDone;
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/?notices=1';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
          await c.focus();
          if ('navigate' in c) await c.navigate(url).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
