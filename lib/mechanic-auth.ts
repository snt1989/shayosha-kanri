import type { NextRequest } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { loadPins, pinVerified } from '@/lib/pins';

// 管理者、または「登録済みの整備士」の名前（ヘッダー x-mechanic、または画像用の ?mech=）を持つ人。
// 整備士ログインは名前を選ぶだけの簡易なもの（連絡先の表示と同じ強さ）。
export function mechanicNameOf(req: NextRequest): string {
  const raw = req.headers.get('x-mechanic') || new URL(req.url).searchParams.get('mech') || '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return '';
  }
}

export function isAdminOrMechanic(req: NextRequest, mechanics: string[]): boolean {
  if (isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) return true;
  const m = mechanicNameOf(req);
  return Boolean(m && mechanics.includes(m));
}

// 暗証番号も確かめる版。暗証番号を設定している整備士の名前では、確認済みの端末だけを通す。
export async function isAdminOrMechanicP(req: NextRequest, mechanics: string[]): Promise<boolean> {
  if (isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) return true;
  const m = mechanicNameOf(req);
  if (!m || !mechanics.includes(m)) return false;
  return pinVerified(req, await loadPins(), 'mechanic', m);
}
// 本文で送られた整備士の名前（b.mechanic）を確かめる。登録済みで、暗証番号があれば確認済みの端末であること。
export async function mechanicClaimOk(req: NextRequest, mechanics: string[], name: unknown): Promise<boolean> {
  if (typeof name !== 'string' || !name || !mechanics.includes(name)) return false;
  return pinVerified(req, await loadPins(), 'mechanic', name);
}
export async function driverClaimOk(req: NextRequest, driverId: unknown): Promise<boolean> {
  if (typeof driverId !== 'string' || !driverId) return true;
  return pinVerified(req, await loadPins(), 'driver', driverId);
}
