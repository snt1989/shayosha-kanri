import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { pushLog } from '@/lib/log';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { isRequestOpen } from '@/lib/utils';
import { todayJst } from '@/lib/notices';
import { pushConfig, sendPushToAll } from '@/lib/push';
import { jpDate, removeScheduleNotice, scheduleText, upsertScheduleNotice } from '@/lib/maint-schedule';

export const dynamic = 'force-dynamic';

// 整備依頼の「修理予定日」を決める・変える・取り消す。決められるのは、整備士と管理者だけ。
// 決める（または日にちを変える）と、全員向けのお知らせを出して（予定日まで表示）、登録済みの端末に通知を送る。
// ※ 整備士のログインは端末側の確認なので、サーバーでは名前が整備士の一覧にあるかまでを見る（既存の操作と同じ程度）。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { date?: string; mechanic?: string };
  const data = await loadData();
  const r = data.reports.find((x) => x.id === id);
  if (!r || !r.maintRequest) return NextResponse.json({ success: false, message: '整備依頼が見つかりません。' }, { status: 404 });
  if (!isRequestOpen(r)) return NextResponse.json({ success: false, message: '対応済の依頼には、修理予定日を決められません。' }, { status: 409 });

  const isAdminReq = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const isMechanic = Boolean(b.mechanic && data.masters.mechanics.includes(b.mechanic));
  if (!isAdminReq && !isMechanic) return NextResponse.json({ success: false, message: '修理予定日を決められるのは、整備士と管理者だけです。' }, { status: 403 });
  const actor = isAdminReq ? '管理者' : String(b.mechanic);

  const date = String(b.date ?? '').trim();
  const before = r.maintRequestScheduledDate || '';
  const target = `${r.date} ${r.driver} / ${r.vehicleName}`;

  if (!date) {
    // 取り消し
    r.maintRequestScheduledDate = '';
    await removeScheduleNotice(r.id);
    if (before) pushLog(data, { actor: isAdminReq ? 'admin' : 'user', action: '修理予定日を取り消し', target, detail: `${r.maintRequestType || ''} 変更前: ${before}` });
    await saveData({ reports: data.reports, vehicles: data.vehicles, drivers: data.drivers, masters: data.masters, logs: data.logs });
    return NextResponse.json({ success: true, date: '', notified: false });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return NextResponse.json({ success: false, message: '日付が正しくありません。' }, { status: 400 });
  if (date < todayJst()) return NextResponse.json({ success: false, message: '修理予定日は、今日以降の日付にしてください。' }, { status: 400 });

  const changed = date !== before;
  r.maintRequestScheduledDate = date;
  // 日にちが同じなら、お知らせの中身だけ最新に（通知は送り直さない）
  await upsertScheduleNotice(r, date, actor);
  if (changed) {
    pushLog(data, { actor: isAdminReq ? 'admin' : 'user', action: before ? '修理予定日を変更' : '修理予定日を決定', target, detail: `${r.maintRequestType || ''} ${before ? before + ' → ' : ''}${date}（${actor}）` });
  }
  await saveData({ reports: data.reports, vehicles: data.vehicles, drivers: data.drivers, masters: data.masters, logs: data.logs });

  let notified = false;
  if (changed && pushConfig().enabled) {
    const t = scheduleText(r, date);
    try {
      await sendPushToAll({ title: before ? `【変更】${t.title}` : `【修理予定】${r.vehicleName}`, body: before ? `${t.body}（${jpDate(before)}から変更）` : t.body, url: '/' });
      notified = true;
    } catch {
      // 通知に失敗しても、予定日とお知らせは保存済み
    }
  }
  return NextResponse.json({ success: true, date, notified });
}
