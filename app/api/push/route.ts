import { NextRequest, NextResponse } from 'next/server';
import { addSub, cleanWho, isValidEndpoint, loadSubs, pushConfig, removeSub } from '@/lib/push';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

// 通知の設定状況（鍵が設定されているか）と、端末が登録に使う公開鍵
export async function GET() {
  return NextResponse.json(pushConfig());
}

// この端末を通知の送り先に登録する（誰でも。自分の端末で「通知を受け取る」を押したとき）
export const POST = withWriteLock(async function POST(req: NextRequest) {
  if (!pushConfig().enabled) {
    return NextResponse.json({ success: false, message: '通知の設定がまだ行われていません（管理者の設定が必要です）。' }, { status: 503 });
  }
  const b = await req.json().catch(() => ({}));
  const endpoint = b?.subscription?.endpoint;
  if (!isValidEndpoint(endpoint)) {
    return NextResponse.json({ success: false, message: '端末の登録情報が正しくありません。' }, { status: 400 });
  }
  // だれの端末か（通知を必要な人だけに送るため）。管理者の印は、管理者ログイン中の端末か、すでに印のある端末だけに付ける
  const wasAdmin = Boolean((await loadSubs()).find((s) => s.endpoint === endpoint)?.who?.admin);
  const who = b?.who ? cleanWho(b.who, isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value) || wasAdmin) : undefined;
  const r = await addSub(endpoint, req.headers.get('user-agent') || '', who);
  if (!r.ok) return NextResponse.json({ success: false, message: '登録できる端末の数の上限に達しています。' }, { status: 409 });
  return NextResponse.json({ success: true });
});

// この端末の登録を解除する
export const DELETE = withWriteLock(async function DELETE(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (!isValidEndpoint(b?.endpoint)) return NextResponse.json({ success: false, message: '端末の登録情報が正しくありません。' }, { status: 400 });
  await removeSub(b.endpoint);
  return NextResponse.json({ success: true });
});
