import { kvGet, kvSet } from '@/lib/kv';
import { Notice, NOTICES_KEY, NOTICE_MAX, sortNotices } from '@/lib/notices';
import { Report } from '@/lib/types';

// 整備依頼に「修理予定日」が決まったら、全員向けのお知らせ（その日まで表示）を自動で出す。
// お知らせは依頼ごとに1つ（id は依頼の日報IDから決まる）。予定日を変えたら書き換え、取り消し・対応済・削除のときは消す。
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

export async function upsertScheduleNotice(r: Report, ymd: string, by: string): Promise<void> {
  const list = await kvGet<Notice[]>(NOTICES_KEY, []);
  const id = scheduleNoticeId(r.id);
  const { title, body } = scheduleText(r, ymd);
  const prev = list.find((n) => n.id === id);
  const notice: Notice = { id, title, body, level: 'important', createdAt: new Date().toISOString(), createdBy: by, expiresAt: ymd, ...(prev?.pinned ? { pinned: true } : {}) };
  const rest = list.filter((n) => n.id !== id);
  await kvSet(NOTICES_KEY, sortNotices([notice, ...rest]).slice(0, NOTICE_MAX));
}

export async function removeScheduleNotice(reportId: string): Promise<void> {
  const list = await kvGet<Notice[]>(NOTICES_KEY, []);
  const id = scheduleNoticeId(reportId);
  if (list.some((n) => n.id === id)) await kvSet(NOTICES_KEY, list.filter((n) => n.id !== id));
}
