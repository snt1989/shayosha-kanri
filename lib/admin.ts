import crypto from 'crypto';

export const ADMIN_COOKIE = 'fleet_admin_session';
export const ADMIN_SESSION_HOURS = 8;

// 署名に使う鍵。管理者パスワード（と、あれば SESSION_SECRET）から作る。パスワードを変えると、出ているログインはすべて無効になる。
function secret(): Buffer {
  return crypto.createHash('sha256').update(`${process.env.ADMIN_PASSWORD || ''}:fleet-admin-salt:${process.env.SESSION_SECRET || ''}`).digest();
}
// ほかの署名（運転者・整備士の暗証番号）にも使う
export const serverSecret = () => secret();
const sign = (payload: string) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function adminPasswordConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function checkAdminPassword(password: string): boolean {
  if (!adminPasswordConfigured()) return false;
  // 長さや中身で比較の時間が変わらないよう、ハッシュどうしを比べる
  const h = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
  return safeEq(h(password), h(process.env.ADMIN_PASSWORD || ''));
}

// ログインのたびに違う値になる、期限つきの署名トークン（期限.乱数.署名）。固定の値ではないので、漏れても期限で切れる。
export function adminSessionToken(now = Date.now()): string {
  const exp = now + ADMIN_SESSION_HOURS * 3600 * 1000;
  const payload = `${exp}.${crypto.randomBytes(12).toString('base64url')}`;
  return `${payload}.${sign(payload)}`;
}

export function isAdminCookieValid(cookieVal: string | undefined | null, now = Date.now()): boolean {
  if (!cookieVal || !adminPasswordConfigured()) return false;
  const parts = cookieVal.split('.');
  if (parts.length !== 3) return false;
  const [exp, nonce, sig] = parts;
  if (!/^\d{13}$/.test(exp) || Number(exp) < now) return false;
  return safeEq(sig, sign(`${exp}.${nonce}`));
}
