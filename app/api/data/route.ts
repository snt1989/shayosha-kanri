import { NextRequest, NextResponse } from 'next/server';
import { loadData } from '@/lib/store';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { kvGet } from '@/lib/kv';
import { ALERT_SETTINGS_KEY, normalizeAlertSettings } from '@/lib/alert-settings';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const loaded = await loadData();
  // アラートを出す時期の設定も一緒に返す（各画面のアラートの判定に使う）
  const data = { ...loaded, alertSettings: normalizeAlertSettings(await kvGet(ALERT_SETTINGS_KEY, null)) };
  // 運転者の電話番号は、管理者のログイン中だけ返す（整備士は、整備依頼の連絡用に /api/drivers/[id]/contact で見る）
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ ...data, drivers: data.drivers.map((d) => ({ ...d, phone: '' })) });
  }
  return NextResponse.json(data);
}
