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
  const target = data.rentals.find((x) => x.id === id);
  if (!target) {
    return NextResponse.json({ success: false, message: '記録が見つかりません。' }, { status: 404 });
  }
  data.rentals = data.rentals.filter((x) => x.id !== id);
  const removedTrips = data.rentalTrips.filter((x) => x.rentalId === id).length;
  data.rentalTrips = data.rentalTrips.filter((x) => x.rentalId !== id);
  const removedRes = data.reservations.filter((x) => x.rentalId === id).length;
  data.reservations = data.reservations.filter((x) => x.rentalId !== id);
  const removed = [removedTrips ? `運行記録${removedTrips}件` : '', removedRes ? `予約${removedRes}件` : ''].filter(Boolean);
  pushLog(data, {
    actor: 'admin',
    action: 'レンタカー削除',
    target: `${target.startDate} ${target.company} ${target.carModel || ''}`.trim(),
    detail: removed.length ? `${removed.join('・')}も削除` : undefined,
  });
  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
    rentals: data.rentals,
    rentalTrips: data.rentalTrips,
    reservations: data.reservations,
  });
  return NextResponse.json({ success: true });
});
