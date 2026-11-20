import { NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/kv';
import { JMA_URLS, LiveWeather, parseForecast, parseWarnings } from '@/lib/jma';

export const dynamic = 'force-dynamic';

// 岩手県の気象警報・注意報と天気予報（気象庁の公開データ）。
// 気象庁へは、5分に1回までしか問い合わせない（結果を保存して、みんなで使い回す）。地域名の表は1日1回。
const CACHE = 'fleet:live-weather:v1';
const AREA = 'fleet:jma-area:v1';
const TTL = 5 * 60 * 1000;

type AreaConst = { class10s: Record<string, { name: string }>; class15s: Record<string, { name: string; parent?: string }>; class20s: Record<string, { name: string; parent?: string }> };

async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store', headers: { 'User-Agent': 'fleet-app (unko-kanri)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function areaConst(): Promise<AreaConst | null> {
  const c = await kvGet<{ at: number; data: AreaConst } | null>(AREA, null);
  if (c && Date.now() - c.at < 24 * 3600 * 1000) return c.data;
  try {
    const all = (await getJson(JMA_URLS.area)) as AreaConst;
    // 岩手県のぶんだけ残す（全国の表は大きいため）
    const pick = <T,>(o: Record<string, T>, re: RegExp) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => re.test(k)));
    const data: AreaConst = { class10s: pick(all.class10s, /^0300/), class15s: pick(all.class15s, /^0300/), class20s: pick(all.class20s, /^03/) };
    await kvSet(AREA, { at: Date.now(), data });
    return data;
  } catch {
    return c?.data || null;
  }
}

export async function GET() {
  const cached = await kvGet<{ at: number; data: LiveWeather } | null>(CACHE, null);
  if (cached && Date.now() - cached.at < TTL) return NextResponse.json({ success: true, ...cached.data, cached: true });
  const errors: string[] = [];
  const area = await areaConst();
  const [w, f] = await Promise.all([
    getJson(JMA_URLS.warning).catch((e) => {
      errors.push(`警報・注意報：${e instanceof Error ? e.message : '取得できませんでした'}`);
      return null;
    }),
    getJson(JMA_URLS.forecast).catch((e) => {
      errors.push(`天気予報：${e instanceof Error ? e.message : '取得できませんでした'}`);
      return null;
    }),
  ]);
  const data: LiveWeather = {
    fetchedAt: new Date().toISOString(),
    warning: w ? parseWarnings(w, area) : cached?.data.warning || null,
    forecast: f ? parseForecast(f) : cached?.data.forecast || null,
    errors,
  };
  if (data.warning || data.forecast) await kvSet(CACHE, { at: Date.now(), data });
  return NextResponse.json({ success: true, ...data });
}
