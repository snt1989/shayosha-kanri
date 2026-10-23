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
      const res = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
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
