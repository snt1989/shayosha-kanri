import { NextRequest, NextResponse } from 'next/server';
import { PIN_COOKIE, PinKind, checkPin, hasPin, loadPins, pinTokenId, setPinCookie } from '@/lib/pins';
import { withWriteLock } from '@/lib/lock';
import { rateCheck, rateClear, rateFail } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// この端末が、だれの暗証番号を確認済みか
export async function GET(req: NextRequest) {
  return NextResponse.json({
    success: true,
    driver: pinTokenId('driver', req.cookies.get(PIN_COOKIE.driver)?.value),
    mechanic: pinTokenId('mechanic', req.cookies.get(PIN_COOKIE.mechanic)?.value),
  });
}

// ログインのときの、暗証番号の確認。合っていれば、この端末を確認済みにする（90日）。5回まちがえると15分止まる。
export const POST = withWriteLock(async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const kind: PinKind | null = b?.kind === 'driver' || b?.kind === 'mechanic' ? b.kind : null;
  const id = typeof b?.id === 'string' ? b.id : '';
  if (!kind || !id) return NextResponse.json({ success: false, message: '対象が正しくありません。' }, { status: 400 });
  const pins = await loadPins();
  if (!hasPin(pins, kind, id)) return NextResponse.json({ success: true, none: true });
  const bucket = `pin:${kind}:${id}`;
  const rc = await rateCheck(bucket);
  if (!rc.ok) return NextResponse.json({ success: false, message: `まちがいが続いたため、止めています。${rc.waitMin}分ほど待ってから、やり直してください。` }, { status: 429 });
  if (!checkPin(pins, kind, id, typeof b?.pin === 'string' ? b.pin : '')) {
    const f = await rateFail(bucket);
    return NextResponse.json({ success: false, message: f.locked ? '暗証番号がちがいます。まちがいが続いたため、15分ほど止めます。' : `暗証番号がちがいます（あと${f.left}回）。` }, { status: 401 });
  }
  await rateClear(bucket);
  const res = NextResponse.json({ success: true });
  setPinCookie(res, kind, id);
  return res;
});

// ログアウトしたとき、この端末の確認済みを消す
export async function DELETE(req: NextRequest) {
  const kind = new URL(req.url).searchParams.get('kind');
  const res = NextResponse.json({ success: true });
  if (kind === 'driver' || kind === 'mechanic') res.cookies.set(PIN_COOKIE[kind], '', { path: '/', maxAge: 0 });
  return res;
}
