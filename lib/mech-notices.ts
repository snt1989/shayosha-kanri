import type { Notice } from '@/lib/notices';

// 整備士向けのお知らせ（整備台帳のページに出す）。全体のお知らせとは別のキーに保存し、管理者と整備士だけが見る・書く。
export const MECH_NOTICES_KEY = 'fleet:mech-notices:v1';
export const MECH_NOTICE_MAX = 60;
export type MechNotice = Notice;
