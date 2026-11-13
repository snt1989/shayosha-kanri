import { kvGet, kvSet } from '@/lib/kv';
import { Notice, NOTICES_KEY, NOTICE_MAX, sortNotices } from '@/lib/notices';
import type { Report } from '@/lib/types';
import { scheduleNoticeId, scheduleText } from '@/lib/schedule-text';

// 整備依頼に「修理予定日」が決まったら、全員向けのお知らせ（その日まで表示）を自動で出す（サーバー専用）。
// お知らせは依頼ごとに1つ（id は依頼の日報IDから決まる）。予定日を変えたら書き換え、取り消し・対応済・削除のときは消す。
export { scheduleNoticeId, scheduleText, jpDate } from '@/lib/schedule-text';

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
