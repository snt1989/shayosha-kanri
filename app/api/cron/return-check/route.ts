import { NextRequest, NextResponse } from 'next/server';
import { loadData } from '@/lib/store';
import { summarizeOpenReturns } from '@/lib/notices';
import { pushConfig, sendPushToAll } from '@/lib/push';

export const dynamic = 'force-dynamic';

// 毎夕（vercel.json の crons）、帰着登録がまだの車両があるときだけ通知する。無ければ何も送らない。
// 認証は /api/cron/notify と同じ（CRON_SECRET の Bearer）。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: '認証に失敗しました。' }, { status: 401 });
  }
  if (!pushConfig().enabled) return NextResponse.json({ success: true, skipped: '通知の設定（VAPID鍵）が未設定です。' });
  const summary = summarizeOpenReturns(await loadData());
  if (!summary) return NextResponse.json({ success: true, skipped: '帰着登録がまだの車両はありません。', count: 0 });
  const r = await sendPushToAll({ ...summary, url: '/?notices=1' });
  return NextResponse.json({ success: true, ...r });
}
