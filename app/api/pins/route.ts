import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { PIN_RE, PinKind, checkPin, clearPin, hasPin, loadPins, setPin, setPinCookie } from '@/lib/pins';
import { loadData, saveData } from '@/lib/store';
import { pushLog } from '@/lib/log';
import { withWriteLock } from '@/lib/lock';
import { rateCheck, rateClear, rateFail } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const kindOf = (v: unknown): PinKind | null => (v === 'driver' || v === 'mechanic' ? v : null);

// 暗証番号を設定している人の一覧（ログインのときに、暗証番号を聞くかどうかを決めるため。暗証番号そのものは返さない）
export async function GET() {
  const pins = await loadPins();
  return NextResponse.json({ success: true, drivers: Object.keys(pins.d), mechanics: Object.keys(pins.m) });
}

// 暗証番号を設定・変更する。本人（まだ無いとき／いまの暗証番号を入れたとき）か、管理者。
export const POST = withWriteLock(async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const kind = kindOf(b?.kind);
  const id = typeof b?.id === 'string' ? b.id : '';
  const pin = typeof b?.pin === 'string' ? b.pin : '';
  if (!kind || !id) return NextResponse.json({ success: false, message: '対象が正しくありません。' }, { status: 400 });
  if (!PIN_RE.test(pin)) return NextResponse.json({ success: false, message: '暗証番号は、数字4けたで入力してください。' }, { status: 400 });
  const data = await loadData();
  const driver = kind === 'driver' ? data.drivers.find((d) => d.id === id) : undefined;
  if (kind === 'driver' ? !driver : !data.masters.mechanics.includes(id)) {
    return NextResponse.json({ success: false, message: '登録されていない人です。' }, { status: 404 });
  }
  const isAdmin = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const pins = await loadPins();
  if (!isAdmin && hasPin(pins, kind, id)) {
    const bucket = `pin:${kind}:${id}`;
    const rc = await rateCheck(bucket);
    if (!rc.ok) return NextResponse.json({ success: false, message: `まちがいが続いたため、止めています。${rc.waitMin}分ほど待ってから、やり直してください。` }, { status: 429 });
    if (!checkPin(pins, kind, id, typeof b?.currentPin === 'string' ? b.currentPin : '')) {
      await rateFail(bucket);
      return NextResponse.json({ success: false, message: 'いまの暗証番号がちがいます。' }, { status: 401 });
    }
    await rateClear(bucket);
  }
  await setPin(kind, id, pin);
  const name = driver ? `${driver.lastName} ${driver.firstName}` : id;
  pushLog(data, { actor: isAdmin ? 'admin' : 'user', action: '暗証番号を設定', target: `${kind === 'driver' ? '運転者' : '整備士'} ${name}` });
  await saveData({ reports: data.reports, vehicles: data.vehicles, drivers: data.drivers, masters: data.masters, logs: data.logs });
  const res = NextResponse.json({ success: true });
  if (!isAdmin) setPinCookie(res, kind, id); // 本人が設定した端末は、そのまま確認済みにする
  return res;
});

// 暗証番号を消す（忘れたとき。管理者のみ）
export const DELETE = withWriteLock(async function DELETE(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401 });
  }
  const b = await req.json().catch(() => ({}));
  const kind = kindOf(b?.kind);
  const id = typeof b?.id === 'string' ? b.id : '';
  if (!kind || !id) return NextResponse.json({ success: false, message: '対象が正しくありません。' }, { status: 400 });
  await clearPin(kind, id);
  await rateClear(`pin:${kind}:${id}`);
  const data = await loadData();
  const driver = kind === 'driver' ? data.drivers.find((d) => d.id === id) : undefined;
  pushLog(data, { actor: 'admin', action: '暗証番号を消去', target: `${kind === 'driver' ? '運転者' : '整備士'} ${driver ? `${driver.lastName} ${driver.firstName}` : id}` });
  await saveData({ reports: data.reports, vehicles: data.vehicles, drivers: data.drivers, masters: data.masters, logs: data.logs });
  return NextResponse.json({ success: true });
});
