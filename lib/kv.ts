import { promises as fs } from 'fs';
import path from 'path';

// お知らせ・通知の購読など、日報などの本体データ（fleet:data:v1）とは別に保存する小さなデータ用。
// 本体データと別にしておくので、日報などの保存で上書きされたり、/api/data に混ざったりしない。
// 保存先は本体データと同じ（Upstash Redis があればそこ、無ければ開発用のファイル）。

function hasUpstash() {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
      (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
  );
}

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

const LOCAL_DIR = process.env.VERCEL ? path.join('/tmp', 'fleet-app-data') : path.join(process.cwd(), '.data');
const LOCAL_FILE = path.join(LOCAL_DIR, 'fleet-kv.json');

async function readLocalAll(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(LOCAL_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  if (hasUpstash()) {
    const redis = await getRedis();
    const v = await redis.get<T>(key);
    return v ?? fallback;
  }
  const all = await readLocalAll();
  return key in all ? (all[key] as T) : fallback;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (hasUpstash()) {
    const redis = await getRedis();
    await redis.set(key, value);
    return;
  }
  const all = await readLocalAll();
  all[key] = value;
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(all), 'utf-8');
}

export async function kvDel(key: string): Promise<void> {
  if (hasUpstash()) {
    const redis = await getRedis();
    await redis.del(key);
    return;
  }
  const all = await readLocalAll();
  if (!(key in all)) return;
  delete all[key];
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(all), 'utf-8');
}

// --- 書き込みロック（同時に保存して、片方の入力が消えるのを防ぐ） ---
// 変更するAPIは、lib/lock.ts の withWriteLock で包み、1つずつ順番に処理する。
const LOCK_KEY = 'fleet:write-lock:v1';
let localChain: Promise<unknown> = Promise.resolve();

export async function runExclusive<T>(fn: () => Promise<T>, opt = { ttlMs: 25000, waitMs: 15000 }): Promise<T> {
  if (!hasUpstash()) {
    // 開発用：同じプロセスの中で、順番に並べる
    const run = localChain.then(fn, fn);
    localChain = run.catch(() => undefined);
    return run;
  }
  const redis = await getRedis();
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const started = Date.now();
  let got = false;
  while (Date.now() - started < opt.waitMs) {
    const r = await redis.set(LOCK_KEY, token, { nx: true, px: opt.ttlMs });
    if (r === 'OK') {
      got = true;
      break;
    }
    await new Promise((res) => setTimeout(res, 60 + Math.floor(Math.random() * 90)));
  }
  if (!got) throw new LockTimeoutError();
  try {
    return await fn();
  } finally {
    // 自分が持っているロックだけを外す（期限切れで、ほかの人のロックになっていたら触らない）
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", [LOCK_KEY], [token]).catch(() => undefined);
  }
}

export class LockTimeoutError extends Error {
  constructor() {
    super('lock timeout');
  }
}

// 接頭辞から始まるキーの一覧（バックアップ用）
export async function kvKeys(prefix: string): Promise<string[]> {
  if (hasUpstash()) {
    const redis = await getRedis();
    const out: string[] = [];
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, { match: `${prefix}*`, count: 500 });
      out.push(...keys);
      cursor = String(next);
    } while (cursor !== '0');
    return out.sort();
  }
  return Object.keys(await readLocalAll()).filter((k) => k.startsWith(prefix)).sort();
}
