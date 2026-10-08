import type { AppData, Driver, FuelLog, Report, Vehicle } from '../../lib/types';
import { nowTimeStr, todayStr } from '../../lib/utils';

// 画面に依存しない処理。入力の初期値・チェック・送信する形への組み立て。
// 決まりは Web版（components/ReportsTab.tsx と FuelTab.tsx）に合わせている。

export const driverName = (d: Pick<Driver, 'lastName' | 'firstName'>) => `${d.lastName} ${d.firstName}`.trim();

export const comma = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const yen = (n: number) => `${comma(n)} 円`;
export const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);

// 「前回使った車両」: 運転者が分かればその人の直近の日報、なければ全体で直近の日報の車両。
// 台帳から削除済みの車両は対象外。data.reports は新しい順に保存されている。
export function lastUsedVehicle(data: AppData, driverId?: string): Vehicle | undefined {
  const exists = (id: string) => data.vehicles.find((v) => v.id === id);
  if (driverId) {
    const mine = data.reports.find((r) => r.driverId === driverId && r.vehicleId && exists(r.vehicleId));
    if (mine) return exists(mine.vehicleId);
  }
  const any = data.reports.find((r) => r.vehicleId && exists(r.vehicleId));
  return any ? exists(any.vehicleId) : undefined;
}

// --- 運転日報 ---

export function newDeparture(data: AppData, driver: Driver): Report {
  const v = lastUsedVehicle(data, driver.id);
  return {
    id: '',
    date: todayStr(),
    dept: driver.dept || data.masters.departments[0] || '',
    driverId: driver.id,
    driverLast: driver.lastName,
    driverFirst: driver.firstName,
    driver: driverName(driver),
    vehicleId: v?.id || '',
    vehicleName: v?.name || '',
    plate: v?.plate || '',
    destination: '',
    purpose: '',
    preTime: nowTimeStr(),
    preAlcohol: '0.00',
    preChecker: data.masters.checkers[0] || '',
    preMethod: data.masters.checkMethods[0] || '',
    alcoholSkipped: false,
    tireOk: true,
    brakeOk: true,
    postDone: false,
    postTime: '',
    postAlcohol: '0.00',
    postChecker: '',
    postMethod: '',
    startKm: v?.odometer || 0,
    endKm: 0,
    tripKm: 0,
    notes: '',
  };
}

export function selectVehicle(r: Report, data: AppData, vehicleId: string): Report {
  const v = data.vehicles.find((x) => x.id === vehicleId);
  if (!v) return { ...r, vehicleId: '', vehicleName: '', plate: '', startKm: 0 };
  return { ...r, vehicleId: v.id, vehicleName: v.name, plate: v.plate, startKm: v.odometer };
}

export function validateDeparture(r: Report): string | null {
  if (!r.driverLast || !r.driverFirst) return '運転者としてログインしてください。';
  if (!r.vehicleId) return '使用車両を選んでください。';
  if (!r.destination.trim()) return '行先を入力してください。';
  if (!r.date) return '利用日を入力してください。';
  return null;
}

export function buildDeparture(r: Report): Report {
  return { ...r, driver: `${r.driverLast} ${r.driverFirst}`.trim(), destination: r.destination.trim(), purpose: r.purpose.trim(), tripKm: 0 };
}

// 出庫中の日報を、帰着登録の入力状態にする
export function startReturn(r: Report, data: AppData): Report {
  return {
    ...r,
    postDone: true,
    postTime: r.postTime || nowTimeStr(),
    postAlcohol: r.postAlcohol || '0.00',
    postChecker: r.postChecker || data.masters.checkers[0] || '',
    postMethod: r.postMethod || data.masters.checkMethods[0] || '',
  };
}

export function validateReturn(r: Report): string | null {
  if (r.endKm > 0 && r.endKm < r.startKm) return `帰着時の走行距離が、出発時（${comma(r.startKm)}km）より小さくなっています。確認してください。`;
  if (r.maintRequest && !(r.maintRequestNote || '').trim()) return '整備依頼の内容・症状を入力してください。';
  return null;
}

export function buildReturn(r: Report): Report {
  const tripKm = Math.max(0, (r.endKm || 0) - (r.startKm || 0));
  const maint = r.maintRequest
    ? {}
    : { maintRequest: false, maintRequestType: '', maintRequestUrgency: '', maintRequestNote: '', maintRequestDone: false, maintRequestDoneAt: '' };
  return { ...r, ...maint, postDone: true, tripKm, driver: `${r.driverLast} ${r.driverFirst}`.trim() };
}

// --- 給油台帳 ---

export function newFuelLog(data: AppData, driver: Driver, vehicleId?: string): FuelLog {
  const sorted = sortFuel(data.fuelLogs);
  const v = data.vehicles.find((x) => x.id === vehicleId) || data.vehicles.find((x) => x.id === sorted[0]?.vehicleId) || data.vehicles[0];
  const last = sorted.find((f) => f.vehicleId === v?.id);
  return {
    id: '',
    date: todayStr(),
    vehicleId: v?.id || '',
    vehicleName: v?.name || '',
    plate: v?.plate || '',
    fuelType: last?.fuelType || data.masters.fuelTypes[0] || '',
    liters: 0,
    amount: 0,
    km: v?.odometer || 0,
    full: true,
    payMethod: last?.payMethod || data.masters.payMethods[0] || '',
    driverId: driver.id,
    driver: driverName(driver),
    note: '',
    createdAt: '',
  };
}

export function changeFuelVehicle(f: FuelLog, data: AppData, vehicleId: string): FuelLog {
  const v = data.vehicles.find((x) => x.id === vehicleId);
  const last = sortFuel(data.fuelLogs).find((x) => x.vehicleId === vehicleId);
  return { ...f, vehicleId, vehicleName: v?.name || f.vehicleName, plate: v?.plate || f.plate, km: v?.odometer || 0, fuelType: last?.fuelType || f.fuelType };
}

export function sortFuel(logs: FuelLog[]): FuelLog[] {
  return [...logs].sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km || b.createdAt.localeCompare(a.createdAt));
}

// 同じ車両の、この給油日以前の直近の給油
export function previousFuel(f: FuelLog, all: FuelLog[]): FuelLog | undefined {
  return all
    .filter((x) => x.vehicleId === f.vehicleId && x.id !== f.id && x.date <= f.date)
    .sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km)[0];
}

export function validateFuel(f: FuelLog, all: FuelLog[]): string | null {
  if (!f.vehicleId) return '車両を選んでください。';
  if (!f.date) return '給油日を入力してください。';
  if (!(f.liters > 0)) return '給油量（L）を入力してください。';
  if (!f.driver) return '運転者としてログインしてください。';
  const prev = previousFuel(f, all);
  if (f.km > 0 && prev && prev.km > 0 && f.km < prev.km) {
    return `走行kmが、前回の給油（${prev.date}・${comma(prev.km)}km）より小さくなっています。確認してください。`;
  }
  return null;
}

// 入力欄の文字を数に直す（空や数でない文字は 0）
export const toNumber = (text: string): number => {
  const n = Number(text.replace(/,/g, '').trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
};
