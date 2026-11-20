import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { kvGet, kvSet } from '@/lib/kv';
import { withWriteLock } from '@/lib/lock';
import { driverClaimOk, mechanicClaimOk } from '@/lib/mechanic-auth';
import { PIN_DENY_MESSAGE } from '@/lib/pins';
import { loadData } from '@/lib/store';
import { TRAFFIC_SPOTS_KEY, TRAFFIC_SPOTS_MAX, TrafficSpot, cleanSpot } from '@/lib/traffic';

export const dynamic = 'force-dynamic';

// 社内で共有する「注意地点」（オービス・取締りの多い場所・事故の多い場所）。見るのは誰でも。
export async function GET() {
  return NextResponse.json({ success: true, spots: await kvGet<TrafficSpot[]>(TRAFFIC_SPOTS_KEY, []) });
}

// 登録：運転者・整備士としてログインしている人か、管理者
export const POST = withWriteLock(async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const isAdmin = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const data = await loadData();
  const driver = typeof b.driverId === 'string' ? data.drivers.find((d) => d.id === b.driverId) : undefined;
  const mech = typeof b.mechanic === 'string' && (await mechanicClaimOk(req, data.masters.mechanics, b.mechanic)) ? b.mechanic : '';
  if (!isAdmin && !driver && !mech) return NextResponse.json({ success: false, message: '登録するには、運転者か整備士としてログインしてください。' }, { status: 401 });
  if (!isAdmin && driver && !(await driverClaimOk(req, driver.id))) return NextResponse.json({ success: false, message: PIN_DENY_MESSAGE, pin: true }, { status: 401 });
  const clean = cleanSpot(b);
  if (!clean) return NextResponse.json({ success: false, message: '場所の名前を入力してください。' }, { status: 400 });
  const list = await kvGet<TrafficSpot[]>(TRAFFIC_SPOTS_KEY, []);
  if (list.length >= TRAFFIC_SPOTS_MAX) return NextResponse.json({ success: false, message: `登録できるのは${TRAFFIC_SPOTS_MAX}件までです。古いものを消してから、登録してください。` }, { status: 409 });
  const spot: TrafficSpot = {
    id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ...clean,
    by: driver ? `${driver.lastName} ${driver.firstName}`.trim() : mech || '管理者',
    ...(driver ? { byId: driver.id } : {}),
    createdAt: new Date().toISOString(),
  };
  await kvSet(TRAFFIC_SPOTS_KEY, [spot, ...list]);
  return NextResponse.json({ success: true, spot });
});

// 削除：管理者か、登録した本人（運転者）
export const DELETE = withWriteLock(async function DELETE(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { id?: string; driverId?: string };
  const list = await kvGet<TrafficSpot[]>(TRAFFIC_SPOTS_KEY, []);
  const spot = list.find((x) => x.id === b.id);
  if (!spot) return NextResponse.json({ success: false, message: '見つかりません。' }, { status: 404 });
  const isAdmin = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const mine = Boolean(b.driverId && spot.byId && b.driverId === spot.byId) && (await driverClaimOk(req, b.driverId));
  if (!isAdmin && !mine) return NextResponse.json({ success: false, message: '消せるのは、登録した本人か管理者です。' }, { status: 403 });
  await kvSet(TRAFFIC_SPOTS_KEY, list.filter((x) => x.id !== spot.id));
  return NextResponse.json({ success: true });
});
