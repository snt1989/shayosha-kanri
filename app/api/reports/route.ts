import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { Report } from '@/lib/types';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const r: Report = await req.json();
  if (!r.id) {
    r.id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  r.driver = `${r.driverLast} ${r.driverFirst}`.trim();

  const isAdminReq = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const data = await loadData();
  const idx = data.reports.findIndex((x) => x.id === r.id);
  const wasCompleted = idx >= 0 && data.reports[idx].postDone;

  // 既に「帰着済」として確定している日報の再編集（内容の書き換え）は、記録の改ざん防止のため
  // 管理者ログイン必須とする。新規登録や、まだ出庫中の日報を自分で帰着登録する操作は誰でも可能。
  // 入力した本人（運転者ログイン）は、自分の確定済みの日報を編集できる。
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
  if (wasCompleted && !isAdminReq && !isOwner) {
    return NextResponse.json(
      { success: false, message: '確定済みの日報を編集できるのは、入力した本人か管理者です。' },
      { status: 401 }
    );
  }
  // 本人による編集では、運転者そのものは書き換えさせない
  if (existing && isOwner && !isAdminReq) {
    r.driverId = existing.driverId;
    r.driverLast = existing.driverLast;
    r.driverFirst = existing.driverFirst;
    r.driver = existing.driver;
  }

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
}
