import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { MASTER_LABELS, MasterKey } from '@/lib/types';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

export const POST = withWriteLock(async function POST(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401 });
  }
  const { category, items }: { category: MasterKey; items: string[] } = await req.json();
  const data = await loadData();
  data.masters[category] = items || [];
  pushLog(data, {
    actor: 'admin',
    action: 'マスタ更新',
    target: MASTER_LABELS[category] || category,
    detail: `${(items || []).length}件`,
  });
  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
  });
  return NextResponse.json({ success: true });
});
