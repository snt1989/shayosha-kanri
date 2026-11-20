import { kvDel, kvGet, kvKeys, kvSet } from '@/lib/kv';
import { MAIN_DATA_KEY, loadData, writeRawData } from '@/lib/store';
import type { AppData } from '@/lib/types';

// 全種類のバックアップ。本体データ（日報・車両・運転者・マスタ・ログなど）に加えて、
// 別のキーに保存しているもの（お知らせ・整備士向けのお知らせ・事故報告・緊急連絡先・保険・カード・アラート設定・暗証番号・古い日報の保管分）も入れる。
// 入れないもの：写真・車検証の画像（大きいため。別のキーに1枚ずつ保存されていて、バックアップの復元では消えない）、通知の登録、回数制限の記録。
export const BACKUP_FORMAT = 'fleet-backup';
export const BACKUP_VERSION = 1;
export const SNAPSHOT_PREFIX = 'fleet:backup:v1:';
export const SNAPSHOT_KEEP = 7;

// 1つずつ決まった名前のキー
export const BACKUP_FIXED_KEYS = [
  'fleet:alert-settings:v1',
  'fleet:cards:v1',
  'fleet:incident-contacts:v1',
  'fleet:incidents:v1',
  'fleet:insurance:v1',
  'fleet:mech-notices:v1',
  'fleet:notices:v1',
  'fleet:pins:v1',
  'fleet:traffic-spots:v1',
] as const;
// 名前の先頭が決まっていて、いくつもあるキー（古い日報の保管分）
export const BACKUP_PREFIXES = ['fleet:reports:archive:v1:'] as const;

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  note?: string;
  data: Omit<AppData, 'persistent'>;
  keys: Record<string, unknown>;
};

export async function collectBackup(note?: string): Promise<BackupFile> {
  const { persistent, ...data } = await loadData();
  void persistent;
  const keys: Record<string, unknown> = {};
  for (const k of BACKUP_FIXED_KEYS) {
    const v = await kvGet<unknown>(k, null);
    if (v !== null) keys[k] = v;
  }
  for (const p of BACKUP_PREFIXES) {
    for (const k of await kvKeys(p)) {
      const v = await kvGet<unknown>(k, null);
      if (v !== null) keys[k] = v;
    }
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), ...(note ? { note } : {}), data, keys };
}

// 形の確認。旧形式（本体データだけのJSON。以前の「全データJSONバックアップ」）も受け付ける。
export function parseBackup(raw: unknown): BackupFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const okData = (d: unknown): d is BackupFile['data'] => {
    if (!d || typeof d !== 'object') return false;
    const x = d as Record<string, unknown>;
    return Array.isArray(x.reports) && Array.isArray(x.vehicles) && Array.isArray(x.drivers) && typeof x.masters === 'object' && x.masters !== null;
  };
  if (o.format === BACKUP_FORMAT && okData(o.data) && o.keys && typeof o.keys === 'object') {
    return { format: BACKUP_FORMAT, version: Number(o.version) || 1, createdAt: String(o.createdAt || ''), data: o.data, keys: o.keys as Record<string, unknown> };
  }
  if (okData(o)) {
    // 旧形式：本体データだけ。ほかのキーは触らない
    return { format: BACKUP_FORMAT, version: 0, createdAt: '', data: o as unknown as BackupFile['data'], keys: {} };
  }
  return null;
}

const allowedKey = (k: string) => (BACKUP_FIXED_KEYS as readonly string[]).includes(k) || BACKUP_PREFIXES.some((p) => k.startsWith(p));

// バックアップの内容に戻す。version 0（旧形式）は本体データだけを戻す。
export async function applyBackup(b: BackupFile): Promise<{ keys: number }> {
  await writeRawData({
    reports: b.data.reports ?? [],
    reservations: b.data.reservations ?? [],
    rentals: b.data.rentals ?? [],
    rentalTrips: b.data.rentalTrips ?? [],
    fuelLogs: b.data.fuelLogs ?? [],
    empIdRule: b.data.empIdRule,
    vehicles: b.data.vehicles ?? [],
    drivers: b.data.drivers ?? [],
    masters: b.data.masters,
    logs: b.data.logs ?? [],
  });
  if (b.version === 0) return { keys: 0 };
  let n = 0;
  for (const [k, v] of Object.entries(b.keys)) {
    if (!allowedKey(k)) continue;
    await kvSet(k, v);
    n++;
  }
  // バックアップに無いキーは消す（バックアップの時点に、そろえる）
  for (const k of BACKUP_FIXED_KEYS) if (!(k in b.keys)) await kvDel(k);
  for (const p of BACKUP_PREFIXES) for (const k of await kvKeys(p)) if (!(k in b.keys)) await kvDel(k);
  return { keys: n };
}

const jstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// その日の控えを保存し、古いものを消す（毎晩の自動バックアップと、復元の直前に使う）
export async function saveSnapshot(label?: string): Promise<{ key: string; bytes: number }> {
  const b = await collectBackup(label);
  const key = `${SNAPSHOT_PREFIX}${label === 'pre-restore' ? 'pre-restore' : jstDate()}`;
  await kvSet(key, b);
  const dated = (await kvKeys(SNAPSHOT_PREFIX)).filter((k) => /\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  for (const old of dated.slice(0, Math.max(0, dated.length - SNAPSHOT_KEEP))) await kvDel(old);
  return { key, bytes: JSON.stringify(b).length };
}

export async function listSnapshots(): Promise<{ id: string; createdAt: string; reports: number; vehicles: number; drivers: number; bytes: number }[]> {
  const out = [];
  for (const k of (await kvKeys(SNAPSHOT_PREFIX)).sort().reverse()) {
    const b = await kvGet<BackupFile | null>(k, null);
    if (!b) continue;
    out.push({ id: k.slice(SNAPSHOT_PREFIX.length), createdAt: b.createdAt, reports: b.data.reports?.length ?? 0, vehicles: b.data.vehicles?.length ?? 0, drivers: b.data.drivers?.length ?? 0, bytes: JSON.stringify(b).length });
  }
  return out;
}

export async function loadSnapshot(id: string): Promise<BackupFile | null> {
  if (!/^(\d{4}-\d{2}-\d{2}|pre-restore)$/.test(id)) return null;
  return kvGet<BackupFile | null>(`${SNAPSHOT_PREFIX}${id}`, null);
}
export { MAIN_DATA_KEY };
