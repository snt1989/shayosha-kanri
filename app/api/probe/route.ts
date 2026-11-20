import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// （調査用・一時的）公開の道路情報ページを、サーバーから読めるか確かめる
const SRC: Record<string, string> = {
  thr: 'http://road.thr.mlit.go.jp/',
  thrs: 'https://road.thr.mlit.go.jp/',
  prvsSp: 'https://www.road-info-prvs.mlit.go.jp/roadinfo/sp/spTukokisei_81_1.html',
  prvsTop: 'https://www.road-info-prvs.mlit.go.jp/roadinfo/sp/',
  jopen: 'https://www.jartic-open-traffic.org/',
};
export async function GET(req: NextRequest) {
  const k = req.nextUrl.searchParams.get('k') || '';
  const path = req.nextUrl.searchParams.get('p') || '';
  const q = req.nextUrl.searchParams.get('q') || '';
  const from = Number(req.nextUrl.searchParams.get('from') || 0);
  if (!SRC[k]) return NextResponse.json({ keys: Object.keys(SRC) });
  const url = path ? new URL(path, SRC[k]).toString() : SRC[k];
  if (!/^https?:\/\/(road\.thr\.mlit\.go\.jp|www\.road-info-prvs\.mlit\.go\.jp|www\.jartic-open-traffic\.org)\//.test(url)) return NextResponse.json({ error: 'bad url' });
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; fleet-app)' }, cache: 'no-store', redirect: 'follow' });
    const buf = await res.arrayBuffer();
    const ct = res.headers.get('content-type') || '';
    let text = new TextDecoder('utf-8').decode(buf);
    const m = /charset=([\w-]+)/i.exec(ct) || /<meta[^>]+charset=["']?([\w-]+)/i.exec(text);
    if (m && !/utf-?8/i.test(m[1])) {
      try {
        text = new TextDecoder(m[1].toLowerCase().replace('x-sjis', 'shift_jis')).decode(buf);
      } catch {
        /* そのまま */
      }
    }
    const xfo = res.headers.get('x-frame-options') || '';
    const csp = res.headers.get('content-security-policy') || '';
    if (q) {
      const i = text.indexOf(q);
      return NextResponse.json({ status: res.status, url: res.url, at: i, text: i >= 0 ? text.slice(Math.max(0, i - 500), i + 4000) : '' });
    }
    return NextResponse.json({ status: res.status, url: res.url, ct, xfo, csp: csp.slice(0, 200), length: text.length, text: text.slice(from, from + 6000) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
