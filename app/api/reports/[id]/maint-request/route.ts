import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { pushLog } from '@/lib/log';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// 帰着登録で受け付けた整備依頼の「対応済／対応待ち」だけを更新する。
// 確定済みの日報の内容編集は管理者限定だが、整備依頼への対応記録は整備台帳から誰でも行えるよう、
// 日報本体は変更せずこのフィールドだけを更新する専用のAPIにしている。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { done?: boolean; watch?: boolean };
  const { done } = body;

  const data = await loadData();
  const r = data.reports.find((x) => x.id === id);
  if (!r || !r.maintRequest) {
    return NextResponse.json({ success: false, message: '整備依頼が見つかりません。' }, { status: 404 });
  }

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  let action: string;
  if (typeof body.watch === 'boolean' && done === undefined) {
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
    // 完了にしたら経過観察は終わり。対応待ちに戻したときも、観察中の印は外す
    r.maintRequestWatch = false;
    r.maintRequestWatchAt = '';
    action = isDone ? '整備依頼を対応済にした' : '整備依頼を対応待ちに戻した';
  }

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
}
