import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

const jst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString(); // 日本時間

async function persist(data: Awaited<ReturnType<typeof loadData>>) {
  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
    rentals: data.rentals,
    reservations: data.reservations,
  });
}

// レンタカーの返却（返却日・時刻・返却者を記録）。管理者でなくても行える。
export const POST = withWriteLock(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body: { date?: string; time?: string; by?: string; byId?: string } = await req.json().catch(() => ({}));
  const data = await loadData();
  const r = data.rentals.find((x) => x.id === id);
  if (!r) return NextResponse.json({ success: false, message: 'レンタカーが見つかりません。' }, { status: 404 });
  if (r.returnedAt) return NextResponse.json({ success: false, message: `すでに返却済みです（${r.returnedAt}）。` }, { status: 409 });

  const by = String(body.by || '').trim();
  if (!by) return NextResponse.json({ success: false, message: '返却者を選ぶか、名前を入力してください。' }, { status: 400 });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? (body.date as string) : jst().slice(0, 10);
  const time = /^\d{2}:\d{2}$/.test(body.time || '') ? (body.time as string) : jst().slice(11, 16);
  if (date < r.startDate) {
    return NextResponse.json({ success: false, message: '返却日は利用開始日以降にしてください。' }, { status: 400 });
  }
  r.returnedAt = date;
  r.returnedTime = time;
  r.returnedBy = by;
  r.returnedById = body.byId || undefined;
  // 返却日より後の予約は、レンタカーがもう無いので取り消す
  const before = data.reservations.length;
  data.reservations = data.reservations.filter((x) => x.rentalId !== r.id || x.startDate <= date);
  const cancelled = before - data.reservations.length;

  pushLog(data, {
    actor: isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value) ? 'admin' : 'user',
    action: 'レンタカー返却',
    target: `${r.company} ${r.carModel || ''}`.trim(),
    detail: `${date} ${time} 返却者: ${by}${cancelled ? ` / 返却日より後の予約${cancelled}件を取消` : ''}`,
  });
  await persist(data);
  return NextResponse.json({ success: true });
});

// 返却の取り消し（押し間違いなど）。利用中に戻す。
export const DELETE = withWriteLock(async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadData();
  const r = data.rentals.find((x) => x.id === id);
  if (!r) return NextResponse.json({ success: false, message: 'レンタカーが見つかりません。' }, { status: 404 });
  if (!r.returnedAt) return NextResponse.json({ success: false, message: '返却済みではありません。' }, { status: 409 });
  const was = `${r.returnedAt} ${r.returnedTime || ''} ${r.returnedBy || ''}`.trim();
  r.returnedAt = undefined;
  r.returnedTime = undefined;
  r.returnedBy = undefined;
  r.returnedById = undefined;

  pushLog(data, {
    actor: isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value) ? 'admin' : 'user',
    action: 'レンタカー返却取消',
    target: `${r.company} ${r.carModel || ''}`.trim(),
    detail: was,
  });
  await persist(data);
  return NextResponse.json({ success: true });
});
