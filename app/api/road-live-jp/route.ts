// （調査用・一時的）日本の拠点（エッジ）から、岩手県道路情報提供サービスを読めるか確かめる
export const runtime = 'edge';
export const preferredRegion = 'hnd1';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const path = u.searchParams.get('p') || '/urgency.php';
  const from = Number(u.searchParams.get('from') || 0);
  try {
    const res = await fetch('https://www.douro.com' + path, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'ja,en-US;q=0.8,en;q=0.6', Referer: 'https://www.douro.com/' }, cache: 'no-store' });
    const buf = await res.arrayBuffer();
    const ct = res.headers.get('content-type') || '';
    let text = new TextDecoder('utf-8').decode(buf);
    const m = /charset=([\w-]+)/i.exec(ct) || /<meta[^>]+charset=["']?([\w-]+)/i.exec(text);
    let decoded = 'utf-8';
    if (m && !/utf-?8/i.test(m[1])) {
      try {
        text = new TextDecoder(m[1].toLowerCase()).decode(buf);
        decoded = m[1];
      } catch (e) {
        decoded = 'failed:' + String(e);
      }
    }
    return Response.json({ status: res.status, ct, decoded, length: text.length, text: text.slice(from, from + 7000) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
