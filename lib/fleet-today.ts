import type { AppData, Report, Reservation } from '@/lib/types';
import { isRequestOpen, maintBlocks, requestTypeState } from '@/lib/utils';

// 今日、どの車が動いているか（ダッシュボードの「今日の車両の動き」用）。
// out＝いま出ている（帰着登録がまだ）／back＝今日使って、もう戻った／reserved＝今日の予約がある（まだ出ていない）／
// maint＝今日が修理予定日（使えない）／idle＝今日は動いていない
export type TodayState = 'out' | 'back' | 'reserved' | 'maint' | 'idle';
export type TodayVehicle = {
  id: string;
  name: string;
  plate: string;
  state: TodayState;
  trip?: Report; // いま出ている日報
  trips: Report[]; // 今日の日報（戻ったものも含む）
  km: number; // 今日、走った距離（帰着済みの分）
  reservations: Reservation[]; // 今日の予約
  maintType?: string; // 整備の内容（整備中の依頼、または今日の修理予定）
  working: boolean; // 整備中の印が付いた依頼がある
  openRequests: number; // 対応待ちの整備依頼
  overdue: boolean; // 前日以前に出たまま、帰着登録がされていない
};

export function fleetToday(data: Pick<AppData, 'vehicles' | 'reports' | 'reservations'>, today: string): TodayVehicle[] {
  const blocks = maintBlocks(data.reports).filter((b) => b.date === today);
  const list = data.vehicles.map((v): TodayVehicle => {
    const mine = data.reports.filter((r) => r.vehicleId === v.id && !r.maintOnly);
    const open = mine.filter((r) => !r.postDone).sort((a, b) => (a.date + a.preTime).localeCompare(b.date + b.preTime));
    const trips = mine.filter((r) => r.date === today).sort((a, b) => a.preTime.localeCompare(b.preTime));
    const reservations = (data.reservations || [])
      .filter((x) => !x.rentalId && x.vehicleId === v.id && x.startDate <= today && x.endDate >= today)
      .sort((a, b) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime));
    const block = blocks.find((b) => b.vehicleId === v.id);
    const trip = open[open.length - 1];
    const work = data.reports.find((r) => r.vehicleId === v.id && isRequestOpen(r) && r.maintRequestWorking);
    const state: TodayState = trip ? 'out' : block || work ? 'maint' : trips.length > 0 ? 'back' : reservations.length > 0 ? 'reserved' : 'idle';
    return {
      id: v.id,
      name: v.name,
      plate: v.plate,
      state,
      trip,
      trips,
      km: trips.filter((r) => r.postDone).reduce((n, r) => n + (r.tripKm || 0), 0),
      reservations,
      maintType: work ? requestTypeState(work).left.join('、') || '整備' : block?.type,
      working: Boolean(work),
      openRequests: data.reports.filter((r) => r.vehicleId === v.id && isRequestOpen(r)).length,
      overdue: Boolean(trip && trip.date < today),
    };
  });
  const rank: Record<TodayState, number> = { out: 0, reserved: 1, back: 2, maint: 3, idle: 4 };
  return list.sort((a, b) => rank[a.state] - rank[b.state] || a.name.localeCompare(b.name, 'ja'));
}

export const TODAY_LABEL: Record<TodayState, { icon: string; label: string }> = {
  out: { icon: '🚗', label: '走行中' },
  reserved: { icon: '📅', label: '予約あり' },
  back: { icon: '✅', label: '帰着済み' },
  maint: { icon: '🔧', label: '整備' },
  idle: { icon: '🅿️', label: '待機中' },
};
