import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { MAINT_URGENCIES } from '@/lib/types';
import { pushLog } from '@/lib/log';
import { cleanPhotoIds } from '@/lib/photo-ids';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// 対応待ちの整備依頼の内容（種類・緊急度・内容。ダッシュボードから出した依頼は車両も）を直す。
// 編集できるのは、依頼を出した本人（運転者ログイン）・整備士・管理者。対応済の依頼は編集できない。
// ※ 運転者・整備士のログインは端末側の確認なので、サーバーでは名前の一致までを見る（既存の対応済の操作と同じ程度）。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as {
    type?: string;
    urgency?: string;
    note?: string;
    vehicleId?: string;
    driverId?: string;
    mechanic?: string;
    photos?: string[];
  };
  const data = await loadData();
  const r = data.reports.find((x) => x.id === id);
  if (!r || !r.maintRequest) {
    return NextResponse.json({ success: false, message: '整備依頼が見つかりません。' }, { status: 404 });
  }
  if (r.maintRequestDone) {
    return NextResponse.json({ success: false, message: '対応済の依頼は編集できません。先に「対応待ちに戻す」にしてください。' }, { status: 409 });
  }
  const isAdminReq = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const isMechanic = Boolean(b.mechanic && data.masters.mechanics.includes(b.mechanic));
  const isRequester = Boolean(b.driverId && r.driverId && b.driverId === r.driverId);
  if (!isAdminReq && !isMechanic && !isRequester) {
    return NextResponse.json({ success: false, message: '依頼を出した本人・整備士・管理者だけが編集できます。' }, { status: 403 });
  }
  const note = String(b.note || '').trim().slice(0, 500);
  if (!note) return NextResponse.json({ success: false, message: '依頼の内容は必須です。' }, { status: 400 });

  const before = `${r.maintRequestType || ''}/${r.maintRequestUrgency || ''}/${r.maintRequestNote || ''}/${r.vehicleName}`;
  r.maintRequestType = String(b.type ?? r.maintRequestType ?? '').trim().slice(0, 40);
  r.maintRequestUrgency = (MAINT_URGENCIES as readonly string[]).includes(String(b.urgency)) ? String(b.urgency) : r.maintRequestUrgency || MAINT_URGENCIES[0];
  r.maintRequestNote = note;
  if (Array.isArray(b.photos)) r.maintRequestPhotos = cleanPhotoIds(b.photos);
  if (r.maintOnly && b.vehicleId && b.vehicleId !== r.vehicleId) {
    const v = data.vehicles.find((x) => x.id === b.vehicleId);
    if (!v) return NextResponse.json({ success: false, message: '車両が見つかりません。' }, { status: 404 });
    r.vehicleId = v.id;
    r.vehicleName = v.name;
    r.plate = v.plate;
  }
  pushLog(data, {
    actor: isAdminReq ? 'admin' : 'user',
    action: '整備依頼を編集',
    target: `${r.date} ${r.driver} / ${r.vehicleName}`,
    detail: `変更前: ${before}\n変更後: ${r.maintRequestType}/${r.maintRequestUrgency}/${r.maintRequestNote}/${r.vehicleName}`,
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
