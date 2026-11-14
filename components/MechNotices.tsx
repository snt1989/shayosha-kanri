'use client';

import { useCallback, useEffect, useState } from 'react';
import { isNoticeExpired } from '@/lib/notices';
import type { MechNotice } from '@/lib/mech-notices';
import { todayStr, mechanicHeaders } from '@/lib/utils';

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
};
const blank = { id: '', title: '', body: '', level: 'info' as 'info' | 'important', pinned: false, expiresAt: '' };

// 整備台帳の先頭に出す「整備士向けのお知らせ」。管理者・整備士だけが見られて、書ける・直せる・消せる。
export default function MechNotices({ canEdit }: { canEdit: boolean }) {
  const [list, setList] = useState<MechNotice[] | null>(null);
  const [form, setForm] = useState<typeof blank | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [all, setAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mech-notices', { cache: 'no-store', headers: mechanicHeaders() });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.success) setList(j.notices || []);
    } catch {
      // 前に取得した内容のまま
    }
  }, []);

  useEffect(() => {
    if (!canEdit) return;
    load();
    const t = setInterval(load, 60000);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [canEdit, load]);

  async function save() {
    if (!form) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/mech-notices', { method: 'POST', headers: { 'Content-Type': 'application/json', ...mechanicHeaders() }, body: JSON.stringify(form) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.message || '保存できませんでした。');
      setForm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  async function remove(n: MechNotice) {
    if (!confirm(`「${n.title}」を削除しますか？`)) return;
    await fetch(`/api/mech-notices/${n.id}`, { method: 'DELETE', headers: mechanicHeaders() });
    await load();
  }

  if (!canEdit) return null; // 整備士・管理者のログインがないときは、出さない
  const visible = (list ?? []).filter((n) => !isNoticeExpired(n));
  const shown = all ? visible : visible.slice(0, 3);

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 className="card-title">
        📣 整備士向けのお知らせ
        {visible.length > 0 && <span className="pill pill-slate" style={{ marginLeft: 8 }}>{visible.length}件</span>}
      </h3>
      <div style={{ fontSize: 11, color: 'var(--slate-500)', marginBottom: 8 }}>整備士と管理者だけに見えます（部品の入荷・工場の予定・申し送りなど）。</div>
      {list === null ? (
        <div className="empty-state">読み込み中…</div>
      ) : visible.length === 0 ? (
        <div className="empty-state">整備士向けのお知らせはありません</div>
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
                <span className="notice-date">
                  {fmt(n.createdAt)} {n.createdBy}
                </span>
              </div>
              {n.body && <div className="notice-body">{n.body}</div>}
              {n.expiresAt && <div style={{ fontSize: 11, color: 'var(--slate-500)' }}>表示は {n.expiresAt} まで</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button type="button" className="btn btn-sm" onClick={() => { setForm({ id: n.id, title: n.title, body: n.body, level: n.level, pinned: Boolean(n.pinned), expiresAt: n.expiresAt || '' }); setError(''); }}>
                  編集
                </button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(n)}>
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {visible.length > 3 && (
          <button type="button" className="btn btn-sm" onClick={() => setAll(!all)}>
            {all ? '少なく表示' : `すべて見る（${visible.length}件）`}
          </button>
        )}
        {!form && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { setForm({ ...blank }); setError(''); }}>
            ＋ お知らせを書く
          </button>
        )}
      </div>
      {form && (
        <div className="notice-form" style={{ marginTop: 12, borderTop: '1px solid var(--slate-200)', paddingTop: 12 }}>
          <div className="field">
            <label>タイトル *</label>
            <input value={form.title} maxLength={60} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例：スタッドレスタイヤ入荷（11/20）" />
          </div>
          <div className="field">
            <label>内容（任意）</label>
            <textarea rows={3} maxLength={1000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
          <div className="check-row">
            <label className="checkbox-field">
              <input type="checkbox" checked={form.level === 'important'} onChange={(e) => setForm({ ...form, level: e.target.checked ? 'important' : 'info' })} /> 重要
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> 先頭に固定
            </label>
          </div>
          <div className="field">
            <label>表示期限（任意・この日まで表示）</label>
            <input type="date" min={todayStr()} value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </div>
          {error && <div role="alert" className="notice-box" style={{ marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
              {form.id ? '更新する' : '投稿する'}
            </button>
            <button type="button" className="btn" onClick={() => setForm(null)}>
              やめる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
