import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { kvGet, kvSet } from '@/lib/kv';
import { loadData, saveData } from '@/lib/store';
import { pushLog } from '@/lib/log';
import { DEFAULT_INSURANCE, INSURANCE_KEY, Insurance, cleanInsurance } from '@/lib/insurance';

export const dynamic = 'force-dynamic';

// 加入している保険の情報。事故のときに、ログインしていなくても証券番号などを伝えられるよう、誰でも見られる
export async function GET() {
  const saved = await kvGet<Insurance | null>(INSURANCE_KEY, null);
  return NextResponse.json({ insurance: saved === null ? DEFAULT_INSURANCE : cleanInsurance(saved) });
}

export async function POST(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '保険の情報の設定には管理者ログインが必要です。' }, { status: 401 });
  }
  const b = await req.json().catch(() => ({}));
  const insurance = cleanInsurance(b.insurance);
  await kvSet(INSURANCE_KEY, insurance);
  const data = await loadData();
  pushLog(data, { actor: 'admin', action: '保険情報更新', target: '加入保険', detail: `${insurance.company} ${insurance.product}` });
  await saveData({ reports: data.reports, vehicles: data.vehicles, drivers: data.drivers, masters: data.masters, logs: data.logs });
  return NextResponse.json({ success: true, insurance });
}
