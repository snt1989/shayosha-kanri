import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { RentalTrip } from '@/lib/types';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

// レンタカーの運行記録（誰が運転したか）の登録・更新。
export const POST = withWriteLock(async function POST(req: NextRequest) {
  const t: RentalTrip = await req.json();
  const isNew = !t.id;
  if (!t.id) t.id = 'rt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  t.driver = String(t.driver || '').trim();
  if (!t.rentalId || !t.date || !t.driver) {
    return NextResponse.json({ success: false, message: 'レンタカー・運転日・運転者は必須です。' }, { status: 400 });
  }
  const isAdminReq = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const data = await loadData();
  if (!isNew && data.rentalTrips.some((x) => x.id === t.id) && !isAdminReq) {
    return NextResponse.json({ success: false, message: '記録の編集には管理者ログインが必要です。' }, { status: 401 });
  }
  const rental = data.rentals.find((x) => x.id === t.rentalId);
  if (!rental) {
    return NextResponse.json({ success: false, message: '対象のレンタカーが見つかりません。' }, { status: 404 });
  }
  t.dept = String(t.dept || '').trim();
  t.site = String(t.site || '').trim();
  if (!t.site || !t.dept) {
    return NextResponse.json({ success: false, message: '現場名と事業部は必須です。' }, { status: 400 });
  }
  t.note = t.note || '';
  t.createdAt = t.createdAt || new Date().toISOString();

  const idx = data.rentalTrips.findIndex((x) => x.id === t.id);
  if (idx >= 0) data.rentalTrips[idx] = t;
  else data.rentalTrips.push(t);

  pushLog(data, {
    actor: isAdminReq ? 'admin' : 'user',
    action: isNew || idx < 0 ? 'レンタカー運行記録登録' : 'レンタカー運行記録更新',
    target: `${t.date} ${t.driver} / ${rental.company} ${rental.carModel || ''}`.trim(),
    detail: [t.dept, t.site, t.note].filter(Boolean).join(' / ') || undefined,
  });

  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
    rentalTrips: data.rentalTrips,
  });
  return NextResponse.json({ success: true, id: t.id });
});
