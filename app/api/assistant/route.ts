import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { loadData } from '@/lib/store';
import { kvGet, kvSet } from '@/lib/kv';
import { ASSISTANT_RULES, dataSnapshot, helpText } from '@/lib/assistant-context';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 管理者向けのAIアシスタント（質問に答えるだけ。記録の変更はしない）。
// 質問のたびに、車両・運転者・日報・給油・整備などの記録（個人の連絡先や写真は除く）を社外（Anthropic）へ送る。
const MODEL = process.env.ASSISTANT_MODEL || process.env.SHAKEN_AI_MODEL || 'claude-sonnet-5-5';
const DAILY_LIMIT = Number(process.env.ASSISTANT_DAILY_LIMIT) || 200; // 1日の質問回数の上限（使いすぎ防止）
const MAX_TURNS = 20;
const MAX_CHARS = 2000;

type Msg = { role: 'user' | 'assistant'; content: string };

function cleanMessages(v: unknown): Msg[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: Msg[] = [];
  for (const m of v.slice(-MAX_TURNS)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null;
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (!content) return null;
    out.push({ role: m.role, content });
  }
  // 先頭は質問、最後も質問、あいだは交互にする
  while (out.length && out[0].role !== 'user') out.shift();
  if (out.length === 0 || out[out.length - 1].role !== 'user') return null;
  for (let i = 1; i < out.length; i++) if (out[i].role === out[i - 1].role) return null;
  return out;
}

export async function GET(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, error: 'admin only' }, { status: 401 });
  }
  return NextResponse.json({ success: true, configured: Boolean(process.env.ANTHROPIC_API_KEY) });
}

export async function POST(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: 'AIアシスタントは、管理者ログインが必要です。' }, { status: 401 });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ success: false, message: 'AIアシスタントは、まだ設定されていません（ANTHROPIC_API_KEY が必要です）。' }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const messages = cleanMessages(body?.messages);
  if (!messages) {
    return NextResponse.json({ success: false, message: '質問を入力してください。' }, { status: 400 });
  }

  // 1日の回数の上限（日本時間の日付で数える）
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const counterKey = `fleet:assistant:v1:count:${today}`;
  const used = await kvGet<number>(counterKey, 0);
  if (used >= DAILY_LIMIT) {
    return NextResponse.json({ success: false, message: `AIアシスタントの1日の利用回数（${DAILY_LIMIT}回）に達しました。明日またお試しください。` }, { status: 429 });
  }
  await kvSet(counterKey, used + 1);

  const data = await loadData();
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system: [
          // 変わらない部分（指示と使い方）は、まとめて覚えさせて（キャッシュ）、2回目以降を速く・安くする
          { type: 'text', text: `${ASSISTANT_RULES}\n\n【使い方】\n${helpText()}`, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: `【記録】\n${dataSnapshot(data, today)}` },
        ],
        messages,
      }),
    });
  } catch {
    return NextResponse.json({ success: false, message: 'AIに接続できませんでした。時間をおいて、もう一度お試しください。' }, { status: 502 });
  }
  if (!res.ok) {
    const message = res.status === 401 ? 'APIキーが正しくないようです。' : res.status === 429 ? 'AIの利用回数の上限に達しました。時間をおいてお試しください。' : `AIの回答に失敗しました（${res.status}）。`;
    return NextResponse.json({ success: false, message }, { status: 502 });
  }
  const j = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[] } | null;
  const reply = (j?.content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join('').trim();
  if (!reply) return NextResponse.json({ success: false, message: 'AIから回答が返りませんでした。もう一度お試しください。' }, { status: 502 });
  return NextResponse.json({ success: true, reply });
}
