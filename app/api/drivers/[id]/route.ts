import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

export const DELETE = withWriteLock(async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const isAdminReq = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const data = await loadData();
  const target = data.drivers.find((d) => d.id === id);
  const before = data.drivers.length;
  data.drivers = data.drivers.filter((d) => d.id !== id);
  if (data.drivers.length === before) {
    return NextResponse.json({ success: false }, { status: 404 });
  }
  pushLog(data, {
    actor: isAdminReq ? 'admin' : 'user',
    action: '運転者削除',
    target: target ? `${target.lastName} ${target.firstName}` : id,
    detail: target?.dept,
  });
  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
  });
  return NextResponse.json({ success: true });
});
