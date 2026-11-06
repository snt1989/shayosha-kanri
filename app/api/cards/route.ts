import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { activeLoanOf, loadCards, saveCards } from '@/lib/cards-store';
import { CARD_KINDS, FleetCard } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await loadCards(), { headers: { 'Cache-Control': 'no-store' } });
}

// カードの登録・編集（管理者のみ）
export async function POST(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: 'カードの登録・編集には管理者ログインが必要です。' }, { status: 401 });
  }
  const b = (await req.json().catch(() => ({}))) as Partial<FleetCard>;
  const name = String(b.name || '').trim().slice(0, 40);
  const kind = CARD_KINDS.find((k) => k.key === b.kind)?.key;
  if (!name || !kind) return NextResponse.json({ success: false, message: '種類とカード名は必須です。' }, { status: 400 });
  const d = await loadCards();
  const card: FleetCard = {
    id: b.id && d.cards.some((c) => c.id === b.id) ? b.id : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    kind,
    name,
    dept: String(b.dept || '').trim().slice(0, 40),
    number: String(b.number || '').trim().slice(0, 30),
    note: String(b.note || '').trim().slice(0, 200),
  };
  const i = d.cards.findIndex((c) => c.id === card.id);
  if (i >= 0) {
    d.cards[i] = card;
    // 貸出履歴に残るカード名は、そのまま（履歴は借りた時点の記録）
  } else d.cards.push(card);
  await saveCards(d);
  return NextResponse.json({ success: true, id: card.id });
}

// 貸出中のカードは削除できない（先に返却する）
export async function DELETE(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get('id') || '';
  const d = await loadCards();
  if (activeLoanOf(d.loans, id)) {
    return NextResponse.json({ success: false, message: '貸出中のカードは削除できません。先に返却してください。' }, { status: 409 });
  }
  d.cards = d.cards.filter((c) => c.id !== id);
  await saveCards(d);
  return NextResponse.json({ success: true });
}
