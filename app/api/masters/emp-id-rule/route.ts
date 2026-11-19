import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { assignMissingEmpIds, effectiveNext } from '@/lib/empId';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

// 社員番号の採番ルール（接頭辞・桁数・次の番号）を更新する。管理者のみ。
export const POST = withWriteLock(async function POST(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401 });
  }
  const body: { prefix?: string; digits?: number; next?: number; assignMissing?: boolean } = await req.json();
  const prefix = String(body.prefix ?? '').trim().slice(0, 12);
  const digits = Math.floor(Number(body.digits));
  const next = Math.floor(Number(body.next));
  if (!(digits >= 1 && digits <= 8) || !(next >= 1)) {
    return NextResponse.json({ success: false, message: '桁数は1〜8、次の番号は1以上で指定してください。' }, { status: 400 });
  }
  const data = await loadData();
  data.empIdRule = { prefix, digits, next };
  let assigned = 0;
  if (body.assignMissing) {
    data.empIdRule.next = effectiveNext(data.empIdRule, data.drivers);
    assigned = assignMissingEmpIds(data, data.drivers);
  }
  pushLog(data, {
    actor: 'admin',
    action: '社員番号ルール更新',
    target: `${prefix}${'0'.repeat(digits - 1)}${next}〜`,
    detail: body.assignMissing ? `未設定の運転者に自動採番 ${assigned}件` : undefined,
  });
  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
    empIdRule: data.empIdRule,
  });
  return NextResponse.json({ success: true, assigned });
});
