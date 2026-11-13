import { NextRequest, NextResponse } from 'next/server';
import { loadData } from '@/lib/store';
import { isRequestOpen } from '@/lib/utils';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// 整備依頼を出した運転者の電話番号。管理者、または整備士（x-mechanic に登録済みの整備士名）だけが、
// その運転者の「対応待ちの整備依頼」があるときに限って見られる。
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadData();
  const isAdmin = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const mech = req.headers.get('x-mechanic') ? decodeURIComponent(req.headers.get('x-mechanic') || '') : '';
  const isMechanic = Boolean(mech && data.masters.mechanics.includes(mech));
  if (!isAdmin && !isMechanic) {
    return NextResponse.json({ success: false, message: '連絡先を見るには、整備士か管理者のログインが必要です。' }, { status: 401 });
  }
  const hasOpen = data.reports.some((r) => r.driverId === id && isRequestOpen(r));
  if (!isAdmin && !hasOpen) {
    return NextResponse.json({ success: false, message: '対応待ちの整備依頼がありません。' }, { status: 403 });
  }
  const d = data.drivers.find((x) => x.id === id);
  return NextResponse.json({ success: true, phone: (d?.phone || '').trim() });
}
