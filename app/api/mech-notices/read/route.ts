import { NextRequest, NextResponse } from 'next/server';
import { loadData } from '@/lib/store';
import { mechanicClaimOk, mechanicNameOf } from '@/lib/mechanic-auth';
import { kvGet, kvSet } from '@/lib/kv';
import { MECH_NOTICES_KEY, MechNotice } from '@/lib/mech-notices';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

// 整備士が「既読にする」。登録済みの整備士の名前（x-mechanic）のときだけ。ids に入れたお知らせを、その人の既読にする。
// （整備士のログインは名前を選ぶだけの簡易なもの。ほかの人の名前では付けられない、までは守れない）
export const POST = withWriteLock(async function POST(req: NextRequest) {
  const data = await loadData();
  const name = mechanicNameOf(req);
  if (!(await mechanicClaimOk(req, data.masters.mechanics, name))) {
    return NextResponse.json({ success: false, message: '既読にできるのは、整備士としてログインしている人だけです。' }, { status: 401 });
  }
  const b = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(b.ids) ? b.ids.filter((x: unknown) => typeof x === 'string') : [];
  const list = await kvGet<MechNotice[]>(MECH_NOTICES_KEY, []);
  const at = new Date().toISOString();
  let changed = 0;
  for (const n of list) {
    if (!ids.includes(n.id)) continue;
    const readBy = n.readBy || [];
    if (readBy.some((r) => r.name === name)) continue;
    n.readBy = [...readBy, { name, at }];
    changed++;
  }
  if (changed) await kvSet(MECH_NOTICES_KEY, list);
  return NextResponse.json({ success: true, changed });
});
