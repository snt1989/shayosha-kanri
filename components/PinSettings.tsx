'use client';

import { useState } from 'react';
import type { Driver } from '@/lib/types';

export type PinInfo = { drivers: string[]; mechanics: string[] };
type Kind = 'driver' | 'mechanic';

function SelfForm({ kind, id, label, has, onChanged }: { kind: Kind; id: string; label: string; has: boolean; onChanged: () => void }) {
  const [cur, setCur] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

  async function save() {
    if (!/^\d{4}$/.test(pin)) return setMsg({ ok: false, text: '新しい暗証番号は、数字4けたで入力してください。' });
    if (pin !== pin2) return setMsg({ ok: false, text: '確認用の番号が、ちがっています。' });
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/pins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, id, pin, currentPin: cur }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) return setMsg({ ok: false, text: j.message || '保存できませんでした。' });
      setCur('');
      setPin('');
      setPin2('');
      setMsg({ ok: true, text: has ? '暗証番号を変更しました。' : '暗証番号を設定しました。次のログインから、この番号が必要になります。' });
      onChanged();
    } catch {
      setMsg({ ok: false, text: '保存できませんでした。' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pin-self">
      <div style={{ marginBottom: 8 }}>
        {kind === 'driver' ? '🪪 運転者' : '🔧 整備士'}：<strong>{label}</strong>
        <span className={`pill ${has ? 'pill-green' : 'pill-slate'}`} style={{ marginLeft: 8 }}>
          {has ? '設定済み' : '未設定'}
        </span>
      </div>
      <div className="field-row">
        {has && (
          <div className="field">
            <label>いまの暗証番号</label>
            <input className="pin-input" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={cur} onChange={(e) => setCur(digits(e.target.value))} />
          </div>
        )}
        <div className="field">
          <label>新しい暗証番号（数字4けた）</label>
          <input className="pin-input" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(e) => setPin(digits(e.target.value))} />
        </div>
        <div className="field">
          <label>もう一度（確認）</label>
          <input className="pin-input" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin2} onChange={(e) => setPin2(digits(e.target.value))} />
        </div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
        {busy ? '保存中…' : has ? '暗証番号を変更する' : '暗証番号を設定する'}
      </button>
      {msg && (
        <div className={`notice-box${msg.ok ? ' notice-ok' : ''}`} role="status" style={{ marginTop: 8 }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

// 設定「🔑 暗証番号」。ログインしている本人が、自分の暗証番号を設定・変更する。管理者は、忘れた人の暗証番号を消せる。
export default function PinSettings({
  drivers,
  mechanics,
  currentDriver,
  mechanic,
  isAdmin,
  pins,
  onChanged,
}: {
  drivers: Driver[];
  mechanics: string[];
  currentDriver: Driver | null;
  mechanic: string | null;
  isAdmin: boolean;
  pins: PinInfo;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  async function reset(kind: Kind, id: string, label: string) {
    if (!confirm(`${label} さんの暗証番号を消します。次のログインから、暗証番号なしで入れるようになります。よろしいですか？`)) return;
    setBusy(kind + id);
    setErr('');
    try {
      const res = await fetch('/api/pins', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, id }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) setErr(j.message || '消せませんでした。');
      onChanged();
    } finally {
      setBusy('');
    }
  }

  const withPin = [
    ...drivers.filter((d) => pins.drivers.includes(d.id)).map((d) => ({ kind: 'driver' as Kind, id: d.id, label: `${d.lastName} ${d.firstName}` })),
    ...mechanics.filter((m) => pins.mechanics.includes(m)).map((m) => ({ kind: 'mechanic' as Kind, id: m, label: m })),
  ];

  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: 4 }}>
        🔑 暗証番号（なりすまし対策）
      </h3>
      <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 12 }}>
        自分の名前に、数字4けたの暗証番号を付けられます（付けるかどうかは自由です）。付けると、その名前でログインするときに、暗証番号が必要になります。ほかの人が、あなたの名前で登録することを防げます。
      </div>

      {!currentDriver && !mechanic && <div className="empty-state">運転者か整備士としてログインすると、ここで自分の暗証番号を設定できます。</div>}
      {currentDriver && (
        <SelfForm kind="driver" id={currentDriver.id} label={`${currentDriver.lastName} ${currentDriver.firstName}`} has={pins.drivers.includes(currentDriver.id)} onChanged={onChanged} />
      )}
      {mechanic && <SelfForm kind="mechanic" id={mechanic} label={mechanic} has={pins.mechanics.includes(mechanic)} onChanged={onChanged} />}

      {isAdmin && (
        <>
          <div className="ins-group-title" style={{ marginTop: 16 }}>
            暗証番号を設定している人（管理者）
          </div>
          {withPin.length === 0 ? (
            <div className="empty-state">まだ、だれも設定していません</div>
          ) : (
            <div className="backup-list">
              {withPin.map((p) => (
                <div key={p.kind + p.id} className="backup-row">
                  <div style={{ flex: 1 }}>
                    {p.kind === 'driver' ? '🪪' : '🔧'} <strong>{p.label}</strong>
                  </div>
                  <button className="btn btn-sm btn-danger" disabled={busy !== ''} onClick={() => reset(p.kind, p.id, p.label)}>
                    暗証番号を消す（忘れたとき）
                  </button>
                </div>
              ))}
            </div>
          )}
          {err && <div className="notice-box">{err}</div>}
        </>
      )}
    </div>
  );
}
