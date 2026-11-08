import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { MAINT_URGENCIES, Report } from '@/lib/types';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { cleanPhotoIds } from '@/lib/photo-ids';

export const dynamic = 'force-dynamic';

const todayJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 整備台帳で、依頼と結びついていない記録の進捗を「整備中／経過観察」にしたとき、
// その記録の内容で整備依頼を作り直して、整備依頼の一覧に戻す。
// 作れるのは整備士か管理者（運転者ログインの依頼とは別）。
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as {
    vehicleId?: string;
    type?: string;
    note?: string;
    watch?: boolean;
    mechanic?: string;
    photos?: string[];
  };
  const data = await loadData();
  const isAdminReq = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const mechanic = b.mechanic && data.masters.mechanics.includes(b.mechanic) ? b.mechanic : '';
  if (!isAdminReq && !mechanic) {
    return NextResponse.json({ success: false, message: '整備士または管理者としてログインしてください。' }, { status: 403 });
  }
  const v = data.vehicles.find((x) => x.id === b.vehicleId);
  if (!v) return NextResponse.json({ success: false, message: '車両が見つかりません。' }, { status: 404 });
  const type = String(b.type || '').trim().slice(0, 40);
  const note = String(b.note || '').trim().slice(0, 500) || `${type || '整備'}（整備台帳から、整備依頼に戻しました）`;
  const who = mechanic || '管理者';

  const r: Report = {
    id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: todayJst(),
    dept: '',
    driverLast: who,
    driverFirst: '',
    driver: who,
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
    maintRequestType: type,
    maintRequestUrgency: MAINT_URGENCIES[0],
    maintRequestNote: note,
    maintRequestPhotos: cleanPhotoIds(b.photos),
    maintRequestDone: false,
    maintRequestWatch: Boolean(b.watch),
    maintRequestWatchAt: b.watch ? todayJst() : '',
  };
  data.reports.unshift(r);
  pushLog(data, {
    actor: isAdminReq ? 'admin' : 'user',
    action: '整備依頼に戻した（整備台帳から）',
    target: `${who} / ${r.vehicleName}`,
    detail: `${type} ${note}`.trim(),
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
