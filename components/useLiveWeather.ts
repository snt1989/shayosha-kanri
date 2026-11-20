'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LiveWeather } from '@/lib/jma';

// 岩手県の気象警報・天気予報を読み、開いている間は5分ごとに読み直す
export function useLiveWeather() {
  const [data, setData] = useState<LiveWeather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await fetch('/api/live-weather', { cache: 'no-store' })).json();
      if (j?.success) {
        setData(j);
        setError('');
      } else setError('読み込めませんでした。');
    } catch {
      setError('読み込めませんでした。電波の良い場所で、もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 5 * 60 * 1000);
    const vis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [load]);
  return { data, loading, error, reload: load };
}

export const hm = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
export const weatherIcon = (w: string) => {
  const first = w.split(/\s/)[0] || w;
  if (first.includes('雪')) return '❄️';
  if (first.includes('雨')) return '🌧';
  if (first.includes('晴')) return w.includes('くもり') ? '🌤' : '☀️';
  if (first.includes('くもり')) return w.includes('雪') ? '🌨' : w.includes('雨') ? '🌦' : '☁️';
  return '🌡';
};
