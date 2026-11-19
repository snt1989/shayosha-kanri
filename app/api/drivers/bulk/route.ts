import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { Driver } from '@/lib/types';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { assignMissingEmpIds } from '@/lib/empId';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

export const POST = withWriteLock(async function POST(req: NextRequest) {
  const list: Driver[] = await req.json();
  const isAdminReq = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const data = await loadData();
  data.drivers = list || [];
  // 社員番号が空欄の行は自動採番（既存の番号は変更しない）
  const assigned = assignMissingEmpIds(data, data.drivers);
  pushLog(data, {
    actor: isAdminReq ? 'admin' : 'user',
    action: '運転者一括更新（CSV／一括編集）',
    target: `${data.drivers.length}件`,
    detail: assigned ? `社員番号を自動採番 ${assigned}件` : undefined,
  });
  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
    empIdRule: data.empIdRule,
  });
  return NextResponse.json({ success: true, count: data.drivers.length });
});
