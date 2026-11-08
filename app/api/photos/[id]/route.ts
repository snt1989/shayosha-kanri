import { NextRequest, NextResponse } from 'next/server';
import { kvDel, kvGet } from '@/lib/kv';
import { PHOTO_ID_RE } from '@/lib/photo-ids';

export const dynamic = 'force-dynamic';

const PREFIX = 'data:image/jpeg;base64,';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PHOTO_ID_RE.test(id)) return new NextResponse('not found', { status: 404 });
  const stored = await kvGet<{ image: string } | null>(`fleet:photo:v1:${id}`, null);
  if (!stored?.image?.startsWith(PREFIX)) return new NextResponse('not found', { status: 404 });
  return new NextResponse(Buffer.from(stored.image.slice(PREFIX.length), 'base64'), {
    // idは写真ごとに変わり中身は変わらないので、端末に長く覚えさせて通信量を減らす
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
}

// 追加したあとで取り消した写真を消す（まだどこにも付けていない写真を消す用）
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PHOTO_ID_RE.test(id)) return NextResponse.json({ success: false }, { status: 400 });
  await kvDel(`fleet:photo:v1:${id}`);
  return NextResponse.json({ success: true });
}
