import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { savePhoto } from '@/lib/photo-store';

export const dynamic = 'force-dynamic';

// 整備依頼・整備記録に添付する写真を保存する（保存先は lib/photo-store.ts。Vercel Blob があれば Blob、無ければ Redis）。端末側で小さく圧縮したJPEGだけを受け付ける（上限は約110KB）。
// 運転者・整備士のログインは端末側の確認なので、保存は誰でもできる。閲覧は推測できないid（ランダム）を知っている場合だけ。
const PREFIX = 'data:image/jpeg;base64,';
const MAX_CHARS = 150_000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const image: unknown = body?.image;
  if (typeof image !== 'string' || !image.startsWith(PREFIX) || image.length > MAX_CHARS || !/^[A-Za-z0-9+/=]+$/.test(image.slice(PREFIX.length))) {
    return NextResponse.json({ success: false, message: '写真を保存できませんでした。' }, { status: 400 });
  }
  const id = 'p' + randomUUID().replace(/-/g, '');
  await savePhoto(id, image);
  return NextResponse.json({ success: true, id });
}
