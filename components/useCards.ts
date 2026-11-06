'use client';

import { useCallback, useEffect, useState } from 'react';
import { CardLoan, FleetCard } from '@/lib/types';

// ガソリンカード・ETCカードの登録と貸出を取得する（日報などの本体データとは別のAPI）。1分ごと・画面に戻ったときにも取り直す。
export function useCards() {
  const [cards, setCards] = useState<FleetCard[]>([]);
  const [loans, setLoans] = useState<CardLoan[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/cards', { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json();
      setCards(Array.isArray(j.cards) ? j.cards : []);
      setLoans(Array.isArray(j.loans) ? j.loans : []);
      setLoaded(true);
    } catch {
      // 取れないときは、表示中のまま
    }
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 60000);
    const onVis = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reload]);

  return { cards, loans, loaded, reload };
}

export const isOverdue = (l: CardLoan, today: string) => !l.returnedAt && !!l.dueDate && l.dueDate < today;
export const fmtDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export async function cardsApi(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.message || `失敗しました (${res.status})`);
  return j;
}
