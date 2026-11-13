import { MAINT_URGENCIES, Report, TireInfo, Vehicle } from './types';

export function todayStr(): string {
  const d = new Date();
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

export function nowTimeStr(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}

export function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  if (isNaN(target.getTime())) return null;
  const today = new Date(todayStr() + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function fmtDate(dateStr: string): string {
  if (!dateStr) return '-';
  return dateStr;
}

export function genId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function maintUrgencyRank(urgency?: string): number {
  const i = (MAINT_URGENCIES as readonly string[]).indexOf(urgency || '');
  return i < 0 ? 0 : i;
}

// 運転の記録（日報）だけにする。ダッシュボードから直接出した整備依頼（maintOnly）は除く
export function tripReports(reports: Report[]): Report[] {
  return reports.filter((r) => !r.maintOnly);
}

// 対応待ちの整備依頼（緊急度の高い順、同じなら古い順）
export function openMaintRequests(reports: Report[]): Report[] {
  return reports
    .filter(isRequestOpen)
    .sort(
      (a, b) =>
        maintUrgencyRank(b.maintRequestUrgency) - maintUrgencyRank(a.maintRequestUrgency) ||
        (a.date + a.preTime).localeCompare(b.date + b.preTime)
    );
}

// あるレンタカーに入っている予約（開始の早い順）。fromDate を渡すと、その日以降に終わるものだけ。
export function rentalReservations(
  reservations: { rentalId?: string; startDate: string; endDate: string; startTime: string; endTime: string; driver: string; destination: string; id: string }[],
  rentalId: string,
  fromDate?: string
) {
  return reservations
    .filter((v) => v.rentalId === rentalId && (!fromDate || v.endDate >= fromDate))
    .sort((a, b) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime));
}

export function reservationRange(v: { startDate: string; endDate: string; startTime: string; endTime: string }): string {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return v.startDate === v.endDate
    ? `${md(v.startDate)} ${v.startTime}〜${v.endTime}`
    : `${md(v.startDate)} ${v.startTime}〜${md(v.endDate)} ${v.endTime}`;
}


// 整備依頼を編集できる人：依頼を出した本人（運転者ログイン）、整備士、管理者。対応済になった依頼は編集できない。
export function canEditMaintRequest(r: Report, who: { driverId?: string | null; mechanic?: string | null; isAdmin?: boolean }): boolean {
  if (!isRequestOpen(r)) return false;
  return Boolean(who.isAdmin || who.mechanic || (who.driverId && r.driverId && who.driverId === r.driverId));
}

// 日報を入力した本人か（運転者ログイン中の人のID、または昔の日報は名前の一致で見る）
export function isReportOwner(r: Report, driver?: { id: string; lastName: string; firstName: string } | null): boolean {
  if (!driver) return false;
  if (r.driverId) return r.driverId === driver.id;
  return r.driver.replace(/\s/g, '') === `${driver.lastName}${driver.firstName}`;
}

// 整備依頼の緊急度ごとの色分け（至急＝赤、早めに＝橙、通常＝青）
export function urgencyLevel(u?: string): 'urgent' | 'soon' | 'normal' {
  return u === '至急（使用不可）' ? 'urgent' : u === '早めに' ? 'soon' : 'normal';
}
export const urgencyPill = (u?: string) => ({ urgent: 'pill-red', soon: 'pill-amber', normal: 'pill-sky' })[urgencyLevel(u)];

// 整備記録の種別（複数選べる。以前の記録は type ひとつだけ）
export const maintTypesOf = (m: { type: string; types?: string[] }): string[] => (m.types && m.types.length ? m.types : m.type ? [m.type] : []);

// 対応待ちの整備依頼か。経過観察は完了と同じ扱いなので、対応待ちには数えない
export const isRequestOpen = (r: { maintRequest?: boolean; maintRequestDone?: boolean; maintRequestWatch?: boolean }) =>
  Boolean(r.maintRequest && !r.maintRequestDone && !r.maintRequestWatch);

// 修理予定日が決まっている、対応待ちの整備依頼。その日、その車両は使えない（カレンダーに出し、予約・出庫を止める）
export type MaintBlock = { reportId: string; vehicleId: string; vehicleName: string; plate: string; date: string; type: string };
export function maintBlocks(reports: Report[]): MaintBlock[] {
  return reports
    .filter((r) => isRequestOpen(r) && r.maintRequestScheduledDate && r.vehicleId)
    .map((r) => ({
      reportId: r.id,
      vehicleId: r.vehicleId,
      vehicleName: r.vehicleName,
      plate: r.plate,
      date: r.maintRequestScheduledDate as string,
      type: r.maintRequestType || '整備',
    }));
}
// 車両が [from, to]（YYYY-MM-DD）の間に整備予定日とぶつかるか
export const maintBlockIn = (blocks: MaintBlock[], vehicleId: string, from: string, to: string): MaintBlock | undefined =>
  blocks.find((b) => b.vehicleId === vehicleId && b.date >= from && b.date <= (to || from));

// 依頼・記録の整備種別は、複数選んだとき「、」でつないだ文字列で持っている
export const splitMaintTypes = (s?: string): string[] => (s || '').split('、').map((x) => x.trim()).filter(Boolean);

// 依頼の状態の表示用（対応待ち／経過観察／対応済）
export const requestStateLabel = (r: { maintRequestDone?: boolean; maintRequestWatch?: boolean }) =>
  r.maintRequestWatch ? '経過観察' : r.maintRequestDone ? '対応済' : '対応待ち';

// 夏タイヤ・冬タイヤそれぞれのメーカーと製造年。夏・冬に分ける前の項目（tireMaker / tireYear）が入っている車両は、
// 今のタイヤ種別がスタッドレスなら冬、それ以外なら夏の分として読む
export function tireSetsOf(v: Pick<Vehicle, 'tire' | 'tireSummer' | 'tireWinter' | 'tireMaker' | 'tireYear'>): { summer: TireInfo; winter: TireInfo } {
  const legacy: TireInfo = { maker: v.tireMaker, year: v.tireYear };
  const hasLegacy = Boolean(legacy.maker || legacy.year);
  const winterNow = /スタッドレス|冬/.test(v.tire || '');
  return {
    summer: v.tireSummer ?? (hasLegacy && !winterNow ? legacy : {}),
    winter: v.tireWinter ?? (hasLegacy && winterNow ? legacy : {}),
  };
}

export const TIRE_YEAR_RE = /^(19|20)\d{2}(-(0[1-9]|1[0-2]))?$/;

// DOT（タイヤ側面の製造年週）：最後の4桁＝週2桁(01〜53)＋年2桁。例 2324 = 2024年の23週
export const TIRE_DOT_RE = /^(0[1-9]|[1-4]\d|5[0-3])\d{2}$/;
// 全角・「DOT」・空白などを取り除いて、数字だけにする（5桁以上のときは最後の4桁）
export function normalizeDot(s: string | undefined): string {
  const d = (s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\D/g, '');
  return d.length > 4 ? d.slice(-4) : d;
}
// 「DOT 2324（2024年 第23週製）」のような表示。DOT が正しくないときは null
export function dotText(dot: string | undefined): string | null {
  if (!dot || !TIRE_DOT_RE.test(dot)) return null;
  return `DOT ${dot}（20${dot.slice(2)}年 第${Number(dot.slice(0, 2))}週製）`;
}

// タイヤサイズ：全角を半角にし、英字は大文字、空白は詰める（例 ｂ195/65r15 → 195/65R15）
export function normalizeTireSize(s: string | undefined): string {
  return (s || '')
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[／]/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 24);
}

// 「ブリヂストン / 195/65R15 / DOT 2324（2024年 第23週製）」のような表示（DOT が無い旧データは「2024年製」）
export function tireInfoText(t: TireInfo): string {
  const d = dotText(t.dot);
  const y = d || (t.year ? `${t.year.replace('-', '年')}${t.year.includes('-') ? '月' : '年'}製` : '');
  return [t.maker, t.size, y].filter(Boolean).join(' / ');
}

// 整備士としてログイン中の名前（車検証の画像・AI読み取りの権限確認に使う）
export function mechanicQuery(): string {
  try {
    const m = localStorage.getItem('fleet_current_mechanic');
    return m ? encodeURIComponent(m) : '';
  } catch {
    return '';
  }
}
export function mechanicHeaders(): Record<string, string> {
  const m = mechanicQuery();
  return m ? { 'x-mechanic': m } : {};
}
