'use client';

import { useState } from 'react';
import { AppData, CARD_KINDS, CardKind, CardLoan, Driver, FleetCard } from '@/lib/types';
import { downloadCsv } from '@/lib/csv';
import { todayStr } from '@/lib/utils';
import Modal from './Modal';
import { fmtDateTime, isOverdue, useCards } from './useCards';

const kindOf = (k: CardKind) => CARD_KINDS.find((x) => x.key === k) || CARD_KINDS[0];

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.message || `失敗しました (${res.status})`);
  return j;
}

// ガソリンカード・ETCカードの借用（貸出）。誰でも借りる・返却できる（運転者ログイン）。カードの登録・編集・削除と履歴の訂正は管理者のみ。
export default function CardsTab({
  data,
  currentDriver,
  isAdmin,
  onRequestDriverLogin,
}: {
  data: AppData;
  currentDriver: Driver | null;
  isAdmin: boolean;
  onRequestDriverLogin: () => void;
}) {
  const { cards, loans, loaded, reload } = useCards();
  const today = todayStr();
  const [kindFilter, setKindFilter] = useState<'' | CardKind>('');
  const [borrowing, setBorrowing] = useState<FleetCard | null>(null);
  const [form, setForm] = useState({ dueDate: '', purpose: '', vehicleId: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const outOf = (cardId: string) => loans.find((l) => l.cardId === cardId && !l.returnedAt);
  const shown = cards.filter((c) => !kindFilter || c.kind === kindFilter);
  const outCount = cards.filter((c) => outOf(c.id)).length;
  const overdueCount = loans.filter((l) => isOverdue(l, today)).length;
  const cardName = (id: string) => cards.find((c) => c.id === id)?.name || '（削除済みのカード）';
  const history = [...loans].sort((a, b) => b.borrowedAt.localeCompare(a.borrowedAt)).slice(0, 100);

  function startBorrow(c: FleetCard) {
    if (!currentDriver) return onRequestDriverLogin();
    setForm({ dueDate: '', purpose: '', vehicleId: '', note: '' });
    setError('');
    setBorrowing(c);
  }

  async function submitBorrow() {
    if (!borrowing || !currentDriver) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/cards/loans', { method: 'POST', body: JSON.stringify({ ...form, cardId: borrowing.id, driverId: currentDriver.id }) });
      setBorrowing(null);
      setMsg(`${borrowing.name} を借りました。使い終わったら「返却する」を押してください。`);
      await reload();
    } catch (e) {
      setError((e as Error).message);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function giveBack(l: CardLoan) {
    if (!currentDriver && !isAdmin) return onRequestDriverLogin();
    if (!confirm(`${cardName(l.cardId)} を返却しましたか？（借りた人：${l.borrower}）`)) return;
    try {
      await api(`/api/cards/loans/${l.id}`, { method: 'POST', body: JSON.stringify({ driverId: currentDriver?.id || '' }) });
      setMsg(`${cardName(l.cardId)} の返却を記録しました。`);
    } catch (e) {
      alert((e as Error).message);
    }
    await reload();
  }

  async function removeLoan(l: CardLoan) {
    if (!confirm('この貸出の記録を削除しますか？（入力の間違いを直すとき用です）')) return;
    try {
      await api(`/api/cards/loans/${l.id}`, { method: 'DELETE' });
    } catch (e) {
      alert((e as Error).message);
    }
    await reload();
  }

  function exportCsv() {
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [['借りた日時', 'カード', '種類', '借りた人', '事業部', '用途・行先', '使用車両', '返却予定日', '返却日時', '返却を記録した人', '備考']];
    [...loans]
      .sort((a, b) => b.borrowedAt.localeCompare(a.borrowedAt))
      .forEach((l) => {
        const c = cards.find((x) => x.id === l.cardId);
        rows.push([l.borrowedAt, cardName(l.cardId), c ? kindOf(c.kind).label : '', l.borrower, l.dept || '', l.purpose || '', l.vehicleName || '', l.dueDate || '', l.returnedAt || '', l.returnedBy || '', l.note || '']);
      });
    downloadCsv(`カード貸出履歴_${today}.csv`, rows.map((r) => r.map(esc).join(',')).join('\r\n'));
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="toolbar2">
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}>
              💳 ガソリンカード・ETCカードの貸出
              {outCount > 0 && <span className="pill pill-amber" style={{ marginLeft: 8 }}>貸出中 {outCount}枚</span>}
              {overdueCount > 0 && <span className="pill pill-red" style={{ marginLeft: 6 }}>返却期限超過 {overdueCount}件</span>}
            </h3>
            <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
              借りるときは「借りる」、返したら「返却する」を押して記録します（借りるには運転者としてのログインが必要です）。
            </div>
          </div>
          <div className="actions">
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as '' | CardKind)} aria-label="種類で絞り込む">
              <option value="">すべての種類</option>
              {CARD_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.icon} {k.label}
                </option>
              ))}
            </select>
            <button className="btn" onClick={exportCsv} disabled={loans.length === 0}>
              ⬇ 履歴CSV
            </button>
          </div>
        </div>
        {msg && (
          <div role="status" className="notice-box" style={{ marginTop: 10 }}>
            {msg}
          </div>
        )}
      </div>

      {!loaded ? (
        <div className="card">
          <div className="empty-state">読み込み中…</div>
        </div>
      ) : shown.length === 0 ? (
        <div className="card">
          <div className="empty-state">{cards.length === 0 ? 'カードがまだ登録されていません。管理者が「⚙️ 設定」のページから登録します。' : '該当するカードはありません'}</div>
        </div>
      ) : (
        <div className="cardgrid">
          {shown.map((c) => {
            const out = outOf(c.id);
            const late = out ? isOverdue(out, today) : false;
            const k = kindOf(c.kind);
            return (
              <div key={c.id} className="entity-card">
                <div className="ehead">
                  <div>
                    <div className="ename">
                      {k.icon} {c.name}
                    </div>
                    <div className="esub">
                      {k.label}
                      {c.number ? ` ／ ${c.number}` : ''}
                    </div>
                  </div>
                  {out ? (
                    <span className={`pill ${late ? 'pill-red' : 'pill-amber'}`}>{late ? '返却期限超過' : '貸出中'}</span>
                  ) : (
                    <span className="pill pill-green">在庫あり</span>
                  )}
                </div>
                {out && (
                  <div style={{ fontSize: 13, margin: '6px 0' }}>
                    <strong>{out.borrower}</strong>
                    {out.dept ? `（${out.dept}）` : ''} さんが借用中
                    <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
                      {fmtDateTime(out.borrowedAt)} から
                      {out.dueDate ? `／ 返却予定 ${out.dueDate}` : ''}
                      {out.purpose ? `／ ${out.purpose}` : ''}
                      {out.vehicleName ? `／ ${out.vehicleName}` : ''}
                    </div>
                  </div>
                )}
                {c.note && <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>{c.note}</div>}
                <div className="efoot">
                  <div className="eactions">
                    {out ? (
                      <button className="btn btn-sm btn-primary" onClick={() => giveBack(out)}>
                        ↩ 返却する
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-primary" onClick={() => startBorrow(c)}>
                        借りる
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <h3 className="card-title">📜 貸出の履歴（新しい順・100件まで）</h3>
        {history.length === 0 ? (
          <div className="empty-state">貸出の履歴はありません</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>借りた日時</th>
                  <th>カード</th>
                  <th>借りた人</th>
                  <th>用途・行先</th>
                  <th>返却</th>
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {history.map((l) => (
                  <tr key={l.id}>
                    <td data-label="借りた日時">{fmtDateTime(l.borrowedAt)}</td>
                    <td data-label="カード">{cardName(l.cardId)}</td>
                    <td data-label="借りた人">{l.borrower}</td>
                    <td data-label="用途・行先">{[l.purpose, l.vehicleName].filter(Boolean).join(' / ') || '-'}</td>
                    <td data-label="返却">
                      {l.returnedAt ? (
                        <>
                          {fmtDateTime(l.returnedAt)}
                          {l.returnedBy ? `（${l.returnedBy}）` : ''}
                        </>
                      ) : isOverdue(l, today) ? (
                        <span className="pill pill-red">未返却（期限超過）</span>
                      ) : (
                        <span className="pill pill-amber">貸出中</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td>
                        <button className="btn btn-sm btn-danger" onClick={() => removeLoan(l)}>
                          削除
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {borrowing && currentDriver && (
        <Modal
          title={`${kindOf(borrowing.kind).icon} ${borrowing.name} を借りる`}
          onClose={() => setBorrowing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setBorrowing(null)}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={submitBorrow} disabled={busy}>
                {busy ? '送信中…' : '借りる'}
              </button>
            </>
          }
        >
          <div className="notice-box">借りる人：{currentDriver.lastName} {currentDriver.firstName}。使い終わったら、このページの「返却する」を押してください。</div>
          <div className="field-row">
            <div className="field">
              <label>返却予定日（任意）</label>
              <input type="date" min={today} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div className="field">
              <label>使用する車両（任意）</label>
              <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
                <option value="">指定しない</option>
                {data.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}（{v.plate}）
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>用途・行先（任意）</label>
            <input value={form.purpose} maxLength={100} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="例：○○現場への出張" />
          </div>
          <div className="field">
            <label>備考（任意）</label>
            <input value={form.note} maxLength={200} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          {error && (
            <div role="alert" className="notice-box" style={{ borderColor: 'var(--red-600, #dc2626)' }}>
              {error}
            </div>
          )}
        </Modal>
      )}

    </div>
  );
}
