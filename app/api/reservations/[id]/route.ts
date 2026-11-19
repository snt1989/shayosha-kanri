import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

// 予約の取消。誰でも行える（日報と違い、事前の予定なので改ざん防止の対象にしない）。
export const DELETE = withWriteLock(async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadData();
  const target = data.reservations.find((x) => x.id === id);
  if (!target) {
    return NextResponse.json({ success: false, message: '予約が見つかりません。' }, { status: 404 });
  }
  data.reservations = data.reservations.filter((x) => x.id !== id);

  pushLog(data, {
    actor: isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value) ? 'admin' : 'user',
    action: '予約取消',
    target: `${target.startDate} ${target.driver} / ${target.vehicleName}`,
    detail: target.destination,
  });

  await saveData({
    reports: data.reports,
    reservations: data.reservations,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
  });
  return NextResponse.json({ success: true });
});
