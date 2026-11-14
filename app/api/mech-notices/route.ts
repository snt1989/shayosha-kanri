import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { isAdminOrMechanic, mechanicNameOf } from '@/lib/mechanic-auth';
import { pushLog } from '@/lib/log';
import { kvGet, kvSet } from '@/lib/kv';
import { NOTICE_BODY_MAX, NOTICE_TITLE_MAX, isNoticeExpired, sortNotices, todayJst } from '@/lib/notices';
import { MECH_NOTICES_KEY, MECH_NOTICE_MAX, MechNotice } from '@/lib/mech-notices';

export const dynamic = 'force-dynamic';

const deny = () => NextResponse.json({ success: false, message: '整備士向けのお知らせは、整備士か管理者のログインが必要です。' }, { status: 401 });

// 一覧（管理者・整備士のみ）。期限が過ぎたものは、管理者以外には返さない。
export async function GET(req: NextRequest) {
  const data = await loadData();
  if (!isAdminOrMechanic(req, data.masters.mechanics)) return deny();
  const isAdmin = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const list = await kvGet<MechNotice[]>(MECH_NOTICES_KEY, []);
  return NextResponse.json({ success: true, notices: sortNotices(isAdmin ? list : list.filter((n) => !isNoticeExpired(n))) });
}

// 投稿・更新（管理者・整備士）。
export async function POST(req: NextRequest) {
  const data = await loadData();
  if (!isAdminOrMechanic(req, data.masters.mechanics)) return deny();
  const isAdmin = isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value);
  const who = isAdmin ? '管理者' : mechanicNameOf(req);
  const b = await req.json().catch(() => ({}));
  const title = String(b.title ?? '').trim();
  const body = String(b.body ?? '').trim();
  if (!title) return NextResponse.json({ success: false, message: 'タイトルを入力してください。' }, { status: 400 });
  if (title.length > NOTICE_TITLE_MAX) return NextResponse.json({ success: false, message: `タイトルは${NOTICE_TITLE_MAX}文字以内にしてください。` }, { status: 400 });
  if (body.length > NOTICE_BODY_MAX) return NextResponse.json({ success: false, message: `本文は${NOTICE_BODY_MAX}文字以内にしてください。` }, { status: 400 });
  const expiresAt = String(b.expiresAt ?? '').trim();
  if (expiresAt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) || Number.isNaN(Date.parse(expiresAt))) return NextResponse.json({ success: false, message: '表示期限の日付が正しくありません。' }, { status: 400 });
    if (expiresAt < todayJst()) return NextResponse.json({ success: false, message: '表示期限は、今日以降の日付にしてください。' }, { status: 400 });
  }
  const list = await kvGet<MechNotice[]>(MECH_NOTICES_KEY, []);
  const idx = b.id ? list.findIndex((n) => n.id === b.id) : -1;
  const notice: MechNotice = {
    id: idx >= 0 ? list[idx].id : 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title,
    body,
    level: b.level === 'important' ? 'important' : 'info',
    pinned: Boolean(b.pinned),
    ...(expiresAt ? { expiresAt } : {}),
    createdAt: idx >= 0 ? list[idx].createdAt : new Date().toISOString(),
    createdBy: idx >= 0 ? list[idx].createdBy : who,
  };
  if (idx >= 0) list[idx] = notice;
  else list.unshift(notice);
  await kvSet(MECH_NOTICES_KEY, sortNotices(list).slice(0, MECH_NOTICE_MAX));
  pushLog(data, { actor: isAdmin ? 'admin' : 'user', action: idx >= 0 ? '整備士向けお知らせ更新' : '整備士向けお知らせ投稿', target: title, detail: who });
  await saveData({ reports: data.reports, vehicles: data.vehicles, drivers: data.drivers, masters: data.masters, logs: data.logs });
  return NextResponse.json({ success: true, id: notice.id });
}
