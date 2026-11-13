import { Driver, LogEntry, MASTER_KEYS, MASTER_LABELS, MasterKey, FuelLog, Masters, Rental, RentalTrip, TireInfo, Vehicle } from './types';
import { TIRE_DOT_RE, TIRE_YEAR_RE, genId, normalizeDot, tireSetsOf } from './utils';

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // skip; \n handles the row break
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/* ---------- vehicles ---------- */
const VEHICLE_HEADERS = ['id', '車両呼称', 'ナンバー', '型式', '車検満了日', '12ヶ月点検日', '積算走行km', 'オイル交換目安km', 'タイヤ種別', '夏タイヤメーカー', '夏タイヤDOT', '冬タイヤメーカー', '冬タイヤDOT'];

// CSV の列が無い（古い形式）ときは、いまの値を残す。年は正しい形のものだけ取り込む
function tireFromCsv(maker: string | undefined, year: string | undefined, prev?: TireInfo): TireInfo {
  if (maker === undefined && year === undefined) return prev ?? {};
  // DOT（4桁。例 2324）を取り込む。4桁の数字はDOTとして読む。旧形式の「2024-05」だけは製造年として受け付ける
  const raw = (year || '').trim();
  if (raw.includes('-') && TIRE_YEAR_RE.test(raw)) return { maker: (maker || '').trim(), dot: '', year: raw };
  const dot = normalizeDot(raw);
  return { maker: (maker || '').trim(), dot: TIRE_DOT_RE.test(dot) ? dot : '', year: '' };
}

export function vehiclesToCsv(vehicles: Vehicle[]): string {
  const rows: (string | number)[][] = [VEHICLE_HEADERS];
  vehicles.forEach((v) => {
    rows.push([v.id, v.name, v.plate, v.modelType, v.shakenDate, v.checkDate, v.odometer, v.oilKm, v.tire, tireSetsOf(v).summer.maker || '', tireSetsOf(v).summer.dot || tireSetsOf(v).summer.year || '', tireSetsOf(v).winter.maker || '', tireSetsOf(v).winter.dot || tireSetsOf(v).winter.year || '']);
  });
  return toCsv(rows);
}

export function csvToVehicles(text: string, existing: Vehicle[]): Vehicle[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const looksLikeHeader = /[a-zA-Zぁ-んァ-ヶ一-龠]/.test(rows[0][1] || '') && rows[0][0] === 'id';
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;
  const existingById = new Map(existing.map((v) => [v.id, v]));
  return dataRows.map((r) => {
    const id = (r[0] || '').trim() || genId('v');
    const prev = existingById.get(id);
    return {
      ...(prev || {}), // 車検証の項目など、CSVにない項目は消さない
      id,
      name: (r[1] || '').trim(),
      plate: (r[2] || '').trim(),
      modelType: (r[3] || '').trim(),
      shakenDate: (r[4] || '').trim(),
      checkDate: (r[5] || '').trim(),
      odometer: Number(r[6] || 0) || 0,
      oilKm: Number(r[7] || 0) || 0,
      tire: (r[8] || '').trim() || '夏タイヤ（ノーマル）',
      tireMaker: undefined,
      tireYear: undefined,
      tireSummer: tireFromCsv(r[9], r[10], prev ? tireSetsOf(prev).summer : undefined),
      tireWinter: tireFromCsv(r[11], r[12], prev ? tireSetsOf(prev).winter : undefined),
      maintHistory: prev ? prev.maintHistory : [],
    };
  });
}

/* ---------- drivers ---------- */
const DRIVER_HEADERS = ['id', '氏名(姓)', '氏名(名)', '社員番号', '所属事業部', '免許種別', '免許更新期日', '連絡先電話番号', '免許証番号', '特記事項'];

export function driversToCsv(drivers: Driver[]): string {
  const rows: (string | number)[][] = [DRIVER_HEADERS];
  drivers.forEach((d) => {
    rows.push([d.id, d.lastName, d.firstName, d.empId, d.dept, d.licenseType, d.licenseExpiry, d.phone, d.licenseNo, d.notes]);
  });
  return toCsv(rows);
}

export function csvToDrivers(text: string): Driver[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const looksLikeHeader = rows[0][0] === 'id';
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;
  return dataRows.map((r) => ({
    id: (r[0] || '').trim() || genId('d'),
    lastName: (r[1] || '').trim(),
    firstName: (r[2] || '').trim(),
    empId: (r[3] || '').trim(),
    dept: (r[4] || '').trim(),
    licenseType: (r[5] || '').trim(),
    licenseExpiry: (r[6] || '').trim(),
    phone: (r[7] || '').trim(),
    licenseNo: (r[8] || '').trim(),
    notes: (r[9] || '').trim(),
  }));
}

/* ---------- masters ---------- */
const MASTER_HEADERS = ['カテゴリキー', 'カテゴリ名', '登録名称'];

export function mastersToCsv(masters: Masters): string {
  const rows: (string | number)[][] = [MASTER_HEADERS];
  MASTER_KEYS.forEach((key) => {
    (masters[key] || []).forEach((name) => {
      rows.push([key, MASTER_LABELS[key], name]);
    });
  });
  return toCsv(rows);
}

export function csvToMasters(text: string): Masters {
  const rows = parseCsv(text);
  const result = Object.fromEntries(MASTER_KEYS.map((k) => [k, [] as string[]])) as Masters;
  if (rows.length === 0) return result;
  const masterKeySet: readonly string[] = MASTER_KEYS;
  const labelToKey = new Map<string, MasterKey>(MASTER_KEYS.map((k) => [MASTER_LABELS[k], k]));
  const startIdx = masterKeySet.includes(rows[0][0]) || labelToKey.has(rows[0][0]) ? 0 : 1;
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    const rawKey = (r[0] || '').trim();
    const rawLabel = (r[1] || '').trim();
    const name = (r[2] || '').trim();
    if (!name) continue;
    const key: MasterKey | undefined = masterKeySet.includes(rawKey) ? (rawKey as MasterKey) : labelToKey.get(rawKey) || labelToKey.get(rawLabel);
    if (!key) continue;
    result[key].push(name);
  }
  return result;
}

/* ---------- maintenance ledger ---------- */
const MAINT_HEADERS = ['実施日', '車両呼称', 'ナンバー', '整備種別', '走行km', '費用（円）', '実施先', '整備士', '進捗', '依頼内容', '整備内容', '備考'];

export type MaintLedgerRow = {
  date: string;
  vehicleName: string;
  plate: string;
  type: string;
  km: number;
  cost?: number;
  shop?: string;
  by?: string;
  progress?: string;
  request?: string;
  work?: string;
  note: string;
};

export function maintenanceToCsv(list: MaintLedgerRow[]): string {
  const rows: (string | number)[][] = [MAINT_HEADERS];
  list.forEach((m) => {
    rows.push([m.date, m.vehicleName, m.plate, m.type, m.km, m.cost ?? '', m.shop || '', m.by || '', m.progress || '', m.request || '', m.work || '', m.note]);
  });
  return toCsv(rows);
}

/* ---------- logs ---------- */
const LOG_HEADERS = ['日時', '操作者', '操作内容', '対象', '詳細'];

export function logsToCsv(logs: LogEntry[]): string {
  const rows: (string | number)[][] = [LOG_HEADERS];
  logs.forEach((l) => {
    rows.push([l.at, l.actor === 'admin' ? '管理者' : '利用者', l.action, l.target, l.detail || '']);
  });
  return toCsv(rows);
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- rentals ---------- */
const RENTAL_HEADERS = ['利用開始日', '返却日', 'レンタカー会社', '車種クラス', '車種', 'ナンバー', '予約番号', '登録者', '部署', '料金', '返却日時', '返却者', '備考'];

export function rentalsToCsv(list: Rental[]): string {
  const rows: (string | number)[][] = [RENTAL_HEADERS];
  list.forEach((r) => {
    rows.push([r.startDate, r.endDate, r.company, r.carClass, r.carModel, r.plate, r.reservationNo, r.driver, r.dept, r.cost || '', r.returnedAt ? `${r.returnedAt} ${r.returnedTime || ''}`.trim() : '', r.returnedBy || '', r.notes]);
  });
  return toCsv(rows);
}

export function rentalTripsToCsv(trips: RentalTrip[], rentals: Rental[]): string {
  const byId = new Map(rentals.map((r) => [r.id, r]));
  const rows: (string | number)[][] = [['運転日', '運転者', '事業部', '現場名', 'レンタカー会社', '車種', 'ナンバー', '備考']];
  trips.forEach((t) => {
    const r = byId.get(t.rentalId);
    rows.push([t.date, t.driver, t.dept || '', t.site || '', r?.company || '', r?.carModel || '', r?.plate || '', t.note]);
  });
  return toCsv(rows);
}

/* ---------- fuel ---------- */
export function fuelLogsToCsv(list: FuelLog[], efficiency: Map<string, number | null>): string {
  const rows: (string | number)[][] = [['給油日', '車両呼称', 'ナンバー', '燃料', '給油量（L）', '金額（円）', '単価（円/L）', '走行km', '満タン', '燃費（km/L）', '支払方法', '給油者', '備考']];
  list.forEach((f) => {
    const eff = efficiency.get(f.id);
    rows.push([f.date, f.vehicleName, f.plate, f.fuelType, f.liters, f.amount, f.liters > 0 ? Math.round((f.amount / f.liters) * 10) / 10 : '', f.km, f.full ? '満タン' : '', eff == null ? '' : Math.round(eff * 10) / 10, f.payMethod, f.driver, f.note]);
  });
  return toCsv(rows);
}
