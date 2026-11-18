'use client';

import { useEffect, useState } from 'react';
import { Insurance } from '@/lib/insurance';
import { daysUntil } from '@/lib/utils';

type Field = { k: keyof Insurance; label: string; ph?: string; type?: string; wide?: boolean };

const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: '契約の内容',
    fields: [
      { k: 'company', label: '保険会社', ph: '三井住友海上' },
      { k: 'product', label: '保険の種類', ph: '自動車保険' },
      { k: 'policyNo', label: '証券番号', ph: '例：NC00000000' },
      { k: 'holder', label: '保険契約者' },
    ],
  },
  {
    title: '取扱代理店',
    fields: [
      { k: 'agencyName', label: '代理店の名前' },
      { k: 'agencyPhone', label: '代理店の電話番号', ph: '019-000-0000' },
    ],
  },
  {
    title: '保険会社の問い合わせ窓口',
    fields: [
      { k: 'deskName', label: '窓口の名前' },
      { k: 'deskPhone', label: '窓口の電話番号' },
      { k: 'deskHours', label: '受付時間', wide: true },
    ],
  },
];

const addYear = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return '';
  // うるう日（2/29）は、翌年の2/28にする
  const day = m === 2 && d === 29 ? 28 : d;
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// 設定の「🛡️ 保険情報」：加入している保険の証券番号・期間・代理店などを、更新のたびに直すページ。
// 内容は、事故・故障の画面（🆘）に出て、事故のときに保険会社へ伝えられる。
export default function InsuranceAdmin() {
  const [f, setF] = useState<Insurance | null>(null);
  const [saved, setSaved] = useState<Insurance | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/insurance', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        setF(j.insurance);
        setSaved(j.insurance);
      })
      .catch(() => setMsg({ ok: false, text: '保険の情報を読み込めませんでした。' }));
  }, []);

  async function save() {
    if (!f) return;
    if (f.periodFrom && f.periodTo && f.periodTo < f.periodFrom) {
      setMsg({ ok: false, text: '満期日が、保険期間の始まりより前になっています。日付を確かめてください。' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/insurance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ insurance: f }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.message || '保存できませんでした。');
      setF(j.insurance);
      setSaved(j.insurance);
      setMsg({ ok: true, text: '保存しました。事故・故障の画面（🆘）に、この内容が出ます。' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '保存できませんでした。' });
    } finally {
      setBusy(false);
    }
  }

  if (!f) return <div className="card"><div className="empty-state">{msg ? msg.text : '読み込み中…'}</div></div>;

  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const left = f.periodTo ? daysUntil(f.periodTo) : null;
  const status =
    left === null
      ? { cls: 'pill-slate', text: '満期日が未入力です' }
      : left < 0
        ? { cls: 'pill-red', text: `満期日（${f.periodTo}）を${-left}日過ぎています。更新後の内容に直してください。` }
        : left <= 60
          ? { cls: 'pill-amber', text: `満期日（${f.periodTo}）まで あと${left}日。更新したら、証券番号と期間を直してください。` }
          : { cls: 'pill-green', text: `満期日（${f.periodTo}）まで あと${left}日` };

  return (
    <div className="card">
      <h3 className="card-title">🛡️ 保険情報</h3>
      <div className={`pill ${status.cls} ins-status`}>{status.text}</div>
      <div style={{ fontSize: 12, color: 'var(--slate-500)', margin: '8px 0 12px' }}>
        加入している自動車保険の情報です。事故・故障の画面（🆘）に出て、運転者が保険会社へ証券番号などを伝えられます（ログインしていない人にも見えます）。保険を更新したら、ここを直してください。
      </div>

      {GROUPS.slice(0, 1).map((g) => (
        <div key={g.title} className="ins-group">
          <div className="ins-group-title">{g.title}</div>
          <div className="ins-grid">
            {g.fields.map((x) => (
              <div className="field" key={x.k}>
                <label>{x.label}</label>
                <input type={x.type || 'text'} value={f[x.k]} placeholder={x.ph} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="ins-group">
        <div className="ins-group-title">保険期間</div>
        <div className="ins-grid">
          <div className="field">
            <label>保険期間（始まり）</label>
            <input type="date" value={f.periodFrom} onChange={(e) => setF({ ...f, periodFrom: e.target.value })} />
          </div>
          <div className="field">
            <label>満期日（終わり）</label>
            <input type="date" value={f.periodTo} onChange={(e) => setF({ ...f, periodTo: e.target.value })} />
          </div>
        </div>
        {f.periodTo && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <button type="button" className="btn btn-sm" onClick={() => setF({ ...f, periodFrom: f.periodTo, periodTo: addYear(f.periodTo) })}>
              🔄 1年更新にする（期間を1年先へ）
            </button>
            <span style={{ fontSize: 11, color: 'var(--slate-500)' }}>いまの満期日を新しい期間の始まりにして、満期日を1年後にします。証券番号は、更新後のものに直してください。</span>
          </div>
        )}
      </div>

      {GROUPS.slice(1).map((g) => (
        <div key={g.title} className="ins-group">
          <div className="ins-group-title">{g.title}</div>
          <div className="ins-grid">
            {g.fields.map((x) => (
              <div className="field" key={x.k} style={x.wide ? { gridColumn: '1 / -1' } : undefined}>
                <label>{x.label}</label>
                <input type={x.type || 'text'} value={f[x.k]} placeholder={x.ph} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="field">
        <label>メモ（任意・300文字まで）</label>
        <textarea rows={2} maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="例：免責金額・特約・事故のときに伝えること" />
      </div>

      <div className="ins-preview">
        <div className="ins-group-title">🆘 事故・故障の画面での見え方</div>
        <dl>
          <dt>{f.company || '保険会社'} {f.product}</dt>
          <dd className="ins-no">証券番号 {f.policyNo || '（未入力）'}</dd>
          {f.holder && (<><dt>保険契約者</dt><dd>{f.holder}</dd></>)}
          {f.periodTo && (<><dt>満期日</dt><dd>{f.periodTo}</dd></>)}
          {f.agencyName && (<><dt>取扱代理店</dt><dd>{f.agencyName}</dd></>)}
        </dl>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
        <button className="btn btn-primary" disabled={busy || !dirty} onClick={save}>
          {busy ? '保存中…' : '保存する'}
        </button>
        {dirty && (
          <button className="btn" disabled={busy} onClick={() => { setF(saved); setMsg(null); }}>
            変更をやめる
          </button>
        )}
        {dirty && <span style={{ fontSize: 12, color: 'var(--amber-600)' }}>まだ保存していません</span>}
        {msg && <span role="status" style={{ fontSize: 12, color: msg.ok ? 'var(--green-600, #16a34a)' : 'var(--red-600, #dc2626)' }}>{msg.text}</span>}
      </div>
    </div>
  );
}
