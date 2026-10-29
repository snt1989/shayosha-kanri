'use client';

import { useCallback, useEffect, useState } from 'react';
import { Notice } from '@/lib/notices';

// ダッシュボードの先頭に出す「全体へのお知らせ」（管理者が書いた連絡事項。固定したものが先頭）。
// 投稿・削除はベルのお知らせ（管理者）で行う。ここは、見るだけ。
export const OPEN_NOTICES_EVENT = 'fleet:open-notices';
const SHOW_MAX = 5;

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function DashboardNotices({ isAdmin }: { isAdmin: boolean }) {
  const [notices, setNotices] = useState<Notice[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notices', { cache: 'no-store' });
      if (!res.ok) return;
      const j = (await res.json()) as { notices: Notice[] };
      setNotices(j.notices || []);
    } catch {
      // 通信できないときは、前に取得した内容のまま
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const openBell = () => window.dispatchEvent(new Event(OPEN_NOTICES_EVENT));
  const list = notices ?? [];
  const shown = list.slice(0, SHOW_MAX);

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 className="card-title">
        📢 全体へのお知らせ
        {list.length > 0 && <span className="pill pill-slate" style={{ marginLeft: 8 }}>{list.length}件</span>}
      </h3>
      {notices === null ? (
        <div className="empty-state">読み込み中…</div>
      ) : shown.length === 0 ? (
        <div className="empty-state">全体へのお知らせはありません</div>
      ) : (
        <div className="notice-list">
          {shown.map((n) => (
            <div key={n.id} className={`notice-item ${n.level === 'important' ? 'important' : ''}`}>
              <div className="notice-head">
                <strong>
                  {n.pinned && '📌 '}
                  {n.level === 'important' && <span className="pill pill-red" style={{ marginRight: 6 }}>重要</span>}
                  {n.title}
                </strong>
                <span className="notice-date">{fmtDate(n.createdAt)}</span>
              </div>
              {n.body && <div className="notice-body">{n.body}</div>}
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {list.length > SHOW_MAX && (
          <button type="button" className="btn btn-sm" onClick={openBell}>
            すべて見る（{list.length}件）
          </button>
        )}
        {isAdmin && (
          <button type="button" className="btn btn-primary btn-sm" onClick={openBell}>
            ＋ お知らせを投稿する
          </button>
        )}
      </div>
    </div>
  );
}
