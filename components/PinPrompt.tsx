'use client';

import { useState } from 'react';
import Modal from './Modal';

// ログインのときの、暗証番号（数字4けた）の確認。暗証番号を設定している人だけに出る。
export default function PinPrompt({ kind, id, label, onOk, onClose }: { kind: 'driver' | 'mechanic'; id: string; label: string; onOk: () => void; onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!/^\d{4}$/.test(pin)) return setError('数字4けたで入力してください。');
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, id, pin }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) {
        setPin('');
        return setError(j.message || '確認できませんでした。');
      }
      onOk();
    } catch {
      setError('確認できませんでした。電波の良い場所で、もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="🔑 暗証番号"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || pin.length !== 4}>
            {busy ? '確認中…' : 'ログイン'}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        <strong>{label}</strong> さんの暗証番号（数字4けた）を入力してください。
      </p>
      <input
        className="pin-input"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        autoFocus
        aria-label="暗証番号"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      {error && (
        <div className="notice-box" role="alert" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--slate-500)' }}>忘れたときは、管理者に消してもらってください（設定 →「🔑 暗証番号」）。</p>
    </Modal>
  );
}
