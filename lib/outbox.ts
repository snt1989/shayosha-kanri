import type { AppData, Report } from '@/lib/types';

// 電波の悪い場所での入力（オフライン対応）。端末側だけで使う。
// - 出発登録・帰着登録が、通信できずに失敗したら、端末（localStorage）の「未送信」に入れる。電波が戻ったら、古い順に送る。
// - 最後に読み込めたデータを端末に控えておき、圏外で開いたときは、それを表示する。
const OUTBOX_KEY = 'fleet:outbox:v1';
const CACHE_KEY = 'fleet:data:cache:v1';

export type OutboxItem = { report: Report; driverId: string; at: string; error?: string };

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const loadOutbox = (): OutboxItem[] => {
  const list = read<OutboxItem[]>(OUTBOX_KEY, []);
  return Array.isArray(list) ? list.filter((x) => x && x.report && typeof x.report.id === 'string') : [];
};
export const saveOutbox = (items: OutboxItem[]): boolean => write(OUTBOX_KEY, items);

export const newReportId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// 未送信に入れる。id の無い新規の日報には、端末で id を付ける（送り直しても、二重に登録されないように）。
// 同じ日報がすでに未送信にあれば、新しい内容で置きかえる（圏外のまま、出発 → 帰着と続けて登録したとき）。
export function enqueue(items: OutboxItem[], report: Report, driverId: string, at = new Date().toISOString()): { items: OutboxItem[]; report: Report } {
  const r = report.id ? report : { ...report, id: newReportId() };
  const rest = items.filter((x) => x.report.id !== r.id);
  return { items: [...rest, { report: r, driverId, at }], report: r };
}

// 未送信の日報を、表示用のデータに重ねる（一覧やダッシュボードに、すぐ出すため）
export function applyOutbox<T extends Pick<AppData, 'reports'>>(data: T, items: OutboxItem[]): T {
  if (items.length === 0) return data;
  const map = new Map(items.map((x) => [x.report.id, x.report]));
  const seen = new Set<string>();
  const reports = data.reports.map((r) => {
    const q = map.get(r.id);
    if (!q) return r;
    seen.add(r.id);
    return q;
  });
  const added = items.filter((x) => !seen.has(x.report.id)).map((x) => x.report);
  return { ...data, reports: [...added.reverse(), ...reports] };
}

// 通信できなかったための失敗か（サーバーが断った失敗＝status あり、とは分ける）
export const isNetworkError = (e: unknown) => !(e && typeof e === 'object' && typeof (e as { status?: unknown }).status === 'number');

// 圏外で開いたときのための控え。大きくなりすぎないよう、日報は「帰着登録がまだのもの＋新しい50件」（写真は除く）、操作ログは入れない。
export function saveDataCache(data: AppData): void {
  const open = data.reports.filter((r) => !r.postDone);
  const recent = data.reports.filter((r) => r.postDone).slice(0, 50);
  const slim: AppData = {
    ...data,
    reports: [...open, ...recent].map((r) => ({ ...r, inspectionPhoto: '' })),
    vehicles: data.vehicles.map((v) => ({ ...v, maintHistory: (v.maintHistory || []).slice(0, 5) })),
    logs: [],
  };
  if (!write(CACHE_KEY, { at: new Date().toISOString(), data: slim })) {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // 保存できなくても動かす
    }
  }
}
export function loadDataCache(): { at: string; data: AppData } | null {
  const c = read<{ at: string; data: AppData } | null>(CACHE_KEY, null);
  return c && c.data && Array.isArray(c.data.reports) && Array.isArray(c.data.vehicles) && Array.isArray(c.data.drivers) ? c : null;
}
