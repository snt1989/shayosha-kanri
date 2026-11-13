'use client';

import { useEffect, useState } from 'react';
import { Insurance } from '@/lib/insurance';

const FIELDS: { k: keyof Insurance; label: string; ph?: string; type?: string }[] = [
  { k: 'company', label: '保険会社', ph: '三井住友海上' },
  { k: 'product', label: '保険の種類', ph: '自動車保険' },
  { k: 'policyNo', label: '証券番号', ph: '例：NC00000000' },
  { k: 'holder', label: '保険契約者' },
  { k: 'periodFrom', label: '保険期間（始まり）', type: 'date' },
  { k: 'periodTo', label: '満期日', type: 'date' },
  { k: 'agencyName', label: '取扱代理店' },
  { k: 'agencyPhone', label: '代理店の電話番号', ph: '019-000-0000' },
  { k: 'deskName', label: '保険会社の問い合わせ窓口' },
  { k: 'deskPhone', label: '窓口の電話番号' },
  { k: 'deskHours', label: '窓口の受付時間' },
];

// 設定「🚨 緊急連絡先」の中の、加入している保険の情報（証券番号・満期日・代理店）
export default function InsuranceAdmin() {
  const [f, setF] = useState<Insurance | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/insurance', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setF(j.insurance))
      .catch(() => undefined);
  }, []);

  async function save() {
    if (!f) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/insurance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ insurance: f }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.message || '保存できませんでした。');
      setF(j.insurance);
      setMsg('保存しました。事故・トラブルの画面に出ます。');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  if (!f) return null;
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3 className="card-title">🛡️ 加入している保険</h3>
      <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 12 }}>
        事故・トラブルの画面（🚨）に出す、保険の情報です。証券番号などを、運転者が保険会社へ伝えられます（ログインしていない人にも見えます）。保険を更新したら、証券番号と満期日を直してください。
      </div>
      <div className="field-row" style={{ flexWrap: 'wrap' }}>
        {FIELDS.map((x) => (
          <div className="field" key={x.k} style={{ minWidth: 200 }}>
            <label>{x.label}</label>
            <input type={x.type || 'text'} value={f[x.k]} placeholder={x.ph} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} />
          </div>
        ))}
      </div>
      <div className="field">
        <label>メモ（任意・300文字まで）</label>
        <textarea rows={2} maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={busy} onClick={save}>
          保存する
        </button>
        {msg && <span style={{ fontSize: 12, color: 'var(--slate-600)' }}>{msg}</span>}
      </div>
    </div>
  );
}
