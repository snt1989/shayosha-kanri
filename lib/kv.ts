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
