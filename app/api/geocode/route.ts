import { NextRequest, NextResponse } from 'next/server';
import { kvGet, kvSet, runExclusive } from '@/lib/kv';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// 地名から、地図の位置（緯度・経度）を引く。国土地理院の住所検索を使い、結果は保存して使い回す（同じ地名を何度も問い合わせない）。
// 取締り情報のマップ用。岩手県の地名だけ受け付ける。見つからない・岩手県の外になったものは null。
const KEY = 'fleet:geo:v1';
const GSI = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=';
type Geo = Record<string, [number, number] | null>;
const inIwate = (lat: number, lng: number) => lat > 38.6 && lat < 40.6 && lng > 140.5 && lng < 142.2;

async function lookup(q: string): Promise<[number, number] | null | undefined> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(GSI + encodeURIComponent(q), { signal: ctrl.signal, headers: { 'User-Agent': 'fleet-app (unko-kanri)' } });
    if (!res.ok) return undefined; // 一時的な失敗は保存しない（次の機会にもう一度）
    const list = (await res.json()) as { geometry?: { coordinates?: [number, number] } }[];
    const c = Array.isArray(list) ? list[0]?.geometry?.coordinates : undefined;
    if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
    const [lng, lat] = c;
    return inIwate(lat, lng) ? [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5] : null;
  } catch {
    return undefined;
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { q?: unknown };
  return NextResponse.json(await resolve(b.q));
}

// 動作確認用：GET /api/geocode?q=岩手県盛岡市高松
export async function GET(req: NextRequest) {
  return NextResponse.json(await resolve(req.nextUrl.searchParams.getAll('q')));
}

async function resolve(input: unknown) {
  const b = { q: input };
  const qs = [...new Set((Array.isArray(b.q) ? b.q : []).filter((x): x is string => typeof x === 'string' && x.startsWith('岩手県') && x.length <= 60))].slice(0, 120);
  const cache = await kvGet<Geo>(KEY, {});
  const out: Geo = {};
  const todo: string[] = [];
  for (const q of qs) {
    if (q in cache) out[q] = cache[q];
    else todo.push(q);
  }
  if (todo.length > 0) {
    const found: Geo = {};
    const queue = todo.slice(0, 40); // 1回に問い合わせるのは40件まで（残りは次の表示のとき）
    const worker = async () => {
      for (let q = queue.shift(); q; q = queue.shift()) {
        const r = await lookup(q);
        if (r !== undefined) found[q] = r;
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    Object.assign(out, found);
    if (Object.keys(found).length > 0) {
      await runExclusive(async () => {
        const cur = await kvGet<Geo>(KEY, {});
        await kvSet(KEY, { ...cur, ...found });
      }).catch(() => undefined);
    }
  }
  return { success: true, geo: out, pending: qs.filter((q) => !(q in out)).length };
}
