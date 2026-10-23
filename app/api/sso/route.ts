import { NextRequest, NextResponse } from 'next/server';
import { loadData } from '@/lib/store';
import { normName, readTicket } from '@/lib/sso';

export const dynamic = 'force-dynamic';

// 現場管理アプリから開かれたとき、チケットの氏名と同じ運転者がちょうど1人いれば、その運転者としてのログインを引き継ぐ。
// 該当なし・複数・チケット不正・SSO_SECRET 未設定のときは ok:false（通常のログイン画面になる）。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const t = readTicket((body as { ticket?: unknown }).ticket, process.env.SSO_SECRET);
  if (!t) return NextResponse.json({ ok: false });
  const data = await loadData();
  const key = normName(t.n);
  const hit = data.drivers.filter((d) => normName(`${d.lastName}${d.firstName}`) === key);
  if (hit.length !== 1) return NextResponse.json({ ok: false, site: t.site, division: t.division });
  return NextResponse.json({ ok: true, driverId: hit[0].id, site: t.site, division: t.division });
}
