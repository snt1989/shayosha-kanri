import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { kvGet, kvSet } from '@/lib/kv';
import { loadData, saveData } from '@/lib/store';
import { pushLog } from '@/lib/log';
import { sendPushToAll } from '@/lib/push';
import { cleanPhotoIds } from '@/lib/photo-ids';
import { INCIDENTS_KEY, INCIDENTS_MAX, INCIDENT_INJURY, INCIDENT_KINDS, Incident } from '@/lib/incidents';

export const dynamic = 'force-dynamic';

// 報告の一覧（管理者のみ。けがや事故の内容を含むため）
export async function GET(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '事故・トラブルの報告を見るには、管理者ログインが必要です。' }, { status: 401 });
  }
  const list = await kvGet<Incident[]>(INCIDENTS_KEY, []);
  return NextResponse.json({ success: true, incidents: list });
}

const s = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

// 報告する。緊急のときに使うので、ログインは求めない（運転者の名前は画面で選ぶ）。管理者と、通知を受け取る端末に通知を送る。
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const data = await loadData();
  const kind = INCIDENT_KINDS.includes(b.kind) ? b.kind : INCIDENT_KINDS[0];
  const driverRec = b.driverId ? data.drivers.find((d) => d.id === b.driverId) : undefined;
  const driver = driverRec ? `${driverRec.lastName} ${driverRec.firstName}` : s(b.driver, 40);
  if (!driver) return NextResponse.json({ success: false, message: '運転者の名前を入れてください。' }, { status: 400 });
  const v = b.vehicleId ? data.vehicles.find((x) => x.id === b.vehicleId) : undefined;
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  const hasPos = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  const inc: Incident = {
    id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    at: new Date().toISOString(),
    kind,
    ...(driverRec ? { driverId: driverRec.id } : {}),
    driver,
    ...(v ? { vehicleId: v.id } : {}),
    vehicleName: v ? v.name : s(b.vehicleName, 40),
    plate: v ? v.plate : '',
    place: s(b.place, 200),
    ...(hasPos ? { lat, lng } : {}),
    injury: INCIDENT_INJURY.includes(b.injury) ? b.injury : INCIDENT_INJURY[2],
    police: Boolean(b.police),
    otherParty: Boolean(b.otherParty),
    canDrive: Boolean(b.canDrive),
    note: s(b.note, 1000),
    photos: cleanPhotoIds(b.photos),
    status: 'open',
  };
  const list = await kvGet<Incident[]>(INCIDENTS_KEY, []);
  await kvSet(INCIDENTS_KEY, [inc, ...list].slice(0, INCIDENTS_MAX));

  pushLog(data, { actor: 'user', action: '事故・トラブルの報告', target: `${driver} / ${inc.vehicleName || '車両未選択'}`, detail: `${kind} ${inc.injury}` });
  await saveData({ reports: data.reports, vehicles: data.vehicles, drivers: data.drivers, masters: data.masters, logs: data.logs });

  const push = await sendPushToAll({
    title: `【事故・トラブル】${driver}さん`,
    body: `${inc.vehicleName ? inc.vehicleName + '：' : ''}${kind}（${inc.injury}）${inc.note ? ' ' + inc.note : ''}`,
    url: '/',
    urgent: true,
  }).catch(() => null);
  return NextResponse.json({ success: true, id: inc.id, push });
}
