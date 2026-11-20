import { NextRequest, NextResponse } from 'next/server';
import { saveSnapshot } from '@/lib/backup';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 毎晩（vercel.json の crons）、全種類のバックアップの控えを保存する。7日分を残す。
// 認証は、ほかの cron と同じ（CRON_SECRET の Bearer）。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: '認証に失敗しました。' }, { status: 401 });
  }
  const r = await saveSnapshot();
  return NextResponse.json({ success: true, ...r });
}
