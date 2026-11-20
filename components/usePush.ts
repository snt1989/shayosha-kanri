'use client';

import { useCallback, useEffect, useState } from 'react';

// この端末の、プッシュ通知の状態と、オン／オフの操作。ベル（NoticeBell）と、画面上部のご案内（SetupNudge）が使う。
export type PushState = 'loading' | 'unsupported' | 'ios-install' | 'unconfigured' | 'denied' | 'off' | 'on';

export type Env = { ios: boolean; android: boolean; standalone: boolean };

// 端末の種類と、ホーム画面に追加したアプリとして開いているか
export function detectEnv(): Env {
  if (typeof navigator === 'undefined') return { ios: false, android: false, standalone: false };
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS は Mac を名乗る
  const android = /Android/.test(ua);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as unknown as { standalone?: boolean }).standalone);
  return { ios, android, standalone };
}

function keyToBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// だれの端末か（運転者・整備士・管理者）を、通知の登録に付けて送る。通知を必要な人だけに届けるため。
// 管理者の印は、一度ログインした端末に残す（ログインが8時間で切れても、通知は届くように）。「管理者ログアウト」で消える。
const WHO_KEY = 'fleet:push:who';
const ADMIN_FLAG = 'fleet:push:admin';
type Who = { driverId: string; mechanic: string; admin: boolean };
const read = (k: string) => {
  try {
    return localStorage.getItem(k) || '';
  } catch {
    return '';
  }
};
const write = (k: string, v: string) => {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    // 保存できなくても動かす
  }
};
export function currentWho(): Who {
  let mechanic = '';
  try {
    mechanic = localStorage.getItem('fleet_current_mechanic') || '';
  } catch {
    mechanic = '';
  }
  return { driverId: read('fleet:push:driver'), mechanic, admin: read(ADMIN_FLAG) === '1' };
}
export function forgetPushAdmin() {
  write(ADMIN_FLAG, '');
}
// ログインの状態が変わったら呼ぶ。通知を受け取っている端末なら、登録を更新する（変わっていなければ何もしない）。
export async function syncPushIdentity(now: { driverId: string | null; mechanic: string | null; isAdmin: boolean }) {
  try {
    if (now.isAdmin) write(ADMIN_FLAG, '1');
    write('fleet:push:driver', now.driverId || '');
    const who: Who = { driverId: now.driverId || '', mechanic: now.mechanic || '', admin: now.isAdmin || read(ADMIN_FLAG) === '1' };
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    const sig = JSON.stringify([sub.endpoint, who]);
    if (read(WHO_KEY) === sig) return;
    const res = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), who }) });
    if (res.ok) write(WHO_KEY, sig);
  } catch {
    // 通知の登録の更新に失敗しても、ほかの操作は止めない
  }
}

export function usePush(onMessage?: (m: string) => void) {
  const [state, setState] = useState<PushState>('loading');
  const [publicKey, setPublicKey] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        const env = detectEnv();
        return setState(env.ios && !env.standalone ? 'ios-install' : 'unsupported');
      }
      const cfg = (await (await fetch('/api/push', { cache: 'no-store' })).json()) as { enabled: boolean; publicKey: string };
      if (!cfg.enabled) return setState('unconfigured');
      setPublicKey(cfg.publicKey);
      if (Notification.permission === 'denied') return setState('denied');
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
    } catch {
      setState('unsupported');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    onMessage?.('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        return onMessage?.('通知が許可されませんでした。');
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) as BufferSource });
      const res = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), who: currentWho() }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        await sub.unsubscribe().catch(() => undefined);
        return onMessage?.(j.message || '登録できませんでした。');
      }
      setState('on');
      onMessage?.('この端末に通知が届くようになりました。');
    } catch (e) {
      onMessage?.('通知の登録に失敗しました。' + (e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    onMessage?.('');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setState('off');
      onMessage?.('この端末への通知を止めました。');
    } catch {
      onMessage?.('解除に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  return { state, busy, refresh, enable, disable };
}
