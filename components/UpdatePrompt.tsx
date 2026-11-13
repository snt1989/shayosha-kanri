'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MY_BUILD = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';

type Latest = { id: string; title: string; items: string[] };

// アプリが更新されたら、「新しくなりました」の画面を出して、押してもらって更新する。
// 画面を開いたとき・アプリに戻ったとき・5分ごとに、公開中の版のIDを確かめる。入力の途中で勝手に再読み込みはしない。
export default function UpdatePrompt() {
  const [latest, setLatest] = useState<Latest | null>(null);
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const lastIdRef = useRef('');

  const check = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) return;
      const j = (await res.json()) as Latest;
      if (j && typeof j.id === 'string' && j.id !== MY_BUILD && j.id !== 'dev' && MY_BUILD !== 'dev') {
        if (lastIdRef.current !== j.id) setLater(false); // さらに新しい版が出たら、また出す
        lastIdRef.current = j.id;
        setLatest(j);
      } else {
        lastIdRef.current = '';
        setLatest(null);
      }
    } catch {
      // 通信できないときは、何もしない
    }
  }, []);

  useEffect(() => {
    check();
    const t = setInterval(check, 5 * 60 * 1000);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        setLater(false); // 「あとで」にしていても、アプリに戻ったらまた出す
        check();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', check);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', check);
    };
  }, [check]);

  async function update() {
    setBusy(true);
    busyRef.current = true;
    try {
      // 端末に残した古い画面の保存分を消し、サービスワーカーも新しくしてから読み込み直す
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith('fleet-static-')).map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update().catch(() => undefined);
      }
    } catch {
      // 失敗しても、読み込み直しはする
    }
    window.location.reload();
  }

  if (!latest || later) return null;
  return (
    <div className="update-overlay" role="dialog" aria-modal="true" aria-label="アプリの更新">
      <div className="update-box">
        <div className="update-icon" aria-hidden>🆕</div>
        <h2>アプリが新しくなりました</h2>
        <p className="update-lead">最新の状態にするため、更新してください。</p>
        {latest.title && (
          <div className="update-what">
            <strong>{latest.title}</strong>
            {latest.items.length > 0 && (
              <ul>
                {latest.items.slice(0, 3).map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button type="button" className="btn btn-primary update-btn" disabled={busy} onClick={update}>
          {busy ? '更新しています…' : '今すぐ更新する'}
        </button>
        <button type="button" className="update-later" disabled={busy} onClick={() => setLater(true)}>
          あとで（入力が終わってから）
        </button>
      </div>
    </div>
  );
}
