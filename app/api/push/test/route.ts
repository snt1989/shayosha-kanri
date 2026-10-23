import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushConfig, sendPushToAll } from '@/lib/push';

export const dynamic = 'force-dynamic';

// テスト送信（管理者のみ）。登録済みのすべての端末に届く。
export async function POST(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401 });
  }
  if (!pushConfig().enabled) {
    return NextResponse.json({ success: false, message: '通知の設定（VAPID鍵）がまだ行われていません。' }, { status: 503 });
  }
  const r = await sendPushToAll({ title: 'テスト通知', body: '社用車管理アプリからのテスト通知です。届いていれば設定は完了です。', url: '/?notices=1' });
  return NextResponse.json({ success: true, ...r });
}
