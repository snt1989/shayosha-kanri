import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { isAdminOrMechanic, mechanicNameOf } from '@/lib/mechanic-auth';
import { pushLog } from '@/lib/log';
import { kvGet, kvSet } from '@/lib/kv';
import { MECH_NOTICES_KEY, MechNotice } from '@/lib/mech-notices';

export const dynamic = 'force-dynamic';

// 削除（管理者・整備士）
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadData();
  if (!isAdminOrMechanic(req, data.masters.mechanics)) return NextResponse.json({ success: false, message: '整備士か管理者のログインが必要です。' }, { status: 401 });
  const list = await kvGet<MechNotice[]>(MECH_NOTICES_KEY, []);
  const n = list.find((x) => x.id === id);
  if (!n) return NextResponse.json({ success: true });
  await kvSet(MECH_NOTICES_KEY, list.filter((x) => x.id !== id));
  const isAdmin = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  pushLog(data, { actor: isAdmin ? 'admin' : 'user', action: '整備士向けお知らせ削除', target: n.title, detail: isAdmin ? '管理者' : mechanicNameOf(req) });
  await saveData({ reports: data.reports, vehicles: data.vehicles, drivers: data.drivers, masters: data.masters, logs: data.logs });
  return NextResponse.json({ success: true });
}
