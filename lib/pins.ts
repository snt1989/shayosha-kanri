import crypto from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid, serverSecret } from '@/lib/admin';
import { kvGet, kvSet } from '@/lib/kv';

// 運転者・整備士の暗証番号（4けた。なりすまし対策。設定した人だけ）。
// 暗証番号そのものは保存しない（サーバーの鍵で作った照合用の値だけを、本体データとは別のキーに保存する。/api/data には出ない）。
// 照合できた端末には、署名つきのクッキーを出す。暗証番号を設定した人の名前で操作するときは、サーバーがこのクッキーを確かめる。
// ※ 鍵は、管理者パスワード（と SESSION_SECRET）から作る。管理者パスワードを変えたときは、暗証番号の再設定が必要になる。
export const PINS_KEY = 'fleet:pins:v1';
export type PinKind = 'driver' | 'mechanic';
export type Pins = { d: Record<string, string>; m: Record<string, string> };
export const PIN_COOKIE: Record<PinKind, string> = { driver: 'fleet_pin_d', mechanic: 'fleet_pin_m' };
export const PIN_DAYS = 90;
export const PIN_RE = /^\d{4}$/;

const mac = (payload: string) => crypto.createHmac('sha256', serverSecret()).update(payload).digest('base64url');
const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const slot = (kind: PinKind) => (kind === 'driver' ? 'd' : 'm') as 'd' | 'm';

export async function loadPins(): Promise<Pins> {
  const p = await kvGet<Partial<Pins> | null>(PINS_KEY, null);
  return { d: { ...(p?.d || {}) }, m: { ...(p?.m || {}) } };
}
export const hasPin = (pins: Pins, kind: PinKind, id: string) => Boolean(id && pins[slot(kind)][id]);
const pinHash = (kind: PinKind, id: string, pin: string) => mac(`pin:${kind}:${id}:${pin}`);
export const checkPin = (pins: Pins, kind: PinKind, id: string, pin: string) => {
  const h = pins[slot(kind)][id];
  return Boolean(h && PIN_RE.test(pin) && safeEq(h, pinHash(kind, id, pin)));
};
export async function setPin(kind: PinKind, id: string, pin: string): Promise<void> {
  const pins = await loadPins();
  pins[slot(kind)][id] = pinHash(kind, id, pin);
  await kvSet(PINS_KEY, pins);
}
export async function clearPin(kind: PinKind, id: string): Promise<void> {
  const pins = await loadPins();
  delete pins[slot(kind)][id];
  await kvSet(PINS_KEY, pins);
}

// 照合できた端末に出すクッキーの値：期限.名前(base64url).署名
export function pinToken(kind: PinKind, id: string, now = Date.now()): string {
  const body = `${now + PIN_DAYS * 86400000}.${Buffer.from(id).toString('base64url')}`;
  return `${body}.${mac(`tok:${kind}:${body}`)}`;
}
export function pinTokenId(kind: PinKind, token: string | undefined | null, now = Date.now()): string {
  const parts = (token || '').split('.');
  if (parts.length !== 3 || !/^\d{13}$/.test(parts[0]) || Number(parts[0]) < now) return '';
  if (!safeEq(parts[2], mac(`tok:${kind}:${parts[0]}.${parts[1]}`))) return '';
  return Buffer.from(parts[1], 'base64url').toString();
}
export function setPinCookie(res: NextResponse, kind: PinKind, id: string): void {
  res.cookies.set(PIN_COOKIE[kind], pinToken(kind, id), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: PIN_DAYS * 86400 });
}

// その名前で操作してよいか。暗証番号を設定していない人は、これまでどおり（名前を選ぶだけ）。管理者は常に可。
export function pinVerified(req: NextRequest, pins: Pins, kind: PinKind, id: string): boolean {
  if (!hasPin(pins, kind, id)) return true;
  if (isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) return true;
  return pinTokenId(kind, req.cookies.get(PIN_COOKIE[kind])?.value) === id;
}
export const PIN_DENY_MESSAGE = '暗証番号の確認が必要です。いちどログアウトして、ログインし直してください。';
