import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { Rental } from '@/lib/types';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';

export const dynamic = 'force-dynamic';

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// レンタカー利用の登録・更新。車両台帳とは別管理。
export async function POST(req: NextRequest) {
  const r: Rental = await req.json();
  const isNew = !r.id;
  if (!r.id) r.id = 'rn' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (!r.driver || !r.startDate || !r.company) {
    return NextResponse.json({ success: false, message: 'レンタカー会社・登録者・利用開始日は必須です。' }, { status: 400 });
  }
  r.endDate = r.endDate || r.startDate;
  if (r.endDate < r.startDate) {
    return NextResponse.json({ success: false, message: '返却日は利用開始日以降にしてください。' }, { status: 400 });
  }
  r.cost = num(r.cost);
  r.createdAt = r.createdAt || new Date().toISOString();

  const isAdminReq = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const data = await loadData();
  const idx = data.rentals.findIndex((x) => x.id === r.id);
  // 登録済みの記録の編集は管理者のみ（返却は専用の返却ボタンから）
  if (idx >= 0 && !isAdminReq) {
    return NextResponse.json({ success: false, message: '記録の編集には管理者ログインが必要です。' }, { status: 401 });
  }
  if (idx >= 0) r.createdAt = data.rentals[idx].createdAt || r.createdAt;
  if (idx >= 0) data.rentals[idx] = r;
  else data.rentals.push(r);
  // 登録期間を変えたら、期間の外に出てしまった予約は取り消す
  const last = r.returnedAt || r.endDate;
  const before = data.reservations.length;
  data.reservations = data.reservations.filter((x) => x.rentalId !== r.id || (x.startDate >= r.startDate && x.endDate <= last));
  const cancelled = before - data.reservations.length;

  pushLog(data, {
    actor: isAdminReq ? 'admin' : 'user',
    action: isNew || idx < 0 ? 'レンタカー登録' : 'レンタカー更新',
    target: `${r.startDate} ${r.company} ${r.carModel || ''}`.trim(),
    detail: [r.plate, cancelled ? `期間外の予約${cancelled}件を取消` : ''].filter(Boolean).join(' / ') || undefined,
  });

  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
    rentals: data.rentals,
    reservations: data.reservations,
  });
  return NextResponse.json({ success: true, id: r.id });
}
