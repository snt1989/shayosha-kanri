import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { pushLog } from '@/lib/log';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { removeScheduleNotice } from '@/lib/maint-schedule';
import { withWriteLock } from '@/lib/lock';
import { requestTypeState } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// 帰着登録で受け付けた整備依頼の「対応済／対応待ち」だけを更新する。
// 確定済みの日報の内容編集は管理者限定だが、整備依頼への対応記録は整備台帳から誰でも行えるよう、
// 日報本体は変更せずこのフィールドだけを更新する専用のAPIにしている。
export const POST = withWriteLock(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { done?: boolean; watch?: boolean; doneTypes?: string[] };
  const { done } = body;

  const data = await loadData();
  const r = data.reports.find((x) => x.id === id);
  if (!r || !r.maintRequest) {
    return NextResponse.json({ success: false, message: '整備依頼が見つかりません。' }, { status: 404 });
  }

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  let action: string;
  const st = requestTypeState(r);
  const picked = Array.isArray(body.doneTypes) ? st.all.filter((t) => body.doneTypes!.includes(t)) : null;
  const doneNow = picked ? st.all.filter((t) => st.done.includes(t) || picked.includes(t)) : [];
  if (picked && done === undefined && typeof body.watch !== 'boolean' && doneNow.length < st.all.length) {
    // 項目が複数ある依頼の、終わった項目だけを完了にする。残りがあるあいだは、対応待ちのまま
    if (picked.length === 0) return NextResponse.json({ success: false, message: '完了にする項目を選んでください。' }, { status: 400 });
    r.maintRequestDoneTypes = doneNow;
    r.maintRequestDone = false;
    r.maintRequestDoneAt = '';
    action = `整備依頼の一部を完了にした（${picked.join('、')}／残り ${st.all.filter((t) => !doneNow.includes(t)).join('、')}）`;
  } else if (picked && done === undefined && typeof body.watch !== 'boolean') {
    // これで全部の項目が終わった
    r.maintRequestDoneTypes = st.all;
    r.maintRequestDone = true;
    r.maintRequestDoneAt = today;
    r.maintRequestWatch = false;
    r.maintRequestWatchAt = '';
    action = '整備依頼を対応済にした（全項目が完了）';
  } else if (typeof body.watch === 'boolean' && done === undefined) {
    // 経過観察は完了と同じ扱い：対応待ちから外れる（経過観察の印は残す）。解除は印を外すだけ
    if (body.watch) {
      r.maintRequestDone = true;
      r.maintRequestDoneAt = r.maintRequestDoneAt || today;
      r.maintRequestWatch = true;
      r.maintRequestWatchAt = today;
    } else {
      r.maintRequestWatch = false;
      r.maintRequestWatchAt = '';
    }
    action = body.watch ? '整備依頼を経過観察（対応済）にした' : '整備依頼の経過観察の印を外した';
  } else {
    const isDone = Boolean(done);
    r.maintRequestDone = isDone;
    r.maintRequestDoneAt = isDone ? new Date().toISOString().slice(0, 10) : '';
    // 対応済にしたら全項目が完了。対応待ちに戻したら、項目ごとの完了も消す
    if (isDone && st.all.length > 1) r.maintRequestDoneTypes = st.all;
    else delete r.maintRequestDoneTypes;
    // 完了にしたら経過観察は終わり。対応待ちに戻したときも、観察中の印は外す
    r.maintRequestWatch = false;
    r.maintRequestWatchAt = '';
    action = isDone ? '整備依頼を対応済にした' : '整備依頼を対応待ちに戻した';
  }

  // 対応済・経過観察になったら、修理予定日のお知らせは出さない（予定日は記録に残す）
  if (r.maintRequestDone) await removeScheduleNotice(r.id);

  pushLog(data, {
    actor: isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value) ? 'admin' : 'user',
    action,
    target: `${r.date} ${r.driver} / ${r.vehicleName}`,
    detail: `${r.maintRequestType || ''} ${r.maintRequestNote || ''}`.trim(),
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
