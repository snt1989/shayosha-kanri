'use client';

import { useEffect, useState } from 'react';
import { IncidentContact, cleanContacts } from '@/lib/incidents';

// 設定の「緊急連絡先」。事故・トラブルのボタンに、110・119 のほかに出す電話番号（管理者、保険会社、ロードサービスなど）
export default function IncidentContactsAdmin() {
  const [rows, setRows] = useState<IncidentContact[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/incident-contacts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setRows(j.contacts || []))
      .catch(() => undefined);
  }, []);

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/incident-contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contacts: rows }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.message || '保存できませんでした。');
      setRows(j.contacts);
      setMsg('保存しました。事故・トラブルのボタンに出ます。');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  const valid = cleanContacts(rows).length;
  return (
    <div className="card">
      <h3 className="card-title">🚨 緊急連絡先</h3>
      <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 12 }}>
        ヘッダーの「🚨」（事故・トラブルのとき）に、警察（110）・救急（119）のほかに出す電話番号です。管理者の携帯、保険会社の事故受付、ロードサービスなどを入れます（10件まで。誰でも見られます）。
      </div>
      {rows.map((r, i) => (
        <div key={i} className="field-row" style={{ alignItems: 'end' }}>
          <div className="field">
            <label>名前</label>
            <input value={r.label} maxLength={30} placeholder="例：保険会社 事故受付" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          </div>
          <div className="field">
            <label>電話番号</label>
            <input value={r.phone} maxLength={30} inputMode="tel" placeholder="例：0120-000-000" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
          </div>
          <button type="button" className="btn btn-sm btn-danger" style={{ marginBottom: 14 }} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            削除
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn" disabled={rows.length >= 10} onClick={() => setRows([...rows, { label: '', phone: '' }])}>
          ＋ 連絡先を追加
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
          保存する
        </button>
        {rows.length > valid && <span style={{ fontSize: 12, color: 'var(--amber-600)' }}>名前と電話番号がそろっていない行は、保存されません。</span>}
        {msg && <span style={{ fontSize: 12, color: 'var(--slate-600)' }}>{msg}</span>}
      </div>
    </div>
  );
}
