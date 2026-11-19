import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_SESSION_HOURS, adminPasswordConfigured, adminSessionToken, checkAdminPassword } from '@/lib/admin';
import { loadData, saveData } from '@/lib/store';
import { pushLog } from '@/lib/log';
import { clientIp, rateCheck, rateClear, rateFail } from '@/lib/rate-limit';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

export const POST = withWriteLock(async function POST(req: NextRequest) {
  if (!adminPasswordConfigured()) {
    return NextResponse.json(
      { success: false, message: 'サーバーに ADMIN_PASSWORD が設定されていません。Vercelの環境変数を設定してください。' },
      { status: 500 }
    );
  }

  // 総当たり対策：同じ接続元から15分に5回まちがえると、15分のあいだ受け付けない
  const bucket = `admin:${clientIp(req)}`;
  const rc = await rateCheck(bucket);
  if (!rc.ok) {
    return NextResponse.json({ success: false, message: `まちがいが続いたため、ログインを止めています。約${rc.waitMin}分後に、もう一度お試しください。` }, { status: 429 });
  }
  const { password } = await req.json().catch(() => ({ password: '' }));
  if (!checkAdminPassword(String(password || ''))) {
    const f = await rateFail(bucket);
    return NextResponse.json(
      { success: false, message: f.locked ? 'パスワードが違います。まちがいが続いたため、15分のあいだログインを止めます。' : `パスワードが違います。（あと${f.left}回まちがえると、15分のあいだ止まります）` },
      { status: 401 }
    );
  }
  await rateClear(bucket);

  const data = await loadData();
  pushLog(data, { actor: 'admin', action: '管理者ログイン', target: '-' });
  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
  });

  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_COOKIE, adminSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * ADMIN_SESSION_HOURS,
  });
  return res;
});
