import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { listSnapshots, saveSnapshot } from '@/lib/backup';
import { withWriteLock } from '@/lib/lock';

export const dynamic = 'force-dynamic';

// 毎晩の自動バックアップ（控え）の一覧（管理者のみ）
export async function GET(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401 });
  }
  return NextResponse.json({ success: true, snapshots: await listSnapshots() });
}

// いますぐ、今日の控えを作る（管理者のみ。同じ日の控えは上書き）
export const POST = withWriteLock(async function POST(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401 });
  }
  await saveSnapshot();
  return NextResponse.json({ success: true, snapshots: await listSnapshots() });
});
