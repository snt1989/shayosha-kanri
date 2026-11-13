import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { pushLog } from '@/lib/log';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { removeScheduleNotice } from '@/lib/maint-schedule';

export const dynamic = 'force-dynamic';

// 対応待ちの整備依頼を削除する。削除できるのは、依頼を出した本人（運転者ログイン）・整備士・管理者。
// ダッシュボードから出した依頼（maintOnly）は記録ごと消す。帰着登録で出した依頼は、日報は残して依頼の部分だけ取り消す。
// ※ 運転者・整備士のログインは端末側の確認なので、サーバーでは名前の一致までを見る（編集と同じ程度）。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { driverId?: string; mechanic?: string };
  const data = await loadData();
  const r = data.reports.find((x) => x.id === id);
  if (!r || !r.maintRequest) {
    return NextResponse.json({ success: false, message: '整備依頼が見つかりません。' }, { status: 404 });
  }
  if (r.maintRequestDone) {
    return NextResponse.json({ success: false, message: '対応済の依頼は削除できません。' }, { status: 409 });
  }
  const isAdminReq = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const isMechanic = Boolean(b.mechanic && data.masters.mechanics.includes(b.mechanic));
  const isRequester = Boolean(b.driverId && r.driverId && b.driverId === r.driverId);
  if (!isAdminReq && !isMechanic && !isRequester) {
    return NextResponse.json({ success: false, message: '依頼を出した本人・整備士・管理者だけが削除できます。' }, { status: 403 });
  }

  await removeScheduleNotice(r.id);
  pushLog(data, {
    actor: isAdminReq ? 'admin' : 'user',
    action: '整備依頼を削除',
    target: `${r.date} ${r.driver} / ${r.vehicleName}`,
    detail: `${r.maintRequestType || ''}/${r.maintRequestUrgency || ''}/${r.maintRequestNote || ''}`,
  });
  if (r.maintOnly) {
    data.reports = data.reports.filter((x) => x.id !== id);
  } else {
    r.maintRequest = false;
    r.maintRequestType = '';
    r.maintRequestUrgency = '';
    r.maintRequestNote = '';
    r.maintRequestPhotos = [];
    r.maintRequestDone = false;
    r.maintRequestDoneAt = '';
    r.maintRequestScheduledDate = '';
    r.maintRequestWatch = false;
    r.maintRequestWatchAt = '';
  }
  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
  });
  return NextResponse.json({ success: true });
}
