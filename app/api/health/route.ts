import { NextResponse } from 'next/server';
import { kvGet, kvKeys, kvSet, runExclusive } from '@/lib/kv';
import { blobEnabled } from '@/lib/photo-store';

export const dynamic = 'force-dynamic';

// 動作確認用：保存先（KV）と、書き込みロックが動いているかを返す。データの中身は返さない。
export async function GET() {
  const out: Record<string, unknown> = { ok: true, at: new Date().toISOString(), build: (process.env.NEXT_PUBLIC_BUILD_ID || '').slice(0, 7), photos: blobEnabled() ? 'blob' : 'kv' };
  try {
    const t0 = Date.now();
    await runExclusive(async () => {
      await kvSet('fleet:health:v1', t0);
      out.kv = (await kvGet<number>('fleet:health:v1', 0)) === t0;
    });
    out.lock = true;
    out.lockMs = Date.now() - t0;
    out.keys = (await kvKeys('fleet:health')).length;
  } catch (e) {
    out.ok = false;
    out.error = e instanceof Error ? e.message.slice(0, 120) : 'error';
  }
  return NextResponse.json(out, { status: out.ok ? 200 : 500, headers: { 'Cache-Control': 'no-store' } });
}
