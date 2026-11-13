import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { kvDel, kvGet, kvSet } from '@/lib/kv';
import { isAdminOrMechanic } from '@/lib/mechanic-auth';

export const dynamic = 'force-dynamic';

// 車検証には所有者・使用者・車台番号などが載っているため、保存・閲覧・削除は管理者のみ。
// 画像は2種類：車検証（自動車検査証。kind=cert、既定）と、検査証記録事項（kind=record）
const kindOf = (req: NextRequest): 'cert' | 'record' => (new URL(req.url).searchParams.get('kind') === 'record' ? 'record' : 'cert');
const keyOf = (id: string, kind: 'cert' | 'record' = 'cert') => (kind === 'record' ? `fleet:shaken:v1:${id}:record` : `fleet:shaken:v1:${id}`);
const LABEL = { cert: '車検証', record: '検査証記録事項' } as const;
const PREFIX = 'data:image/jpeg;base64,';
const MAX_CHARS = 900_000;

type Stored = { image: string; savedAt: string };

// 管理者、または登録済みの整備士
async function allowed(req: NextRequest) {
  if (isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) return true;
  const data = await loadData();
  return isAdminOrMechanic(req, data.masters.mechanics);
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
  if (!(await allowed(req))) return NextResponse.json({ success: false, error: 'admin or mechanic only' }, { status: 401 });
  const { id } = await params;
  const stored = await kvGet<Stored | null>(keyOf(id, kindOf(req)), null);
  if (!stored?.image?.startsWith(PREFIX)) return new NextResponse('not found', { status: 404 });
  const bytes = Buffer.from(stored.image.slice(PREFIX.length), 'base64');
  return new NextResponse(bytes, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await allowed(req))) return NextResponse.json({ success: false, error: 'admin or mechanic only' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const image: unknown = body?.image;
  if (typeof image !== 'string' || !image.startsWith(PREFIX) || image.length > MAX_CHARS) {
    return NextResponse.json({ success: false, error: 'invalid image' }, { status: 400 });
  }
  const data = await loadData();
  const v = data.vehicles.find((x) => x.id === id);
  if (!v) return NextResponse.json({ success: false, error: 'vehicle not found' }, { status: 404 });
  const kind = kindOf(req);
  const savedAt = new Date().toISOString();
  await kvSet<Stored>(keyOf(id, kind), { image, savedAt });
  if (kind === 'record') v.recordFileAt = savedAt;
  else v.shakenFileAt = savedAt;
  pushLog(data, { actor: isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value) ? 'admin' : 'user', action: `${LABEL[kind]}の画像を保存`, target: v.name, detail: v.plate });
  await persist(data);
  return NextResponse.json({ success: true, savedAt });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await allowed(req))) return NextResponse.json({ success: false, error: 'admin or mechanic only' }, { status: 401 });
  const { id } = await params;
  const kind = kindOf(req);
  await kvDel(keyOf(id, kind));
  const data = await loadData();
  const v = data.vehicles.find((x) => x.id === id);
  if (v) {
    if (kind === 'record') delete v.recordFileAt;
    else delete v.shakenFileAt;
    pushLog(data, { actor: 'admin', action: `${LABEL[kind]}の画像を削除`, target: v.name, detail: v.plate });
    await persist(data);
  }
  return NextResponse.json({ success: true });
}
