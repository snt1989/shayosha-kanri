import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// （調査用・一時的）公開データの形を確かめる
const SRC: Record<string, string> = {
  douro: 'https://www.douro.com/urgency.php',
  douroTop: 'https://www.douro.com/',
  jmaw: 'https://www.jma.go.jp/bosai/warning/data/warning/030000.json',
  jmaf: 'https://www.jma.go.jp/bosai/forecast/data/forecast/030000.json',
};
export async function GET(req: NextRequest) {
  const k = req.nextUrl.searchParams.get('raw') || '';
  const from = Number(req.nextUrl.searchParams.get('from') || 0);
  if (!SRC[k]) return NextResponse.json({ keys: Object.keys(SRC) });
  try {
    const res = await fetch(SRC[k], { headers: { 'User-Agent': 'Mozilla/5.0 (fleet-app)' }, cache: 'no-store' });
    const buf = await res.arrayBuffer();
    const ct = res.headers.get('content-type') || '';
    let text = new TextDecoder('utf-8').decode(buf);
    const m = /charset=([\w-]+)/i.exec(ct) || /<meta[^>]+charset=["']?([\w-]+)/i.exec(text);
    if (m && !/utf-?8/i.test(m[1])) text = new TextDecoder(m[1].toLowerCase()).decode(buf);
    return NextResponse.json({ status: res.status, ct, charset: m?.[1] || '', length: text.length, text: text.slice(from, from + 6000) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
