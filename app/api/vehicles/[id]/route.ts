import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { kvDel } from '@/lib/kv';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const isAdminReq = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const data = await loadData();
  const target = data.vehicles.find((v) => v.id === id);
  const before = data.vehicles.length;
  data.vehicles = data.vehicles.filter((v) => v.id !== id);
  if (data.vehicles.length === before) {
    return NextResponse.json({ success: false }, { status: 404 });
  }
  if (target?.shakenFileAt) await kvDel(`fleet:shaken:v1:${id}`);
  pushLog(data, {
    actor: isAdminReq ? 'admin' : 'user',
    action: '車両削除',
    target: target?.name || id,
    detail: target?.plate,
  });
  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
  });
  return NextResponse.json({ success: true });
}
