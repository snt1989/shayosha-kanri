import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { loadData, saveData } from '@/lib/store';
import { pushLog } from '@/lib/log';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

export const POST = withWriteLock(async function POST(req: NextRequest) {
  if (isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    const data = await loadData();
    pushLog(data, { actor: 'admin', action: '管理者ログアウト', target: '-' });
    await saveData({
      reports: data.reports,
      vehicles: data.vehicles,
      drivers: data.drivers,
      masters: data.masters,
      logs: data.logs,
    });
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
});
