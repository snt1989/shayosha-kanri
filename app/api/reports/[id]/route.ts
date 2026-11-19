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
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '日報の削除には管理者ログインが必要です。' }, { status: 401 });
  }
  const { id } = await params;
  const data = await loadData();
  const target = data.reports.find((r) => r.id === id);
  const before = data.reports.length;
  data.reports = data.reports.filter((r) => r.id !== id);
  if (data.reports.length === before) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  pushLog(data, {
    actor: 'admin',
    action: '日報削除',
    target: target ? `${target.date} ${target.driver} / ${target.vehicleName}` : id,
    detail: target?.destination,
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
