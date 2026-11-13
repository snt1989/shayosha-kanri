import type { NextRequest } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';

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
