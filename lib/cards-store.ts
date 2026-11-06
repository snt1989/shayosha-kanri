import { CardLoan, FleetCard } from './types';
import { kvGet, kvSet } from './kv';

// カードの登録と貸出履歴は、日報などの本体データ（fleet:data:v1）とは別のキーに保存する。
const KEY = 'fleet:cards:v1';

export type CardsData = { cards: FleetCard[]; loans: CardLoan[] };

export async function loadCards(): Promise<CardsData> {
  const d = await kvGet<Partial<CardsData>>(KEY, {});
  return { cards: d.cards ?? [], loans: d.loans ?? [] };
}

export async function saveCards(d: CardsData): Promise<void> {
  await kvSet(KEY, d);
}

export const activeLoanOf = (loans: CardLoan[], cardId: string) => loans.find((l) => l.cardId === cardId && !l.returnedAt);
