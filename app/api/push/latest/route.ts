import { NextResponse } from 'next/server';
import { loadLast } from '@/lib/push';

export const dynamic = 'force-dynamic';

// 直近に送った通知の本文。端末のサービスワーカーが、通知の合図を受けたときに取りに来る。
export async function GET() {
  const last = await loadLast();
  return NextResponse.json(last ?? { title: 'お知らせがあります', body: 'アプリを開いて確認してください。', url: '/?notices=1', at: '' });
}
