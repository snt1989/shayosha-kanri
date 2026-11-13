import type { Report } from '@/lib/types';

// 画面（ブラウザ）からも使える、修理予定日の表示用の関数。サーバー専用の処理（KV）は lib/maint-schedule.ts に置く。
export const scheduleNoticeId = (reportId: string) => `sched-${reportId}`;

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// 'YYYY-MM-DD' を「11月20日（金）」の形に
export function jpDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}月${d}日（${WEEKDAYS[w]}）`;
}

export function scheduleText(r: Pick<Report, 'vehicleName' | 'plate' | 'maintRequestType' | 'driver'>, ymd: string): { title: string; body: string } {
  return {
    title: `🔧 修理予定日が決まりました：${r.vehicleName}`,
    body: `${r.vehicleName}${r.plate ? `（${r.plate}）` : ''}の${r.maintRequestType || '整備'}は、${jpDate(ymd)}に行う予定です。依頼者：${r.driver}さん。`,
  };
}
