'use client';

import { useState } from 'react';
import { CARD_KINDS, CardKind, FleetCard } from '@/lib/types';
import Modal from './Modal';
import { cardsApi, useCards } from './useCards';

const kindOf = (k: CardKind) => CARD_KINDS.find((x) => x.key === k) || CARD_KINDS[0];

// 設定ページの「カードの登録」。ガソリンカード・ETCカードの登録・編集・削除は管理者だけ（サーバー側でも管理者ログインを確認する）。
export default function CardsAdmin({ departments, isAdmin, onRequestAdminLogin }: { departments: string[]; isAdmin: boolean; onRequestAdminLogin: () => void }) {
  const { cards, loans, loaded, reload } = useCards();
  const [editingCard, setEditingCard] = useState<FleetCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isAdmin) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <h3 className="card-title">💳 カードの登録（管理者）</h3>
        <div className="notice-box">ガソリンカード・ETCカードの登録・編集・削除は、管理者だけができます。</div>
        <button className="btn btn-primary" onClick={onRequestAdminLogin}>
          🔒 管理者ログイン
        </button>
      </div>
    );
  }

  const isOut = (id: string) => loans.some((l) => l.cardId === id && !l.returnedAt);

  async function save() {
    if (!editingCard) return;
    setBusy(true);
    setError('');
    try {
      await cardsApi('/api/cards', { method: 'POST', body: JSON.stringify(editingCard) });
      setEditingCard(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: FleetCard) {
    if (!confirm(`「${c.name}」を削除しますか？（貸出の履歴は残ります）`)) return;
    try {
      await cardsApi(`/api/cards?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' });
    } catch (e) {
      alert((e as Error).message);
    }
    await reload();
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="toolbar2">
        <div>
          <h3 className="card-title" style={{ marginBottom: 4 }}>
            💳 カードの登録（管理者）
          </h3>
          <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
            貸し出すガソリンカード・ETCカードを、事業部ごとに登録できます。登録したカードは「カード貸出」のページで借りられます。カード番号の全桁は入れないでください（識別番号は下4桁など）。
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => { setError(''); setEditingCard({ id: '', kind: 'gas', name: '', dept: '', number: '', note: '' }); }}>
            ＋ カードを登録
          </button>
        </div>
      </div>

      {!loaded ? (
        <div className="empty-state">読み込み中…</div>
      ) : cards.length === 0 ? (
        <div className="empty-state">カードはまだ登録されていません</div>
      ) : (
        <div className="menu-order-list">
          {cards.map((c) => (
            <div key={c.id} className="menu-order-row">
              <span className="menu-order-ic">{kindOf(c.kind).icon}</span>
              <span className="menu-order-label">
                {c.name}
                <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--slate-500)', marginLeft: 6 }}>
                  {kindOf(c.kind).label}
                  {c.dept ? ` ／ ${c.dept}` : ''}
                  {c.number ? ` ／ ${c.number}` : ''}
                </span>
              </span>
              {isOut(c.id) && <span className="pill pill-amber">貸出中</span>}
              <button className="btn btn-sm" onClick={() => { setError(''); setEditingCard({ ...c }); }}>
                ✏️ 編集
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => remove(c)} disabled={isOut(c.id)} title={isOut(c.id) ? '貸出中のカードは削除できません' : ''}>
                削除
              </button>
            </div>
          ))}
        </div>
      )}

      {editingCard && (
        <Modal
          title={editingCard.id ? 'カードを編集' : 'カードを登録'}
          onClose={() => setEditingCard(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditingCard(null)}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                {busy ? '保存中…' : '保存する'}
              </button>
            </>
          }
        >
          <div className="field-row">
            <div className="field">
              <label>種類</label>
              <select value={editingCard.kind} onChange={(e) => setEditingCard({ ...editingCard, kind: e.target.value as CardKind })}>
                {CARD_KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.icon} {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>カード名（必須）</label>
              <input value={editingCard.name} maxLength={40} onChange={(e) => setEditingCard({ ...editingCard, name: e.target.value })} placeholder="例：ガソリンカード1" />
            </div>
          </div>
          <div className="field">
            <label>事業部（任意）</label>
            <select value={editingCard.dept || ''} onChange={(e) => setEditingCard({ ...editingCard, dept: e.target.value })}>
              <option value="">指定しない</option>
              {editingCard.dept && !departments.includes(editingCard.dept) && <option value={editingCard.dept}>{editingCard.dept}</option>}
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>識別番号（任意。下4桁など。カード番号の全桁は入れないでください）</label>
            <input value={editingCard.number || ''} maxLength={30} onChange={(e) => setEditingCard({ ...editingCard, number: e.target.value })} placeholder="例：下4桁 1234" />
          </div>
          <div className="field">
            <label>備考（任意）</label>
            <input value={editingCard.note || ''} maxLength={200} onChange={(e) => setEditingCard({ ...editingCard, note: e.target.value })} placeholder="例：保管場所：事務所の鍵付き引き出し" />
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
