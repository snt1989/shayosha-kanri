import { appendEdit } from '@/lib/report-edit';
import { driverClaimOk } from '@/lib/mechanic-auth';
import { PIN_DENY_MESSAGE } from '@/lib/pins';
import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { Report } from '@/lib/types';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { maintBlockIn, maintBlocks } from '@/lib/utils';
import { jpDate } from '@/lib/schedule-text';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

export const POST = withWriteLock(async function POST(req: NextRequest) {
  const r: Report = await req.json();
  if (!r.id) {
    r.id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  r.driver = `${r.driverLast} ${r.driverFirst}`.trim();

  const isAdminReq = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const data = await loadData();
  const idx = data.reports.findIndex((x) => x.id === r.id);
  const wasCompleted = idx >= 0 && data.reports[idx].postDone;

  // 登録済みの日報の編集（出庫中の編集・帰着登録、帰着済みの書き換え）ができるのは、記入した本人と管理者だけ。
  // 新規登録は誰でも可能。
  // ※ 運転者のログインは端末側の確認なので、サーバーでは運転者IDが日報の運転者と一致するかまでを見る。
  const existing = idx >= 0 ? data.reports[idx] : null;
  const editorId = req.headers.get('x-driver-id') || '';
  const editor = editorId ? data.drivers.find((d) => d.id === editorId) : undefined;
  const isOwner = Boolean(
    existing &&
      editor &&
      (existing.driverId
        ? existing.driverId === editor.id
        : existing.driver.replace(/\s/g, '') === `${editor.lastName}${editor.firstName}`)
  );
  if (existing && !isAdminReq && !isOwner) {
    return NextResponse.json(
      { success: false, message: 'この日報を編集できるのは、記入した本人か管理者です。' },
      { status: 401 }
    );
  }
  // 暗証番号を設定している運転者の名前で登録・編集するときは、暗証番号を確認済みの端末だけ（管理者は除く）
  const claim = existing ? (isOwner && editor ? editor.id : '') : r.driverId || '';
  if (!isAdminReq && claim && !(await driverClaimOk(req, claim))) {
    return NextResponse.json({ success: false, message: PIN_DENY_MESSAGE, pin: true }, { status: 401 });
  }
  // 本人による編集では、運転者そのものは書き換えさせない
  if (existing && isOwner && !isAdminReq) {
    r.driverId = existing.driverId;
    r.driverLast = existing.driverLast;
    r.driverFirst = existing.driverFirst;
    r.driver = existing.driver;
  }

  // 修理予定日が決まっている車両は、その日は使えない（新しい出庫の登録だけ止める。登録済みの日報の編集・帰着登録は止めない）
  if (idx < 0 && !r.maintOnly && r.vehicleId) {
    const blocked = maintBlockIn(maintBlocks(data.reports), r.vehicleId, r.date, r.date);
    if (blocked) {
      return NextResponse.json(
        { success: false, message: `${blocked.vehicleName} は ${jpDate(blocked.date)} に整備（${blocked.type}）の予定が入っているため、その日は使えません。別の車両を選んでください。` },
        { status: 409 }
      );
    }
  }

  // 番号と修正の履歴は、サーバーで持つ（端末から送られた値は使わない）。帰着済みの日報を直したら、何を変えたかを残す
  if (existing) {
    r.code = existing.code;
    r.editLog = wasCompleted ? appendEdit(existing, r, isAdminReq ? '管理者' : editor ? `${editor.lastName} ${editor.firstName}` : '利用者') : existing.editLog;
  } else {
    delete r.code;
    delete r.editLog;
  }
  if (!r.code) delete r.code;
  if (!r.editLog) delete r.editLog;

  if (idx >= 0) {
    data.reports[idx] = r;
  } else {
    data.reports.unshift(r);
  }

  if (r.postDone && r.vehicleId && r.endKm) {
    const v = data.vehicles.find((x) => x.id === r.vehicleId);
    if (v && r.endKm > v.odometer) {
      v.odometer = r.endKm;
    }
  }

  pushLog(data, {
    actor: isAdminReq ? 'admin' : 'user',
    action: idx < 0 ? '日報新規登録' : wasCompleted ? (isAdminReq ? '日報編集（確定済み）' : '日報編集（確定済み・本人）') : r.postDone ? '日報帰着登録' : '日報更新',
    target: `${r.date} ${r.driver} / ${r.vehicleName}`,
    detail: r.destination,
  });

  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
  });

  return NextResponse.json({ success: true, id: r.id });
});
