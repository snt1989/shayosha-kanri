import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { applyBackup, loadSnapshot, parseBackup, saveSnapshot } from '@/lib/backup';
import { loadData, saveData } from '@/lib/store';
import { pushLog } from '@/lib/log';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// バックアップから復元する（管理者のみ）。{ id } で毎晩の控えから、{ backup } でダウンロードしたファイルから。
// 戻す直前の状態を「pre-restore」の控えとして残すので、まちがえても1回は元に戻せる。
export const POST = withWriteLock(async function POST(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (body?.confirm !== '復元') {
    return NextResponse.json({ success: false, message: '確認の文字（復元）が入力されていません。' }, { status: 400 });
  }
  const source = typeof body?.id === 'string' ? await loadSnapshot(body.id) : parseBackup(body?.backup);
  if (!source) {
    return NextResponse.json({ success: false, message: 'バックアップの形が正しくないか、見つかりません。このアプリで作ったバックアップのファイルを選んでください。' }, { status: 400 });
  }
  if (body?.id !== 'pre-restore') await saveSnapshot('pre-restore');
  const r = await applyBackup(source);
  const data = await loadData();
  pushLog(data, { actor: 'admin', action: 'バックアップから復元', target: typeof body?.id === 'string' ? `控え ${body.id}` : 'ファイル', detail: `作成 ${source.createdAt || '不明'} / 日報${source.data.reports.length}件・車両${source.data.vehicles.length}台・運転者${source.data.drivers.length}名` });
  await saveData({ reports: data.reports, vehicles: data.vehicles, drivers: data.drivers, masters: data.masters, logs: data.logs });
  return NextResponse.json({ success: true, restoredKeys: r.keys, reports: source.data.reports.length, vehicles: source.data.vehicles.length, drivers: source.data.drivers.length, createdAt: source.createdAt });
});
