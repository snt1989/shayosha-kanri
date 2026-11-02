import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { Vehicle } from '@/lib/types';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const v: Vehicle = await req.json();
  const isNew = !v.id;
  if (!v.id) {
    v.id = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  if (!v.maintHistory) v.maintHistory = [];

  const isAdminReq = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const data = await loadData();
  const idx = data.vehicles.findIndex((x) => x.id === v.id);
  if (idx >= 0) {
    // 画面が古いまま保存されても、保存済みの車検証画像の印は消さない（画像の保存・削除は専用のAPIだけで行う）
    const keep = data.vehicles[idx].shakenFileAt;
    if (keep) v.shakenFileAt = keep;
    else delete v.shakenFileAt;
    data.vehicles[idx] = v;
  } else {
    delete v.shakenFileAt;
    data.vehicles.push(v);
  }

  pushLog(data, {
    actor: isAdminReq ? 'admin' : 'user',
    action: isNew || idx < 0 ? '車両新規登録' : '車両更新',
    target: v.name,
    detail: v.plate,
  });

  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
  });

  return NextResponse.json({ success: true, id: v.id });
}
