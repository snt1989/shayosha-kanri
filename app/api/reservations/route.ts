import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { Reservation } from '@/lib/types';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { maintBlockIn, maintBlocks } from '@/lib/utils';
import { jpDate } from '@/lib/schedule-text';

export const dynamic = 'force-dynamic';

// 予約の開始・終了を「日付 時刻」の文字列にして比較する（同じ形式なので文字列比較で順序が合う）
const startKey = (r: Pick<Reservation, 'startDate' | 'startTime'>) => `${r.startDate} ${r.startTime || '00:00'}`;
const endKey = (r: Pick<Reservation, 'endDate' | 'startDate' | 'endTime'>) => `${r.endDate || r.startDate} ${r.endTime || '23:59'}`;
const fmt = (date: string, time: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))} ${time}`;

// 予約の登録・変更。誰でも行える（車両の押さえ合いは重複チェックで防ぐ）。
export async function POST(req: NextRequest) {
  const r: Reservation = await req.json();
  const isNew = !r.id;
  if (!r.id) {
    r.id = 'rv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  if (!r.vehicleId || !r.driver || !r.startDate) {
    return NextResponse.json({ success: false, message: '車両・運転者・利用日は必須です。' }, { status: 400 });
  }
  r.endDate = r.endDate || r.startDate;
  r.startTime = r.startTime || '00:00';
  r.endTime = r.endTime || '23:59';
  r.driverLast = r.driverLast || r.driver.split(/\s+/)[0];
  r.createdAt = r.createdAt || new Date().toISOString();
  if (endKey(r) <= startKey(r)) {
    return NextResponse.json({ success: false, message: '終了は開始より後の日時にしてください。' }, { status: 400 });
  }

  const data = await loadData();
  // レンタカーの予約: 登録期間（返却済みなら実際に返却した日まで）の中だけ予約できる
  if (r.rentalId) {
    const rental = data.rentals.find((x) => x.id === r.rentalId);
    if (!rental) {
      return NextResponse.json({ success: false, message: '対象のレンタカーが見つかりません。' }, { status: 404 });
    }
    const last = rental.returnedAt || rental.endDate;
    if (r.startDate < rental.startDate || r.endDate > last) {
      return NextResponse.json(
        { success: false, message: `${rental.company} ${rental.carModel || ''} は登録期間（${rental.startDate}〜${last}）の中でだけ予約できます。`.replace('  ', ' ') },
        { status: 400 }
      );
    }
    r.vehicleId = rental.id;
    r.vehicleName = `🚗 ${[rental.company, rental.carModel].filter(Boolean).join(' ')}`;
    r.plate = rental.plate;
  }
  // 修理予定日が決まっている車両は、その日は使えない
  const blocked = r.rentalId ? undefined : maintBlockIn(maintBlocks(data.reports), r.vehicleId, r.startDate, r.endDate);
  if (blocked) {
    return NextResponse.json(
      { success: false, message: `${blocked.vehicleName} は ${jpDate(blocked.date)} に整備（${blocked.type}）の予定が入っているため、その日は予約できません。日をずらすか、別の車両を選んでください。` },
      { status: 409 }
    );
  }
  const clash = data.reservations.find((x) => x.id !== r.id && x.vehicleId === r.vehicleId && startKey(x) < endKey(r) && startKey(r) < endKey(x));
  if (clash) {
    return NextResponse.json(
      {
        success: false,
        message: `${clash.vehicleName} は ${fmt(clash.startDate, clash.startTime)}〜${fmt(clash.endDate, clash.endTime)} に ${clash.driver} さんが予約済みです。時間をずらすか、別の車両を選んでください。`,
      },
      { status: 409 }
    );
  }

  const idx = data.reservations.findIndex((x) => x.id === r.id);
  if (idx >= 0) data.reservations[idx] = r;
  else data.reservations.push(r);

  pushLog(data, {
    actor: isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value) ? 'admin' : 'user',
    action: isNew || idx < 0 ? '予約登録' : '予約変更',
    target: `${r.startDate} ${r.driver} / ${r.vehicleName}`,
    detail: r.destination,
  });

  await saveData({
    reports: data.reports,
    reservations: data.reservations,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
  });
  return NextResponse.json({ success: true, id: r.id });
}
