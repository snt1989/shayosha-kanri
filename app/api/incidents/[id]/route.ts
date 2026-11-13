import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { kvGet, kvSet } from '@/lib/kv';
import { INCIDENTS_KEY, Incident } from '@/lib/incidents';

export const dynamic = 'force-dynamic';

const guard = (req: NextRequest) =>
  isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value) ? null : NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401 });

// 対応済・対応中の切り替えと、対応メモの保存（管理者のみ）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = guard(req);
  if (g) return g;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const list = await kvGet<Incident[]>(INCIDENTS_KEY, []);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return NextResponse.json({ success: false, message: '報告が見つかりません。' }, { status: 404 });
  const cur = list[i];
  if (b.status === 'done' || b.status === 'open') {
    cur.status = b.status;
    cur.doneAt = b.status === 'done' ? new Date().toISOString() : undefined;
  }
  if (typeof b.memo === 'string') cur.memo = b.memo.trim().slice(0, 500);
  list[i] = cur;
  await kvSet(INCIDENTS_KEY, list);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = guard(req);
  if (g) return g;
  const { id } = await params;
  const list = await kvGet<Incident[]>(INCIDENTS_KEY, []);
  await kvSet(INCIDENTS_KEY, list.filter((x) => x.id !== id));
  return NextResponse.json({ success: true });
}
