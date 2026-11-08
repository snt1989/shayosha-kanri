'use client';

import { ReactNode, useEffect, useState } from 'react';

// スマホ（幅640px以下）の画面かどうか
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}

// スマホでは、一覧の最初の数件だけを出して、残りは「さらに表示」で増やす（画面が縦に長くなりすぎないように）。
// パソコンでは今までどおり全件を出す。resetKey が変わる（検索・絞り込みを変えた）と、最初の件数に戻す。
export function useMobileLimit<T>(items: T[], first = 3, resetKey = '', step = 5): { shown: T[]; more: ReactNode } {
  const mobile = useIsMobile();
  const [count, setCount] = useState(first);
  useEffect(() => setCount(first), [resetKey, first]);
  if (!mobile || items.length <= count) return { shown: items, more: null };
  const rest = items.length - count;
  return {
    shown: items.slice(0, count),
    more: (
      <div className="show-more">
        <button type="button" className="btn" onClick={() => setCount(count + step)}>
          さらに表示（残り{rest}件）
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setCount(items.length)}>
          すべて表示
        </button>
      </div>
    ),
  };
}
