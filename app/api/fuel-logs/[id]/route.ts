import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

export const DELETE = withWriteLock(async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '削除には管理者ログインが必要です。' }, { status: 401 });
  }
  const data = await loadData();
  const target = data.fuelLogs.find((x) => x.id === id);
  if (!target) return NextResponse.json({ success: false, message: '記録が見つかりません。' }, { status: 404 });
  data.fuelLogs = data.fuelLogs.filter((x) => x.id !== id);
  pushLog(data, {
    actor: 'admin',
    action: '給油削除',
    target: `${target.date} ${target.vehicleName}`,
    detail: `${target.liters}L / ${target.amount.toLocaleString()}円`,
  });
  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
    fuelLogs: data.fuelLogs,
  });
  return NextResponse.json({ success: true });
});
