'use client';

import { useEffect, useRef, useState } from 'react';
import { compressToJpeg } from '@/lib/image';
import { isPdfFile, readPdf } from '@/lib/pdf';
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
  // 証券・満期のお知らせの読み込み（AI）
  const fileRef = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState<{ image: string; text: string; name: string } | null>(null);
  const [aiAvail, setAiAvail] = useState<boolean | null>(null);
  const [reading, setReading] = useState<'file' | 'ai' | null>(null);
  const [readKeys, setReadKeys] = useState<(keyof Insurance)[]>([]);
  const [readNote, setReadNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/insurance', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        setF(j.insurance);
        setSaved(j.insurance);
      })
      .catch(() => setMsg({ ok: false, text: '保険の情報を読み込めませんでした。' }));
  }, []);

  useEffect(() => {
    fetch('/api/insurance-ai', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setAiAvail(Boolean(j?.configured)))
      .catch(() => setAiAvail(false));
  }, []);

  // 書類（写真またはPDF）を選ぶ。PDFは、1ページ目を画像にして、文字も取り出す
  async function pickFile(file: File | null) {
    if (!file) return;
    setReadNote(null);
    setReading('file');
    try {
      if (isPdfFile(file)) {
        const r = await readPdf(file);
        setDoc({ image: r.image, text: r.text.replace(/[ \t]+/g, ' ').trim(), name: file.name });
      } else {
        const url: string = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => reject(new Error('read'));
          fr.readAsDataURL(file);
        });
        setDoc({ image: url, text: '', name: file.name });
      }
    } catch {
      setReadNote({ ok: false, text: '書類を開けませんでした。ファイルを確かめるか、写真（画像）でお試しください。' });
    } finally {
      setReading(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // AIで読み取って、フォームに入れる（保存はしない。内容を見比べてから、保存する）
  async function readWithAi() {
    if (!doc || !f) return;
    setReading('ai');
    setReadNote(null);
    try {
      const image = await compressToJpeg(doc.image, 2200, 1_200_000);
      const res = await fetch('/api/insurance-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, text: doc.text.slice(0, 6000) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.message || 'AIでの読み取りに失敗しました。手入力してください。');
      const got = j.fields as Partial<Record<keyof Insurance, string>>;
      const keys = (Object.keys(got) as (keyof Insurance)[]).filter((k) => got[k]);
      if (!keys.length) {
        setReadKeys([]);
        setReadNote({ ok: false, text: 'この書類から、項目を読み取れませんでした。写真を撮り直すか、手入力してください。' });
        return;
      }
      setF({ ...f, ...Object.fromEntries(keys.map((k) => [k, got[k]])) } as Insurance);
      setReadKeys(keys);
      setReadNote({ ok: true, text: `${keys.length}項目を読み取って、入れました。書類と見比べて、まちがいがないか確かめてから、「保存する」を押してください。` });
    } catch (e) {
      setReadNote({ ok: false, text: e instanceof Error ? e.message : 'AIでの読み取りに失敗しました。手入力してください。' });
    } finally {
      setReading(null);
    }
  }

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

      <div className="ins-read">
        <div className="ins-group-title">📄 証券・満期のお知らせから読み込む</div>
        <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 8 }}>
          保険証券や「満期日のお知らせ」の写真かPDFを選ぶと、AIが証券番号・期間・代理店などを読み取って、下の欄に入れます（保存は、内容を確かめてからです）。
        </div>
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" hidden onChange={(e) => pickFile(e.target.files?.[0] || null)} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-sm" disabled={reading !== null} onClick={() => fileRef.current?.click()}>
            {reading === 'file' ? '開いています…' : doc ? '📎 別の書類を選ぶ' : '📎 書類（写真・PDF）を選ぶ'}
          </button>
          {doc && (
            <button type="button" className="btn btn-sm btn-primary" disabled={reading !== null || aiAvail === false} onClick={readWithAi}>
              {reading === 'ai' ? '読み取り中…（数秒〜20秒）' : '🤖 AIで読み取る'}
            </button>
          )}
          {doc && <span style={{ fontSize: 12, color: 'var(--slate-500)' }}>{doc.name}</span>}
        </div>
        {aiAvail === false && <div className="notice-box" style={{ marginTop: 8 }}>AI読み取りは、まだ設定されていません（サーバーに ANTHROPIC_API_KEY が必要です）。手入力はできます。</div>}
        {doc && aiAvail !== false && <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 6 }}>「AIで読み取る」を押すと、書類の画像が、社外のAI（Anthropic社）に送られます。読み取る項目は、この画面の項目だけです。</div>}
        {doc && <img className="ins-read-preview" src={doc.image} alt="選んだ書類の1ページ目" />}
        {readNote && <div role="status" className="notice-box" style={{ marginTop: 8, borderColor: readNote.ok ? 'var(--green-600, #16a34a)' : undefined }}>{readNote.text}</div>}
      </div>

      {GROUPS.slice(0, 1).map((g) => (
        <div key={g.title} className="ins-group">
          <div className="ins-group-title">{g.title}</div>
          <div className="ins-grid">
            {g.fields.map((x) => (
              <div className="field" key={x.k}>
                <label>{x.label}{readKeys.includes(x.k) && <span className="ins-read-badge">読み取り</span>}</label>
                <input type={x.type || 'text'} value={f[x.k]} placeholder={x.ph} onChange={(e) => { setReadKeys((ks) => ks.filter((k) => k !== x.k)); setF({ ...f, [x.k]: e.target.value }); }} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="ins-group">
        <div className="ins-group-title">保険期間</div>
        <div className="ins-grid">
          <div className="field">
            <label>保険期間（始まり）{readKeys.includes('periodFrom') && <span className="ins-read-badge">読み取り</span>}</label>
            <input type="date" value={f.periodFrom} onChange={(e) => { setReadKeys((ks) => ks.filter((k) => k !== 'periodFrom')); setF({ ...f, periodFrom: e.target.value }); }} />
          </div>
          <div className="field">
            <label>満期日（終わり）{readKeys.includes('periodTo') && <span className="ins-read-badge">読み取り</span>}</label>
            <input type="date" value={f.periodTo} onChange={(e) => { setReadKeys((ks) => ks.filter((k) => k !== 'periodTo')); setF({ ...f, periodTo: e.target.value }); }} />
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
                <label>{x.label}{readKeys.includes(x.k) && <span className="ins-read-badge">読み取り</span>}</label>
                <input type={x.type || 'text'} value={f[x.k]} placeholder={x.ph} onChange={(e) => { setReadKeys((ks) => ks.filter((k) => k !== x.k)); setF({ ...f, [x.k]: e.target.value }); }} />
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
