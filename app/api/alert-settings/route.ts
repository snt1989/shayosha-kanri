import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { kvGet, kvSet } from '@/lib/kv';
import { loadData, saveData } from '@/lib/store';
import { pushLog } from '@/lib/log';
import { ALERT_SETTINGS_KEY, normalizeAlertSettings } from '@/lib/alert-settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ settings: normalizeAlertSettings(await kvGet(ALERT_SETTINGS_KEY, null)) });
}

// アラートを出す時期の保存（管理者のみ）
export async function POST(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: 'アラートの設定には管理者ログインが必要です。' }, { status: 401 });
  }
  const b = await req.json().catch(() => ({}));
  const settings = normalizeAlertSettings(b);
  await kvSet(ALERT_SETTINGS_KEY, settings);
  const data = await loadData();
  pushLog(data, { actor: 'admin', action: 'アラート設定更新', target: 'アラートを出す時期', detail: `車検${settings.shakenDays}日前・免許${settings.licenseDays}日前・オイル残り${settings.oilKm}km` });
  await saveData({ reports: data.reports, vehicles: data.vehicles, drivers: data.drivers, masters: data.masters, logs: data.logs });
  return NextResponse.json({ success: true, settings });
}
