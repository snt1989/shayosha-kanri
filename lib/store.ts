import { promises as fs } from 'fs';
import path from 'path';
import {
  AppData,
  DEFAULT_DRIVERS,
  DEFAULT_EMP_ID_RULE,
  EmpIdRule,
  DEFAULT_MASTERS,
  DEFAULT_VEHICLES,
  FuelLog,
  Masters,
  Rental,
  RentalTrip,
  Reservation,
} from './types';

const DATA_KEY = 'fleet:data:v1';

function hasUpstash() {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
      (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
  );
}

function defaultData(): Omit<AppData, 'persistent'> {
  return {
    reports: [],
    reservations: [],
    rentals: [],
    rentalTrips: [],
    fuelLogs: [],
    empIdRule: { ...DEFAULT_EMP_ID_RULE },
    // モジュール定数への参照をそのまま返すと、呼び出し側の push 等でこの
    // プロセスの「デフォルトデータ」自体が汚染されてしまうため、必ずコピーを返す。
    vehicles: DEFAULT_VEHICLES.map((v) => ({ ...v, maintHistory: [...v.maintHistory] })),
    drivers: DEFAULT_DRIVERS.map((d) => ({ ...d })),
    masters: mergeMasters(DEFAULT_MASTERS),
    logs: [],
  };
}

function mergeMasters(masters: Partial<Masters> | undefined): Masters {
  const base = DEFAULT_MASTERS;
  if (!masters) return base;
  return {
    departments: masters.departments ?? base.departments,
    checkers: masters.checkers ?? base.checkers,
    checkMethods: masters.checkMethods ?? base.checkMethods,
    maintTypes: masters.maintTypes ?? base.maintTypes,
    tireTypes: masters.tireTypes ?? base.tireTypes,
    licenseTypes: masters.licenseTypes ?? base.licenseTypes,
    rentalCompanies: masters.rentalCompanies ?? base.rentalCompanies,
    rentalCarClasses: masters.rentalCarClasses ?? base.rentalCarClasses,
    mechanics: masters.mechanics ?? base.mechanics,
    fuelTypes: masters.fuelTypes ?? base.fuelTypes,
    payMethods: masters.payMethods ?? base.payMethods,
  };
}

// --- Upstash Redis backend (本番/Vercel推奨) ---
let redisClient: import('@upstash/redis').Redis | null = null;
async function getRedis() {
  if (!redisClient) {
    const { Redis } = await import('@upstash/redis');
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL!;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN!;
    redisClient = new Redis({ url, token });
  }
  return redisClient;
}

// --- ローカルファイル backend（開発用フォールバック） ---
// Vercel本番環境ではプロジェクトディレクトリが読み取り専用のため、書き込み可能な /tmp を使用します。
// ただし /tmp はインスタンスの再起動やデプロイで消えるため、本番では必ず Upstash Redis を設定してください。
const LOCAL_DIR = process.env.VERCEL
  ? path.join('/tmp', 'fleet-app-data')
  : path.join(process.cwd(), '.data');
const LOCAL_FILE = path.join(LOCAL_DIR, 'fleet-data.json');

async function readLocal(): Promise<Omit<AppData, 'persistent'>> {
  try {
    const raw = await fs.readFile(LOCAL_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      reports: parsed.reports ?? [],
      reservations: parsed.reservations ?? [],
      rentals: parsed.rentals ?? [],
      rentalTrips: parsed.rentalTrips ?? [],
      fuelLogs: parsed.fuelLogs ?? [],
      empIdRule: { ...DEFAULT_EMP_ID_RULE, ...(parsed.empIdRule ?? {}) },
      vehicles: parsed.vehicles ?? DEFAULT_VEHICLES.map((v) => ({ ...v, maintHistory: [...v.maintHistory] })),
      drivers: parsed.drivers ?? DEFAULT_DRIVERS.map((d) => ({ ...d })),
      masters: mergeMasters(parsed.masters),
      logs: parsed.logs ?? [],
    };
  } catch {
    const d = defaultData();
    await writeLocal(d);
    return d;
  }
}

async function writeLocal(data: Omit<AppData, 'persistent'>) {
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function loadData(): Promise<AppData> {
  if (hasUpstash()) {
    const redis = await getRedis();
    const raw = await redis.get<Omit<AppData, 'persistent'>>(DATA_KEY);
    if (!raw) {
      const d = defaultData();
      await redis.set(DATA_KEY, d);
      return { ...d, persistent: true };
    }
    return {
      reports: raw.reports ?? [],
      reservations: raw.reservations ?? [],
      rentals: raw.rentals ?? [],
      rentalTrips: raw.rentalTrips ?? [],
      fuelLogs: raw.fuelLogs ?? [],
      empIdRule: { ...DEFAULT_EMP_ID_RULE, ...(raw.empIdRule ?? {}) },
      vehicles: raw.vehicles ?? DEFAULT_VEHICLES.map((v) => ({ ...v, maintHistory: [...v.maintHistory] })),
      drivers: raw.drivers ?? DEFAULT_DRIVERS.map((d) => ({ ...d })),
      masters: mergeMasters(raw.masters),
      logs: raw.logs ?? [],
      persistent: true,
    };
  }
  const local = await readLocal();
  return { ...local, persistent: false };
}

// reservations を渡さない呼び出し（日報・車両などの保存）では、保存済みの予約をそのまま引き継ぐ。
type SaveInput = Omit<AppData, 'persistent' | 'reservations' | 'rentals' | 'rentalTrips' | 'fuelLogs' | 'empIdRule'> & { reservations?: Reservation[]; rentals?: Rental[]; rentalTrips?: RentalTrip[]; fuelLogs?: FuelLog[]; empIdRule?: EmpIdRule };

export async function saveData(input: SaveInput): Promise<void> {
  const existing = input.reservations && input.rentals && input.rentalTrips && input.fuelLogs && input.empIdRule ? null : await loadData();
  const data: Omit<AppData, 'persistent'> = {
    ...input,
    reservations: input.reservations ?? existing?.reservations ?? [],
    rentals: input.rentals ?? existing?.rentals ?? [],
    rentalTrips: input.rentalTrips ?? existing?.rentalTrips ?? [],
    fuelLogs: input.fuelLogs ?? existing?.fuelLogs ?? [],
    empIdRule: input.empIdRule ?? existing?.empIdRule ?? { ...DEFAULT_EMP_ID_RULE },
  };
  if (hasUpstash()) {
    const redis = await getRedis();
    await redis.set(DATA_KEY, data);
    return;
  }
  await writeLocal(data);
}

// バックアップの復元用：本体データを、そのまま書き込む（形の確認は呼び出し側で行う）
export async function writeRawData(raw: Omit<AppData, 'persistent'>): Promise<void> {
  if (hasUpstash()) {
    const redis = await getRedis();
    await redis.set(DATA_KEY, raw);
    return;
  }
  await writeLocal(raw);
}
export const MAIN_DATA_KEY = DATA_KEY;
