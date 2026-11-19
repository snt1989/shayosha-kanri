import { kvGet, kvSet } from '@/lib/kv';

// 失敗の回数制限（総当たり対策）。ログイン・暗証番号の確認に使う。
// 「window 分のうちに max 回まちがえたら、lock 分のあいだ受け付けない」。成功したら消す。
type Entry = { n: number; first: number; until?: number };
const KEY = 'fleet:rate:v1';

export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 60) || 'unknown';
}

export async function rateCheck(bucket: string, now = Date.now()): Promise<{ ok: boolean; waitMin: number }> {
  const all = await kvGet<Record<string, Entry>>(KEY, {});
  const e = all[bucket];
  if (e?.until && e.until > now) return { ok: false, waitMin: Math.ceil((e.until - now) / 60000) };
  return { ok: true, waitMin: 0 };
}

export async function rateFail(bucket: string, opt = { max: 5, windowMin: 15, lockMin: 15 }, now = Date.now()): Promise<{ locked: boolean; left: number }> {
  const all = await kvGet<Record<string, Entry>>(KEY, {});
  // 古い記録は捨てる（増えすぎないように）
  for (const k of Object.keys(all)) {
    const x = all[k];
    if ((x.until || 0) < now && now - x.first > opt.windowMin * 60000) delete all[k];
  }
  const cur = all[bucket] && now - all[bucket].first <= opt.windowMin * 60000 ? all[bucket] : { n: 0, first: now };
  cur.n += 1;
  let locked = false;
  if (cur.n >= opt.max) {
    cur.until = now + opt.lockMin * 60000;
    locked = true;
  }
  all[bucket] = cur;
  await kvSet(KEY, all);
  return { locked, left: Math.max(0, opt.max - cur.n) };
}

export async function rateClear(bucket: string): Promise<void> {
  const all = await kvGet<Record<string, Entry>>(KEY, {});
  if (bucket in all) {
    delete all[bucket];
    await kvSet(KEY, all);
  }
}
