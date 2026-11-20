import { kvGet, kvSet } from '@/lib/kv';
import { loadData, saveData } from '@/lib/store';
import { pushLog } from '@/lib/log';
import type { Report } from '@/lib/types';

// 古い日報の保管（アーカイブ）。本体データ（fleet:data:v1）が大きくなりすぎないように、
// 帰着登録が済んだ古い日報を、月ごとの別のキーへ移す。移したものは読むだけ（編集・削除はできない）。
// 残すもの：今月と、その前の3か月分／帰着登録がまだのもの／整備依頼のついたもの（整備台帳が参照するため）。
export const ARCHIVE_PREFIX = 'fleet:reports:archive:v1:';
const INDEX_KEY = `${ARCHIVE_PREFIX}index`;
export const ARCHIVE_KEEP_MONTHS = 3;

export type ArchivedReport = Report; // code に、保管したときの日報番号（R-101 など）が入る
export type ArchiveIndex = { months: Record<string, number>; total: number };

const jstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// この日付より前（の月）の日報が、保管の対象。今日が 2026-11-20 なら 2026-08-01。
export function archiveCutoff(today = jstToday(), keepMonths = ARCHIVE_KEEP_MONTHS): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1 - keepMonths;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

export const isArchivable = (r: Report, cutoff: string) =>
  Boolean(r.date) && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date < cutoff && r.postDone && !r.maintRequest && !r.maintOnly;

export async function loadArchiveIndex(): Promise<ArchiveIndex> {
  const i = await kvGet<ArchiveIndex | null>(INDEX_KEY, null);
  return i && typeof i === 'object' && i.months ? i : { months: {}, total: 0 };
}

export async function loadArchiveMonth(month: string): Promise<ArchivedReport[]> {
  if (!/^\d{4}-\d{2}$/.test(month)) return [];
  return kvGet<ArchivedReport[]>(`${ARCHIVE_PREFIX}${month}`, []);
}

// 古い日報を保管へ移す。書き込みロックの中で呼ぶこと。
export async function archiveOldReports(today = jstToday()): Promise<{ moved: number; months: string[] }> {
  const data = await loadData();
  const cutoff = archiveCutoff(today);
  const index = await loadArchiveIndex();
  // 日報番号は、画面と同じ数え方（古い順の通し番号）。保管済みの件数だけ、ずらす
  const sorted = data.reports.filter((r) => !r.maintOnly).sort((a, b) => (a.date + a.preTime).localeCompare(b.date + b.preTime));
  const code = new Map(sorted.map((r, i) => [r.id, r.code || `R-${101 + index.total + i}`]));
  const target = data.reports.filter((r) => isArchivable(r, cutoff));
  if (target.length === 0) return { moved: 0, months: [] };

  const byMonth = new Map<string, ArchivedReport[]>();
  for (const r of target) {
    const m = r.date.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) || []), { ...r, code: code.get(r.id) }]);
  }
  // 先に保管へ書き、あとで本体から外す（途中で止まっても、消えることはない。次の回で id の重なりを除く）
  for (const [m, list] of byMonth) {
    const cur = await loadArchiveMonth(m);
    const ids = new Set(cur.map((r) => r.id));
    const merged = [...cur, ...list.filter((r) => !ids.has(r.id))].sort((a, b) => (a.date + a.preTime).localeCompare(b.date + b.preTime));
    await kvSet(`${ARCHIVE_PREFIX}${m}`, merged);
    index.months[m] = merged.length;
  }
  index.total = Object.values(index.months).reduce((a, b) => a + b, 0);
  await kvSet(INDEX_KEY, index);

  const moved = new Set(target.map((r) => r.id));
  // 残る日報にも番号を書き込む（保管で件数が減っても、番号がずれないように）
  data.reports = data.reports.filter((r) => !moved.has(r.id)).map((r) => (r.maintOnly || r.code ? r : { ...r, code: code.get(r.id) }));
  pushLog(data, { actor: 'admin', action: '古い日報を保管へ移動（自動）', target: `${target.length}件`, detail: [...byMonth.keys()].sort().join('、') });
  const { persistent, ...rest } = data;
  void persistent;
  await saveData(rest);
  return { moved: target.length, months: [...byMonth.keys()].sort() };
}
