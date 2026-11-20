import { NextRequest, NextResponse } from 'next/server';
import { ARCHIVE_KEEP_MONTHS, loadArchiveIndex, loadArchiveMonth } from '@/lib/report-archive';

export const dynamic = 'force-dynamic';

// 保管した古い日報（読むだけ）。?month=YYYY-MM でその月の日報、指定なしで月の一覧と件数。
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month');
  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ success: false, message: '月の指定が正しくありません。' }, { status: 400 });
    return NextResponse.json({ success: true, month, reports: await loadArchiveMonth(month) });
  }
  const index = await loadArchiveIndex();
  const months = Object.entries(index.months)
    .map(([m, count]) => ({ month: m, count }))
    .sort((a, b) => b.month.localeCompare(a.month));
  return NextResponse.json({ success: true, months, total: index.total, keepMonths: ARCHIVE_KEEP_MONTHS });
}
