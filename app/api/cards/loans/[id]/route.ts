import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { loadData } from '@/lib/store';
import { loadCards, saveCards } from '@/lib/cards-store';

export const dynamic = 'force-dynamic';

// カードを返却する。返却は誰でも記録できる（記録者の名前を残す）。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { driverId?: string };
  const d = await loadCards();
  const loan = d.loans.find((l) => l.id === id);
  if (!loan) return NextResponse.json({ success: false, message: '貸出の記録が見つかりません。' }, { status: 404 });
  if (loan.returnedAt) return NextResponse.json({ success: false, message: 'すでに返却済みです。' }, { status: 409 });
  let by = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value) ? '管理者' : '';
  if (!by && b.driverId) {
    const driver = (await loadData()).drivers.find((x) => x.id === b.driverId);
    if (driver) by = `${driver.lastName} ${driver.firstName}`.trim();
  }
  loan.returnedAt = new Date().toISOString();
  loan.returnedBy = by;
  await saveCards(d);
  return NextResponse.json({ success: true });
}

// 貸出の記録を削除（入力の間違いの訂正用。管理者のみ）
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401 });
  }
  const { id } = await params;
  const d = await loadCards();
  d.loans = d.loans.filter((l) => l.id !== id);
  await saveCards(d);
  return NextResponse.json({ success: true });
}
