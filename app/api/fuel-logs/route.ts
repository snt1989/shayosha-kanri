import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { FuelLog } from '@/lib/types';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// 給油の登録・更新。新規登録は誰でも（画面側で運転者ログインが必要）、登録済みの記録の編集は管理者のみ。
export const POST = withWriteLock(async function POST(req: NextRequest) {
  const f: FuelLog = await req.json();
  const isNew = !f.id;
  if (!f.id) f.id = 'fl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  f.liters = num(f.liters);
  f.amount = Math.round(num(f.amount));
  f.km = num(f.km);
  if (!f.vehicleId || !f.date || !f.driver) {
    return NextResponse.json({ success: false, message: '車両・給油日・給油者は必須です。' }, { status: 400 });
  }
  if (!(f.liters > 0)) {
    return NextResponse.json({ success: false, message: '給油量は0より大きい数を入力してください。' }, { status: 400 });
  }
  const isAdminReq = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const data = await loadData();
  const idx = data.fuelLogs.findIndex((x) => x.id === f.id);
  if (idx >= 0 && !isAdminReq) {
    return NextResponse.json({ success: false, message: '記録の編集には管理者ログインが必要です。' }, { status: 401 });
  }
  const v = data.vehicles.find((x) => x.id === f.vehicleId);
  if (v) {
    f.vehicleName = v.name;
    f.plate = v.plate;
  }
  f.full = Boolean(f.full);
  f.note = f.note || '';
  f.payMethod = f.payMethod || '';
  f.fuelType = f.fuelType || '';
  f.createdAt = idx >= 0 ? data.fuelLogs[idx].createdAt || f.createdAt : f.createdAt || new Date().toISOString();

  if (idx >= 0) data.fuelLogs[idx] = f;
  else data.fuelLogs.push(f);

  pushLog(data, {
    actor: isAdminReq ? 'admin' : 'user',
    action: isNew || idx < 0 ? '給油登録' : '給油更新',
    target: `${f.date} ${f.vehicleName}`,
    detail: `${f.liters}L / ${f.amount.toLocaleString()}円 / ${f.driver}`,
  });
  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
    fuelLogs: data.fuelLogs,
  });
  return NextResponse.json({ success: true, id: f.id });
});
