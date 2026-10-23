import { NextRequest, NextResponse } from 'next/server';
import { loadData, saveData } from '@/lib/store';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { pushLog } from '@/lib/log';
import { kvGet, kvSet } from '@/lib/kv';
import { pushConfig, sendPushToAll } from '@/lib/push';
import { Notice, NOTICES_KEY, NOTICE_BODY_MAX, NOTICE_MAX, NOTICE_TITLE_MAX, sortNotices } from '@/lib/notices';

export const dynamic = 'force-dynamic';

// 連絡事項の一覧（誰でも見られる）
export async function GET() {
  const list = await kvGet<Notice[]>(NOTICES_KEY, []);
  return NextResponse.json({ notices: sortNotices(list), push: { enabled: pushConfig().enabled } });
}

// 連絡事項の投稿・更新（管理者のみ）。push が true なら、登録済みの端末に通知も送る。
export async function POST(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: 'お知らせの投稿には管理者ログインが必要です。' }, { status: 401 });
  }
  const b = await req.json().catch(() => ({}));
  const title = String(b.title ?? '').trim();
  const body = String(b.body ?? '').trim();
  if (!title) return NextResponse.json({ success: false, message: 'タイトルを入力してください。' }, { status: 400 });
  if (title.length > NOTICE_TITLE_MAX) return NextResponse.json({ success: false, message: `タイトルは${NOTICE_TITLE_MAX}文字以内にしてください。` }, { status: 400 });
  if (body.length > NOTICE_BODY_MAX) return NextResponse.json({ success: false, message: `本文は${NOTICE_BODY_MAX}文字以内にしてください。` }, { status: 400 });

  const list = await kvGet<Notice[]>(NOTICES_KEY, []);
  const idx = b.id ? list.findIndex((n) => n.id === b.id) : -1;
  const notice: Notice = {
    id: idx >= 0 ? list[idx].id : 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title,
    body,
    level: b.level === 'important' ? 'important' : 'info',
    pinned: Boolean(b.pinned),
    createdAt: idx >= 0 ? list[idx].createdAt : new Date().toISOString(),
    createdBy: idx >= 0 ? list[idx].createdBy : '管理者',
  };
  if (idx >= 0) list[idx] = notice;
  else list.unshift(notice);
  await kvSet(NOTICES_KEY, sortNotices(list).slice(0, NOTICE_MAX));

  const data = await loadData();
  pushLog(data, { actor: 'admin', action: idx >= 0 ? 'お知らせ更新' : 'お知らせ投稿', target: title, detail: notice.level === 'important' ? '重要' : '' });
  await saveData({ reports: data.reports, vehicles: data.vehicles, drivers: data.drivers, masters: data.masters, logs: data.logs });

  // 新規の投稿のときだけ通知を送る（直しただけでは送らない）
  const push = b.push && idx < 0 ? await sendPushToAll({ title: `${notice.level === 'important' ? '【重要】' : ''}${title}`, body: body || 'お知らせを確認してください。', url: '/?notices=1' }) : null;
  return NextResponse.json({ success: true, id: notice.id, push });
}
