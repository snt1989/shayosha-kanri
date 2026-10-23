import crypto from 'crypto';
import { kvGet, kvSet } from '@/lib/kv';

// Webプッシュ通知（スマホ・パソコンに、アプリを閉じていても届く通知）。
//
// しくみ：本文を暗号化して送らず、「新しいお知らせがあります」という合図だけを送る。
// 端末のサービスワーカー（public/sw.js）が合図を受けたら、/api/push/latest で本文を取得して表示する。
// そのため、暗号化の部品は要らず、送信側の署名（VAPID）だけで済む。
//
// 必要な環境変数（無いときは通知機能が「未設定」になり、他の機能には影響しない）
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY … `node scripts/gen-vapid.mjs` で作る
//   VAPID_SUBJECT … 連絡先（mailto:… か https://…）。省略可

export const SUBS_KEY = 'fleet:push:subs:v1';
export const LAST_KEY = 'fleet:push:last:v1';
export const SUBS_MAX = 1000;

export type PushSub = { endpoint: string; createdAt: string; ua?: string };
export type PushMessage = { title: string; body: string; url: string; at: string };

export function pushConfig(): { enabled: boolean; publicKey: string } {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const enabled = Boolean(publicKey && process.env.VAPID_PRIVATE_KEY);
  return { enabled, publicKey: enabled ? publicKey : '' };
}

// 送り先は、ブラウザ各社の公式のプッシュサービスだけに限る（登録された任意のURLに、サーバーから送ってしまわないため）。
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

export function isValidEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

export async function loadSubs(): Promise<PushSub[]> {
  return kvGet<PushSub[]>(SUBS_KEY, []);
}

export async function addSub(endpoint: string, ua?: string): Promise<{ ok: boolean; total: number }> {
  const subs = await loadSubs();
  const rest = subs.filter((s) => s.endpoint !== endpoint);
  if (rest.length >= SUBS_MAX) return { ok: false, total: subs.length };
  const next = [...rest, { endpoint, createdAt: new Date().toISOString(), ua: (ua || '').slice(0, 120) }];
  await kvSet(SUBS_KEY, next);
  return { ok: true, total: next.length };
}

export async function removeSub(endpoint: string): Promise<void> {
  const subs = await loadSubs();
  const next = subs.filter((s) => s.endpoint !== endpoint);
  if (next.length !== subs.length) await kvSet(SUBS_KEY, next);
}

export async function loadLast(): Promise<PushMessage | null> {
  return kvGet<PushMessage | null>(LAST_KEY, null);
}

const b64u = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

// VAPID（RFC 8292）の署名つきトークン。ES256（P-256 + SHA-256）。
export function vapidHeader(endpoint: string, now = Date.now()): string {
  const pub = Buffer.from(process.env.VAPID_PUBLIC_KEY || '', 'base64url');
  const d = process.env.VAPID_PRIVATE_KEY || '';
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d },
    format: 'jwk',
  });
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: process.env.VAPID_SUBJECT || 'mailto:noreply@example.com' }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${process.env.VAPID_PUBLIC_KEY}`;
}

export type SendResult = { enabled: boolean; sent: number; removed: number; failed: number; total: number };

// 登録されたすべての端末に、合図を送る。本文は先に LAST_KEY に保存する。
export async function sendPushToAll(msg: { title: string; body: string; url?: string }): Promise<SendResult> {
  const cfg = pushConfig();
  const message: PushMessage = { title: msg.title.slice(0, 80), body: msg.body.slice(0, 300), url: msg.url || '/', at: new Date().toISOString() };
  const subs = await loadSubs();
  if (!cfg.enabled) return { enabled: false, sent: 0, removed: 0, failed: 0, total: subs.length };
  await kvSet(LAST_KEY, message);

  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  const queue = [...subs];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(s.endpoint, {
          method: 'POST',
          headers: { Authorization: vapidHeader(s.endpoint), TTL: '86400', Urgency: 'normal', 'Content-Length': '0' },
          signal: ctrl.signal,
        });
        if (res.status === 404 || res.status === 410) gone.push(s.endpoint);
        else if (res.ok) sent++;
        else failed++;
      } catch {
        failed++;
      } finally {
        clearTimeout(timer);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(10, subs.length) }, worker));
  if (gone.length > 0) {
    const latest = await loadSubs();
    await kvSet(SUBS_KEY, latest.filter((s) => !gone.includes(s.endpoint)));
  }
  return { enabled: true, sent, removed: gone.length, failed, total: subs.length };
}
