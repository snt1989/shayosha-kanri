import { NextRequest, NextResponse } from 'next/server';
import { saveSnapshot } from '@/lib/backup';
import { runExclusive } from '@/lib/kv';
import { archiveOldReports } from '@/lib/report-archive';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 毎晩（vercel.json の crons）、全種類のバックアップの控えを保存する。7日分を残す。
// 控えを取ったあとで、古い日報（帰着済みで、3か月より前の月のもの）を保管へ移す。
// 認証は、ほかの cron と同じ（CRON_SECRET の Bearer）。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: '認証に失敗しました。' }, { status: 401 });
  }
  const r = await saveSnapshot();
  const archived = await runExclusive(() => archiveOldReports());
  return NextResponse.json({ success: true, ...r, archived });
}
