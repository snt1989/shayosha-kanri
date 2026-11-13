import { NextResponse } from 'next/server';
import { UPDATES } from '@/lib/changelog';

export const dynamic = 'force-dynamic';

// いま公開されている版のID（画面が「新しい版がある」か見分けるのに使う）と、最新の更新内容
export async function GET() {
  const latest = UPDATES[0];
  return NextResponse.json(
    { id: process.env.NEXT_PUBLIC_BUILD_ID || 'dev', title: latest?.title || '', items: latest?.items || [] },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
