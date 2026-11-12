import { NextRequest, NextResponse } from 'next/server';
import { loadData } from '@/lib/store';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const data = await loadData();
  // 運転者の電話番号は、管理者のログイン中だけ返す（整備士は、整備依頼の連絡用に /api/drivers/[id]/contact で見る）
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ ...data, drivers: data.drivers.map((d) => ({ ...d, phone: '' })) });
  }
  return NextResponse.json(data);
}
