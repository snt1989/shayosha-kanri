import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { kvDel, kvGet, kvSet } from '@/lib/kv';

export const dynamic = 'force-dynamic';

// 車検証には所有者・使用者・車台番号などが載っているため、保存・閲覧・削除は管理者のみ。
const keyOf = (id: string) => `fleet:shaken:v1:${id}`;
const PREFIX = 'data:image/jpeg;base64,';
const MAX_CHARS = 900_000;

type Stored = { image: string; savedAt: string };

function isAdmin(req: NextRequest) {
  return isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
}

async function persist(data: Awaited<ReturnType<typeof loadData>>) {
  await saveData({
    reports: data.reports,
    vehicles: data.vehicles,
    drivers: data.drivers,
    masters: data.masters,
    logs: data.logs,
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ success: false, error: 'admin only' }, { status: 401 });
  const { id } = await params;
  const stored = await kvGet<Stored | null>(keyOf(id), null);
  if (!stored?.image?.startsWith(PREFIX)) return new NextResponse('not found', { status: 404 });
  const bytes = Buffer.from(stored.image.slice(PREFIX.length), 'base64');
  return new NextResponse(bytes, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ success: false, error: 'admin only' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const image: unknown = body?.image;
  if (typeof image !== 'string' || !image.startsWith(PREFIX) || image.length > MAX_CHARS) {
    return NextResponse.json({ success: false, error: 'invalid image' }, { status: 400 });
  }
  const data = await loadData();
  const v = data.vehicles.find((x) => x.id === id);
  if (!v) return NextResponse.json({ success: false, error: 'vehicle not found' }, { status: 404 });
  const savedAt = new Date().toISOString();
  await kvSet<Stored>(keyOf(id), { image, savedAt });
  v.shakenFileAt = savedAt;
  pushLog(data, { actor: 'admin', action: '車検証の画像を保存', target: v.name, detail: v.plate });
  await persist(data);
  return NextResponse.json({ success: true, savedAt });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ success: false, error: 'admin only' }, { status: 401 });
  const { id } = await params;
  await kvDel(keyOf(id));
  const data = await loadData();
  const v = data.vehicles.find((x) => x.id === id);
  if (v) {
    delete v.shakenFileAt;
    pushLog(data, { actor: 'admin', action: '車検証の画像を削除', target: v.name, detail: v.plate });
    await persist(data);
  }
  return NextResponse.json({ success: true });
}
