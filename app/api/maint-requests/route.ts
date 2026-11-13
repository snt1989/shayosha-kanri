import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { MAINT_URGENCIES, Report } from '@/lib/types';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { cleanPhotoIds } from '@/lib/photo-ids';

export const dynamic = 'force-dynamic';

const todayJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// ダッシュボードから直接出す整備依頼。日報（運転の記録）にはせず、maintOnly の記録として保存する。
// 以降は、帰着登録で出した依頼と同じく、整備台帳で対応済にするまで「対応待ち」に出る。
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as {
    vehicleId?: string;
    type?: string;
    urgency?: string;
    note?: string;
    driverId?: string;
    photos?: string[];
  };
  const note = String(b.note || '').trim().slice(0, 500);
  if (!b.vehicleId) {
    return NextResponse.json({ success: false, message: '車両を選んでください。' }, { status: 400 });
  }
  const urgency = (MAINT_URGENCIES as readonly string[]).includes(String(b.urgency)) ? String(b.urgency) : MAINT_URGENCIES[0];

  const data = await loadData();
  const v = data.vehicles.find((x) => x.id === b.vehicleId);
  if (!v) return NextResponse.json({ success: false, message: '車両が見つかりません。' }, { status: 404 });
  const d = data.drivers.find((x) => x.id === b.driverId);
  if (!d) return NextResponse.json({ success: false, message: '運転者としてログインしてください。' }, { status: 401 });

  const r: Report = {
    id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: todayJst(),
    dept: d.dept || '',
    driverId: d.id,
    driverLast: d.lastName,
    driverFirst: d.firstName,
    driver: `${d.lastName} ${d.firstName}`.trim(),
    vehicleId: v.id,
    vehicleName: v.name,
    plate: v.plate,
    destination: '',
    purpose: '',
    preTime: '',
    preAlcohol: '',
    preChecker: '',
    tireOk: true,
    brakeOk: true,
    postDone: true,
    postTime: '',
    postAlcohol: '',
    postChecker: '',
    startKm: 0,
    endKm: 0,
    tripKm: 0,
    notes: '',
    maintOnly: true,
    maintRequest: true,
    maintRequestType: String(b.type || '').trim().slice(0, 80),
    maintRequestUrgency: urgency,
    maintRequestNote: note,
    maintRequestPhotos: cleanPhotoIds(b.photos),
    maintRequestDone: false,
  };
  data.reports.unshift(r);
  pushLog(data, {
    actor: isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value) ? 'admin' : 'user',
    action: '整備依頼（ダッシュボード）',
    target: `${r.driver} / ${r.vehicleName}`,
    detail: `${r.maintRequestType} ${urgency} ${note}`.trim(),
  });
  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
  });
  return NextResponse.json({ success: true, id: r.id });
}
