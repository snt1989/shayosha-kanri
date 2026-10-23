'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppData } from '@/lib/types';
import { AutoNotice, Notice, buildAutoNotices } from '@/lib/notices';
import { UPDATES, countUnreadUpdates } from '@/lib/changelog';
import { todayStr } from '@/lib/utils';
import Modal from './Modal';
import { PushState, usePush } from './usePush';

type Go = AutoNotice['go'];

const SEEN_KEY = 'fleet:notices:seen';
const SEEN_UPDATE_KEY = 'fleet:updates:seen';
const readKey = (k: string) => {
  try {
    return localStorage.getItem(k) || '';
  } catch {
    return '';
  }
};
const writeKey = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // 保存できなくても動く（未読の表示が戻るだけ）
  }
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function NoticeBell({ data, isAdmin, onNavigate }: { data: AppData | null; isAdmin: boolean; onNavigate: (go: Go) => void }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<'notices' | 'auto' | 'updates'>('notices');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [seen, setSeen] = useState('');
  const [seenUpdate, setSeenUpdate] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', important: false, pinned: false, push: true });

  const auto = useMemo(() => (data ? buildAutoNotices(data) : []), [data]);

  const loadNotices = useCallback(async () => {
    try {
      const res = await fetch('/api/notices', { cache: 'no-store' });
      if (!res.ok) return;
      const j = (await res.json()) as { notices: Notice[] };
      setNotices(j.notices || []);
    } catch {
      // 通信できないときは、前に取得した内容のまま
    }
  }, []);

  // 最初の読み込み・1分ごと・画面に戻ったとき
  useEffect(() => {
    setSeen(readKey(SEEN_KEY));
    setSeenUpdate(readKey(SEEN_UPDATE_KEY));
    loadNotices();
    const t = setInterval(loadNotices, 60000);
    const onVis = () => document.visibilityState === 'visible' && loadNotices();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [loadNotices]);

  // 通知を押して開いたとき（/?notices=1）は、お知らせを開く
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('notices') === '1') {
      setOpen(true);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const latest = notices.reduce((m, n) => (n.createdAt > m ? n.createdAt : m), '');
  const unread = notices.filter((n) => n.createdAt > seen).length;
  const unreadUpdates = countUnreadUpdates(seenUpdate, todayStr());
  // 更新は、未読が何件あっても、ベルの数字には1つ分だけ数える（初めて使う端末で数字が大きくなりすぎないように）
  const badge = unread + auto.length + Math.min(unreadUpdates, 1);

  // 連絡事項を表示したら既読にする
  useEffect(() => {
    if (open && section === 'notices' && latest && latest > seen) {
      writeKey(SEEN_KEY, latest);
      setSeen(latest);
    }
  }, [open, section, latest, seen]);

  // アプリの更新を表示したら既読にする
  useEffect(() => {
    if (open && section === 'updates' && UPDATES[0] && UPDATES[0].id > seenUpdate) {
      writeKey(SEEN_UPDATE_KEY, UPDATES[0].id);
      setSeenUpdate(UPDATES[0].id);
    }
  }, [open, section, seenUpdate]);

  const { state: push, busy: pushBusy, refresh: refreshPushState, enable: enablePush, disable: disablePush } = usePush(setMsg);

  useEffect(() => {
    if (open) refreshPushState();
  }, [open, refreshPushState]);

  async function post() {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, body: form.body, level: form.important ? 'important' : 'info', pinned: form.pinned, push: form.push }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(j.message || '投稿できませんでした。');
      setForm({ title: '', body: '', important: false, pinned: false, push: form.push });
      await loadNotices();
      setMsg(j.push?.enabled ? `投稿しました。${j.push.sent}台に通知を送りました。` : '投稿しました。');
    } catch {
      setMsg('通信できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  async function remove(n: Notice) {
    if (!window.confirm(`「${n.title}」を削除しますか？`)) return;
    const res = await fetch('/api/notices/' + n.id, { method: 'DELETE' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(j.message || '削除できませんでした。');
    await loadNotices();
  }

  async function sendTest() {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      setMsg(res.ok ? `テスト通知を送りました（成功 ${j.sent} / 登録 ${j.total}台）。` : j.message || '送信できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  const pushUi: Record<PushState, { text: string; action?: () => void; label?: string }> = {
    loading: { text: '確認中…' },
    unsupported: { text: 'このブラウザ・端末では、プッシュ通知を使えません。' },
    'ios-install': { text: 'iPhone では、Safari の共有ボタンから「ホーム画面に追加」して、そのアイコンから開くと通知を使えます。' },
    unconfigured: { text: 'プッシュ通知の設定がまだ行われていません（管理者が鍵を登録すると使えます）。' },
    denied: { text: '通知がブロックされています。ブラウザ（端末）の設定で、このサイトの通知を許可してください。' },
    off: { text: 'この端末には、まだ通知が届きません。', action: enablePush, label: '🔔 この端末で通知を受け取る' },
    on: { text: 'この端末に通知が届きます（お知らせの投稿と、毎朝のまとめ）。', action: disablePush, label: '通知を止める' },
  };
  const p = pushUi[push];

  return (
    <>
      <button type="button" className="bell-btn" onClick={() => setOpen(true)} title="お知らせ" aria-label={`お知らせ${badge > 0 ? `（${badge}件）` : ''}`}>
        <span aria-hidden className="bell-icon">🔔</span>
        {badge > 0 && <span className="bell-badge">{badge > 99 ? '99+' : badge}</span>}
      </button>

      {open &&
        // ヘッダーの中に置くと、ヘッダーの文字の折り返しなどの指定を引き継いでしまうので、ページ直下に表示する
        createPortal(
        <Modal title="🔔 お知らせ" onClose={() => setOpen(false)} wide>
          <div className="help-chips" role="group" aria-label="お知らせの種類">
            <button type="button" className={`help-chip ${section === 'notices' ? 'active' : ''}`} aria-pressed={section === 'notices'} onClick={() => setSection('notices')}>
              📢 連絡事項（{notices.length}）
            </button>
            <button type="button" className={`help-chip ${section === 'auto' ? 'active' : ''}`} aria-pressed={section === 'auto'} onClick={() => setSection('auto')}>
              ⚠️ 状況のお知らせ（{auto.length}）
            </button>
            <button type="button" className={`help-chip ${section === 'updates' ? 'active' : ''}`} aria-pressed={section === 'updates'} onClick={() => setSection('updates')}>
              🆕 アプリの更新{unreadUpdates > 0 && <span className="bell-badge" style={{ marginLeft: 6 }}>{unreadUpdates}</span>}
            </button>
          </div>

          {section === 'updates' ? (
            <div className="notice-list">
              {UPDATES.map((u) => (
                <div key={u.id} className={`notice-item ${u.id > seenUpdate && unreadUpdates > 0 ? 'update-new' : ''}`}>
                  <div className="notice-head">
                    <strong>{u.title}</strong>
                    <span className="notice-date">{u.date}</span>
                  </div>
                  <ul className="update-items">
                    {u.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : section === 'notices' ? (
            <div className="notice-list">
              {notices.length === 0 && <div className="empty-state">連絡事項はありません</div>}
              {notices.map((n) => (
                <div key={n.id} className={`notice-item ${n.level === 'important' ? 'important' : ''}`}>
                  <div className="notice-head">
                    <strong>
                      {n.pinned && '📌 '}
                      {n.level === 'important' && <span className="pill pill-red" style={{ marginRight: 6 }}>重要</span>}
                      {n.title}
                    </strong>
                    <span className="notice-date">{fmt(n.createdAt)}</span>
                  </div>
                  {n.body && <div className="notice-body">{n.body}</div>}
                  {isAdmin && (
                    <div style={{ textAlign: 'right', marginTop: 6 }}>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(n)}>
                        削除
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="alert-list">
              {auto.length === 0 && <div className="empty-state">🎉 いま対応が必要なお知らせはありません</div>}
              {auto.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`alert-item ${a.level === 'danger' ? 'danger' : a.level === 'warn' ? 'warn' : ''} auto-notice`}
                  onClick={() => {
                    setOpen(false);
                    onNavigate(a.go);
                  }}
                >
                  <span>{a.icon}</span>
                  <div>{a.text}</div>
                </button>
              ))}
              <div style={{ fontSize: 11, color: 'var(--slate-500)' }}>車検・免許・オイル交換・アルコール検知・帰着未登録・整備依頼から、いまのデータで自動で表示しています。押すと該当の画面を開きます。</div>
            </div>
          )}

          {isAdmin && (
            <div className="notice-form">
              <h3 className="card-title">✏️ 連絡事項を投稿（管理者）</h3>
              <div className="field">
                <label>タイトル（60文字まで）</label>
                <input value={form.title} maxLength={60} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例：10/30 は社用車の一斉点検です" />
              </div>
              <div className="field">
                <label>本文（任意）</label>
                <textarea rows={3} value={form.body} maxLength={1000} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              </div>
              <div className="check-row">
                <label className="checkbox-field">
                  <input type="checkbox" checked={form.important} onChange={(e) => setForm({ ...form, important: e.target.checked })} /> 重要
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> 上に固定
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={form.push} onChange={(e) => setForm({ ...form, push: e.target.checked })} /> 通知も送る
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" disabled={busy || !form.title.trim()} onClick={post}>
                  投稿する
                </button>
                {push !== 'unconfigured' && (
                  <button type="button" className="btn" disabled={busy} onClick={sendTest}>
                    テスト通知を送る
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="notice-push">
            <h3 className="card-title">📲 この端末への通知</h3>
            <div style={{ fontSize: 13, color: 'var(--slate-600)', marginBottom: 8 }}>{p.text}</div>
            {p.action && (
              <button type="button" className={`btn ${push === 'off' ? 'btn-primary' : ''}`} disabled={busy || pushBusy} onClick={p.action}>
                {p.label}
              </button>
            )}
          </div>
          {msg && (
            <div role="status" className="notice-msg">
              {msg}
            </div>
          )}
        </Modal>,
        document.body
      )}
    </>
  );
}
