import { MAINT_URGENCIES, Report } from './types';

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
    .filter((r) => r.maintRequest && !r.maintRequestDone)
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
  if (!r.maintRequest || r.maintRequestDone) return false;
  return Boolean(who.isAdmin || who.mechanic || (who.driverId && r.driverId && who.driverId === r.driverId));
}
