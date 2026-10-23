import crypto from 'crypto';

// 現場管理アプリのログインを引き継ぐ（現場管理アプリが発行する署名付きチケットを確認する）。
// チケット = base64url(JSON) + '.' + base64url(HMAC-SHA256)。有効期限は60秒。共通の SSO_SECRET（16文字以上）で署名する。
export type SsoTicket = { n: string; site: string; division: string };

export const normName = (s: string) => s.normalize('NFKC').replace(/[\s　]+/g, '').toLowerCase();

export function readTicket(ticket: unknown, secret: string | undefined, now = Date.now()): SsoTicket | null {
  try {
    if (!secret || secret.length < 16 || typeof ticket !== 'string') return null;
    const parts = ticket.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const want = crypto.createHmac('sha256', secret).update(parts[0]).digest('base64url');
    const a = Buffer.from(parts[1]);
    const b = Buffer.from(want);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    // k は発行先の種類。社用車管理向け（'s'）以外のチケット（備品管理・報告写真向け）は受け付けない。
    if (!p || p.k !== 's' || typeof p.n !== 'string' || !p.n || typeof p.exp !== 'number' || now > p.exp) return null;
    return { n: p.n, site: typeof p.pn === 'string' ? p.pn.slice(0, 100) : '', division: typeof p.dv === 'string' ? p.dv.slice(0, 60) : '' };
  } catch {
    return null;
  }
}
