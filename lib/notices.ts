import { AppData } from './types';
import { computeAlerts } from './alerts';

// --- 管理者が書く「連絡事項」 ---
export type NoticeLevel = 'info' | 'important';

export type Notice = {
  id: string;
  title: string;
  body: string;
  level: NoticeLevel;
  createdAt: string;
  createdBy: string;
  pinned?: boolean;
};

export const NOTICES_KEY = 'fleet:notices:v1';
export const NOTICE_MAX = 100;
export const NOTICE_TITLE_MAX = 60;
export const NOTICE_BODY_MAX = 1000;

// 新しい順。固定（ピン留め）したものを先頭に。
export function sortNotices(list: Notice[]): Notice[] {
  return [...list].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt.localeCompare(a.createdAt));
}

// --- 状況から自動で出すお知らせ（保存はしない。いまのデータから毎回つくる） ---
export type AutoNotice = {
  id: string;
  icon: string;
  text: string;
  level: 'danger' | 'warn' | 'info';
  go: 'dashboard' | 'reports' | 'maintenance' | 'rental' | 'fuel';
};

const dayText = (days: number) => (days < 0 ? `${-days}日超過` : days === 0 ? '本日' : `あと${days}日`);

export function buildAutoNotices(data: Pick<AppData, 'vehicles' | 'drivers' | 'reports'>): AutoNotice[] {
  const a = computeAlerts(data);
  const out: AutoNotice[] = [];

  for (const { v, days } of a.shaken) {
    out.push({ id: `shaken:${v.id}`, icon: '🚗', level: days < 0 ? 'danger' : 'warn', go: 'maintenance', text: `${v.name}（${v.plate}）の車検満了日 ${v.shakenDate}（${dayText(days)}）` });
  }
  for (const v of a.oil) {
    out.push({ id: `oil:${v.id}`, icon: '🛢️', level: 'warn', go: 'maintenance', text: `${v.name} のオイル交換の目安（${v.oilKm.toLocaleString()}km）まで、残り ${Math.max(0, v.oilKm - v.odometer).toLocaleString()}km` });
  }
  for (const { d, days } of a.license) {
    out.push({ id: `license:${d.id}`, icon: '🪪', level: days < 0 ? 'danger' : 'warn', go: 'dashboard', text: `${d.lastName} ${d.firstName}さんの免許の更新期日 ${d.licenseExpiry}（${dayText(days)}）` });
  }
  for (const r of a.ngAlcohol.slice(0, 5)) {
    out.push({ id: `alc:${r.id}`, icon: '🍺', level: 'danger', go: 'reports', text: `${r.date} ${r.driver}さんのアルコール検知の記録（出発前 ${r.preAlcohol}${r.postDone ? ` / 帰着後 ${r.postAlcohol}` : ''} mg/L）` });
  }
  for (const r of data.reports.filter((x) => !x.postDone)) {
    out.push({ id: `open:${r.id}`, icon: '📝', level: 'info', go: 'reports', text: `${r.driver}さん（${r.vehicleName}）の帰着登録がまだです（${r.date} 出発）` });
  }
  for (const r of data.reports.filter((x) => x.maintRequest && !x.maintRequestDone)) {
    out.push({ id: `maint:${r.id}`, icon: '🔧', level: (r.maintRequestUrgency || '').startsWith('至急') ? 'danger' : 'warn', go: 'maintenance', text: `${r.vehicleName} の整備依頼が対応待ちです（${r.maintRequestUrgency || '通常'}）` });
  }

  const rank = { danger: 0, warn: 1, info: 2 } as const;
  return out.sort((x, y) => rank[x.level] - rank[y.level]);
}

// プッシュ通知（毎朝のまとめ）の本文。何も無ければ null。
export function summarizeAutoNotices(items: AutoNotice[]): { title: string; body: string } | null {
  if (items.length === 0) return null;
  const danger = items.filter((i) => i.level === 'danger').length;
  const title = danger > 0 ? `【要対応】お知らせが${items.length}件あります` : `お知らせが${items.length}件あります`;
  const body = items
    .slice(0, 3)
    .map((i) => i.text)
    .join('\n') + (items.length > 3 ? `\nほか${items.length - 3}件` : '');
  return { title, body };
}
