import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { kvGet, kvSet } from '@/lib/kv';
import { Notice, NOTICES_KEY } from '@/lib/notices';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '削除には管理者ログインが必要です。' }, { status: 401 });
  }
  const list = await kvGet<Notice[]>(NOTICES_KEY, []);
  const target = list.find((n) => n.id === id);
  if (!target) return NextResponse.json({ success: false, message: 'お知らせが見つかりません。' }, { status: 404 });
  await kvSet(NOTICES_KEY, list.filter((n) => n.id !== id));
  const data = await loadData();
  pushLog(data, { actor: 'admin', action: 'お知らせ削除', target: target.title, detail: '' });
  await saveData({ reports: data.reports, vehicles: data.vehicles, drivers: data.drivers, masters: data.masters, logs: data.logs });
  return NextResponse.json({ success: true });
}
