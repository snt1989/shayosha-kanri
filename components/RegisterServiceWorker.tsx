'use client';

import { useEffect } from 'react';

// ホーム画面アプリ用のサービスワーカーを登録する。開発中（next dev）は登録しない。
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 登録できなくても、通常のWebアプリとして使えるので何もしない
    });
  }, []);
  return null;
}
