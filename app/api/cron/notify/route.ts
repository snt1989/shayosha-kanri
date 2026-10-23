import { NextRequest, NextResponse } from 'next/server';
import { loadData } from '@/lib/store';
import { buildAutoNotices, summarizeAutoNotices } from '@/lib/notices';
import { pushConfig, sendPushToAll } from '@/lib/push';

export const dynamic = 'force-dynamic';

// 毎朝（vercel.json の crons）、車検・免許・オイル・アルコール・未帰着・整備依頼のまとめを通知する。
// Vercel の定期実行は、環境変数 CRON_SECRET を設定すると「Authorization: Bearer <CRON_SECRET>」を付けて呼ぶ。
// CRON_SECRET が無い・合わないときは何もしない（外から勝手に通知を送られないようにする）。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: '認証に失敗しました。' }, { status: 401 });
  }
  if (!pushConfig().enabled) return NextResponse.json({ success: true, skipped: '通知の設定（VAPID鍵）が未設定です。' });
  const data = await loadData();
  const items = buildAutoNotices(data);
  const summary = summarizeAutoNotices(items);
  if (!summary) return NextResponse.json({ success: true, skipped: '通知する内容がありません。', count: 0 });
  const r = await sendPushToAll({ ...summary, url: '/?notices=1' });
  return NextResponse.json({ success: true, count: items.length, ...r });
}
