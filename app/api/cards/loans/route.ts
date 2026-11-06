import { NextRequest, NextResponse } from 'next/server';
import { loadData } from '@/lib/store';
import { activeLoanOf, loadCards, saveCards } from '@/lib/cards-store';
import { CardLoan } from '@/lib/types';

export const dynamic = 'force-dynamic';

const todayJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// カードを借りる。運転者としてログインしている人（driverId）が借りる。
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as {
    cardId?: string;
    driverId?: string;
    dueDate?: string;
    purpose?: string;
    vehicleId?: string;
    note?: string;
  };
  const [d, app] = await Promise.all([loadCards(), loadData()]);
  const card = d.cards.find((c) => c.id === b.cardId);
  if (!card) return NextResponse.json({ success: false, message: 'カードが見つかりません。' }, { status: 404 });
  const driver = app.drivers.find((x) => x.id === b.driverId);
  if (!driver) return NextResponse.json({ success: false, message: '運転者としてログインしてください。' }, { status: 401 });
  const out = activeLoanOf(d.loans, card.id);
  if (out) {
    return NextResponse.json({ success: false, message: `このカードは、${out.borrower} さんが借りています。` }, { status: 409 });
  }
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.dueDate)) ? String(b.dueDate) : '';
  if (dueDate && dueDate < todayJst()) {
    return NextResponse.json({ success: false, message: '返却予定日は、今日以降にしてください。' }, { status: 400 });
  }
  const vid = String(b.vehicleId || '');
  const veh = vid ? app.vehicles.find((x) => x.id === vid) : undefined;
  const rent = vid && !veh ? (app.rentals || []).find((x) => x.id === vid) : undefined;
  const v = veh
    ? { id: veh.id, name: veh.name }
    : vid === 'rental'
      ? { id: 'rental', name: 'レンタカー' }
      : rent
      ? { id: rent.id, name: `レンタカー ${[rent.carModel || rent.carClass, rent.plate].filter(Boolean).join(' ')}`.trim() }
      : undefined;
  const loan: CardLoan = {
    id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    cardId: card.id,
    borrowerId: driver.id,
    borrower: `${driver.lastName} ${driver.firstName}`.trim(),
    dept: driver.dept || '',
    borrowedAt: new Date().toISOString(),
    dueDate,
    purpose: String(b.purpose || '').trim().slice(0, 100),
    vehicleId: v?.id || '',
    vehicleName: v?.name || '',
    note: String(b.note || '').trim().slice(0, 200),
  };
  d.loans.unshift(loan);
  d.loans = d.loans.slice(0, 2000);
  await saveCards(d);
  return NextResponse.json({ success: true, id: loan.id });
}
