import type { AppData, FuelLog, Report } from '../../lib/types';

// Web版（Next.js）の /api をそのまま使う。管理者向けの API（編集・削除・マスタ）は、このアプリでは呼ばない。

export type ServerConfig = {
  baseUrl: string;
  // サーバー側で Basic 認証（BASIC_AUTH_USER / BASIC_AUTH_PASSWORD）を有効にしているときだけ入力する
  basicUser?: string;
  basicPass?: string;
};

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// 入力されたURLを整える。http(s)が無ければ https を補い、末尾の / を除く。使えない形なら null。
export function normalizeBaseUrl(input: string): string | null {
  let s = (input || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  s = s.replace(/\/+$/, '');
  return /^https?:\/\/[^\s/?#]+/i.test(s) && !/\s/.test(s) ? s : null;
}

function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

// Basic認証のヘッダー用。日本語のパスワードでも壊れないよう、UTF-8にしてからBase64にする。
export function toBase64(text: string): string {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = utf8Bytes(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += table[a >> 2];
    out += table[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : table[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : table[c & 63];
  }
  return out;
}

export function createApi(cfg: ServerConfig, timeoutMs = 20000) {
  const base = normalizeBaseUrl(cfg.baseUrl);
  if (!base) throw new ApiError('サーバーのURLを正しく入力してください。');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.basicUser) headers.Authorization = 'Basic ' + toBase64(`${cfg.basicUser}:${cfg.basicPass ?? ''}`);

  async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(base + path, {
        method: init?.method ?? 'GET',
        headers,
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
        signal: ctrl.signal,
        credentials: 'include',
      });
      const text = await res.text();
      let body: { message?: string } = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = {};
      }
      if (!res.ok) {
        const fallback = res.status === 401 ? '認証が必要です。サーバーでBasic認証を設定している場合は、設定画面でユーザー名とパスワードを入力してください。' : `サーバーがエラーを返しました（${res.status}）。`;
        throw new ApiError(body.message || fallback, res.status);
      }
      return body as T;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if ((e as Error)?.name === 'AbortError') throw new ApiError('サーバーから返事がありません。通信状態を確かめてください。');
      throw new ApiError('サーバーに接続できません。通信状態とサーバーのURLを確かめてください。');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    baseUrl: base,
    loadData: () => request<AppData>('/api/data'),
    // 新規登録と、出庫中の日報の帰着登録（確定済みの日報の編集は管理者のみで、このアプリでは行わない）
    saveReport: (r: Report) => request<{ success: boolean; id: string }>('/api/reports', { method: 'POST', body: r }),
    saveFuelLog: (f: FuelLog) => request<{ success: boolean; id: string }>('/api/fuel-logs', { method: 'POST', body: f }),
  };
}

export type Api = ReturnType<typeof createApi>;
