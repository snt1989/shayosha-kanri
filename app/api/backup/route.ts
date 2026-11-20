import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { collectBackup, loadSnapshot } from '@/lib/backup';

export const dynamic = 'force-dynamic';

// 全種類のバックアップをJSONで返す（管理者のみ）。?id=YYYY-MM-DD で、毎晩の控えを返す。
export async function GET(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get('id');
  const b = id ? await loadSnapshot(id) : await collectBackup();
  if (!b) return NextResponse.json({ success: false, message: 'その日の控えは、見つかりません。' }, { status: 404 });
  return NextResponse.json(b, { headers: { 'Cache-Control': 'no-store' } });
}
