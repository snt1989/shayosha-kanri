// メニュー（タブ）の並び順。端末ごとに「設定」で並び替えられる（この端末のブラウザに保存）。
// スマホの下のバーには、並び順の上から4つが出て、残りは「☰ メニュー」に入る。

export type TabKey = 'dashboard' | 'reports' | 'maintenance' | 'vehicles' | 'fuel' | 'rental' | 'calendar' | 'cards' | 'help' | 'admin';

export const TAB_META: Record<TabKey, { label: string; icon: string; admin?: boolean }> = {
  dashboard: { label: 'ダッシュボード', icon: '📊' },
  reports: { label: '運転日報', icon: '📝' },
  fuel: { label: '給油台帳', icon: '⛽' },
  rental: { label: 'レンタカー', icon: '🚗' },
  calendar: { label: 'カレンダー', icon: '📅' },
  cards: { label: 'カード貸出', icon: '💳' },
  maintenance: { label: '整備台帳', icon: '🔧' },
  vehicles: { label: '車両台帳', icon: '🚘' },
  help: { label: '使い方', icon: '❓' },
  admin: { label: '管理画面', icon: '🛠️', admin: true },
};

export const DEFAULT_ORDER: TabKey[] = ['dashboard', 'reports', 'fuel', 'rental', 'calendar', 'cards', 'maintenance', 'vehicles', 'help', 'admin'];
export const BAR_COUNT = 4; // スマホの下のバーに出る数（「メニュー」を除く）

const KEY = 'fleet:menu:order';

// 保存された並びを読む。知らない項目は捨て、足りない項目（新しく増えたページ）は標準の順で後ろに足す。
export function normalizeOrder(raw: unknown): TabKey[] {
  const seen = new Set<TabKey>();
  const out: TabKey[] = [];
  if (Array.isArray(raw)) {
    for (const k of raw) {
      if (typeof k === 'string' && k in TAB_META && !seen.has(k as TabKey)) {
        seen.add(k as TabKey);
        out.push(k as TabKey);
      }
    }
  }
  for (const k of DEFAULT_ORDER) if (!seen.has(k)) out.push(k);
  return out;
}

export function loadOrder(): TabKey[] {
  try {
    return normalizeOrder(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    return [...DEFAULT_ORDER];
  }
}

export function saveOrder(order: TabKey[]) {
  try {
    if (order.join() === DEFAULT_ORDER.join()) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    // 保存できなくても、この画面の間は並びが変わる
  }
}
