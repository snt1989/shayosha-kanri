import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { kvGet, kvSet } from '@/lib/kv';
import { loadData, saveData } from '@/lib/store';
import { pushLog } from '@/lib/log';
import { INCIDENT_CONTACTS_KEY, IncidentContact, cleanContacts } from '@/lib/incidents';

export const dynamic = 'force-dynamic';

// 緊急連絡先（管理者・保険会社・ロードサービスなど）。事故のときに誰でも電話できるよう、誰でも見られる
export async function GET() {
  return NextResponse.json({ contacts: cleanContacts(await kvGet<IncidentContact[]>(INCIDENT_CONTACTS_KEY, [])) });
}

export async function POST(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '緊急連絡先の設定には管理者ログインが必要です。' }, { status: 401 });
  }
  const b = await req.json().catch(() => ({}));
  const contacts = cleanContacts(b.contacts);
  await kvSet(INCIDENT_CONTACTS_KEY, contacts);
  const data = await loadData();
  pushLog(data, { actor: 'admin', action: '緊急連絡先更新', target: '緊急連絡先', detail: `${contacts.length}件` });
  await saveData({ reports: data.reports, vehicles: data.vehicles, drivers: data.drivers, masters: data.masters, logs: data.logs });
  return NextResponse.json({ success: true, contacts });
}
