'use client';

import { useEffect, useState } from 'react';
import { AppData, Driver } from '@/lib/types';
import { INCIDENT_INJURY, INCIDENT_KINDS, INSURER_NAME, INSURER_WEB_URL, IncidentContact, normalizePhone } from '@/lib/incidents';
import { todayStr } from '@/lib/utils';
import { Insurance } from '@/lib/insurance';
import Modal from './Modal';
import PhotoField from './PhotoField';

const STEPS = [
  '安全な場所に車を止め、ハザードランプをつける（高速道路では、車の後ろに三角表示板を置き、ガードレールの外へ避難する）',
  'けが人がいたら、動かさずに 119 へ。救急車を呼ぶ',
  '事故のときは、小さなものでも必ず 110 へ。警察に連絡する（連絡は法律で決まっています）',
  `会社（下の緊急連絡先）と、加入している保険（${INSURER_NAME}）の事故受付へ連絡し、このボタンから報告する`,
  '現場・相手の車・ナンバー・傷を、写真に撮る。相手の名前・連絡先・保険会社を控える',
  '「自分が悪い」などの話は、その場でしない。示談の約束もしない',
];

function TelButton({ label, phone, tone }: { label: string; phone: string; tone?: 'red' }) {
  return (
    <a className={`btn ${tone === 'red' ? 'btn-danger' : ''}`} href={`tel:${normalizePhone(phone)}`}>
      📞 {label}（{phone}）
    </a>
  );
}

// 事故・トラブルのときのボタン。まず何をするかと緊急連絡先を出し、その場で会社へ報告できる。
export default function IncidentButton({ data, currentDriver }: { data: AppData; currentDriver?: Driver | null }) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<IncidentContact[]>([]);
  const [ins, setIns] = useState<Insurance | null>(null);
  const blank = () => ({
    kind: INCIDENT_KINDS[0] as string,
    driverId: currentDriver?.id || '',
    driverName: '',
    vehicleId: '',
    place: '',
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
    injury: INCIDENT_INJURY[2] as string,
    police: false,
    insurer: false,
    otherParty: false,
    canDrive: false,
    note: '',
    photos: [] as string[],
  });
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch('/api/incident-contacts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setContacts(j.contacts || []))
      .catch(() => undefined);
    fetch('/api/insurance', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setIns(j.insurance || null))
      .catch(() => undefined);
  }, [open]);

  function openModal() {
    // 今日の帰着前の日報があれば、その運転者・車両を初めから入れておく
    const mine = currentDriver ? data.reports.find((r) => !r.postDone && r.driverId === currentDriver.id) : undefined;
    setF({ ...blank(), driverId: currentDriver?.id || '', vehicleId: mine?.vehicleId || '' });
    setError('');
    setDone(false);
    setOpen(true);
  }

  function locate() {
    if (!navigator.geolocation) return setError('この端末では現在地を取得できません。場所を文字で入れてください。');
    setGpsBusy(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = Math.round(p.coords.latitude * 1e5) / 1e5;
        const lng = Math.round(p.coords.longitude * 1e5) / 1e5;
        setF((x) => ({ ...x, lat, lng, place: x.place || `現在地（${lat}, ${lng}）` }));
        setGpsBusy(false);
      },
      () => {
        setGpsBusy(false);
        setError('現在地を取得できませんでした。位置情報の許可を確認するか、場所を文字で入れてください。');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  async function submit() {
    if (!f.driverId && !f.driverName.trim()) return setError('運転者を選ぶか、名前を入れてください。');
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, driver: f.driverName }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.message || '報告できませんでした。');
      setDone(true);
    } catch (e) {
      setError((e instanceof Error ? e.message : '報告できませんでした。') + ' 電話での連絡を先にお願いします。');
    } finally {
      setBusy(false);
    }
  }

  const tels = (
    <div className="incident-tels">
      <TelButton label="警察" phone="110" tone="red" />
      <TelButton label="救急・消防" phone="119" tone="red" />
      {contacts.map((c) => (
        <TelButton key={c.label + c.phone} label={c.label} phone={c.phone} />
      ))}
      <a className="btn" href={INSURER_WEB_URL} target="_blank" rel="noreferrer">
        🌐 {INSURER_NAME} Web・LINEで事故連絡
      </a>
    </div>
  );

  const expired = ins?.periodTo ? ins.periodTo < todayStr() : false;
  const insBox = ins && (ins.policyNo || ins.agencyName) && (
    <div className="incident-ins">
      <div className="incident-ins-title">🛡️ 加入の保険（事故の連絡のとき、証券番号を伝えます）</div>
      <dl>
        {ins.policyNo && (
          <>
            <dt>{ins.company} {ins.product}</dt>
            <dd className="incident-ins-no">証券番号 {ins.policyNo}</dd>
          </>
        )}
        {ins.holder && (
          <>
            <dt>保険契約者</dt>
            <dd>{ins.holder}</dd>
          </>
        )}
        {ins.periodTo && (
          <>
            <dt>満期日</dt>
            <dd>
              {ins.periodTo}
              {expired && <span className="pill pill-amber" style={{ marginLeft: 6 }}>過ぎています（更新後の証券番号を確認）</span>}
            </dd>
          </>
        )}
        {ins.agencyName && (
          <>
            <dt>取扱代理店</dt>
            <dd>{ins.agencyName}</dd>
          </>
        )}
      </dl>
      {ins.note && <div className="incident-hint">{ins.note}</div>}
    </div>
  );

  return (
    <>
      <button type="button" className="bell-btn incident-btn" onClick={openModal} title="事故・トラブルのとき" aria-label="事故・トラブルのとき">
        <span aria-hidden className="bell-icon">🚨</span>
      </button>
      {open && (
        <Modal
          title="🚨 事故・トラブルのとき"
          onClose={() => setOpen(false)}
          footer={
            done ? (
              <button className="btn btn-primary" onClick={() => setOpen(false)}>
                閉じる
              </button>
            ) : (
              <>
                <button className="btn" onClick={() => setOpen(false)}>
                  閉じる
                </button>
                <button className="btn btn-danger" onClick={submit} disabled={busy}>
                  {busy ? '送信中…' : '🚨 会社に報告する'}
                </button>
              </>
            )
          }
        >
          {done ? (
            <>
              <div className="notice-box incident-done">
                ✅ 報告しました。管理者に通知を送りました。電話がつながっていないときは、下の連絡先へ電話してください。
              </div>
              {tels}
              {insBox}
              <div className="incident-steps-title">このあとの流れ</div>
              <ol className="incident-steps">
                {STEPS.slice(4).map((s) => (
                  <li key={s}>{s}</li>
                ))}
                <li>会社の指示を待ち、車を動かせないときは、レッカーを手配してもらう</li>
              </ol>
            </>
          ) : (
            <>
              <div className="incident-steps-title">まず落ち着いて、次の順に</div>
              <ol className="incident-steps">
                {STEPS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {tels}
              {insBox}
              {contacts.length === 0 && <div className="incident-hint">会社の連絡先は、管理者が「設定」の「🚨 緊急連絡先」で登録できます。</div>}

              <div className="incident-form-title">会社への報告（わかる範囲で。あとから直せません）</div>
              <div className="field">
                <label>何がありましたか</label>
                <div className="type-chips">
                  {INCIDENT_KINDS.map((k) => (
                    <button key={k} type="button" className={`btn btn-sm ${f.kind === k ? 'btn-primary' : ''}`} aria-pressed={f.kind === k} onClick={() => setF({ ...f, kind: k })}>
                      {f.kind === k ? '✓ ' : ''}
                      {k}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>運転者 *</label>
                  <select value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })}>
                    <option value="">（名前を入力する）</option>
                    {data.drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.lastName} {d.firstName}
                      </option>
                    ))}
                  </select>
                  {!f.driverId && <input style={{ marginTop: 6 }} value={f.driverName} maxLength={40} onChange={(e) => setF({ ...f, driverName: e.target.value })} placeholder="名前" />}
                </div>
                <div className="field">
                  <label>車両</label>
                  <select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}>
                    <option value="">（選ばない）</option>
                    {data.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}（{v.plate}）
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>場所</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <input style={{ flex: 1, minWidth: 180 }} value={f.place} maxLength={200} onChange={(e) => setF({ ...f, place: e.target.value })} placeholder="例：国道4号 ○○交差点 付近" />
                  <button type="button" className="btn btn-sm" onClick={locate} disabled={gpsBusy}>
                    {gpsBusy ? '取得中…' : '📍 現在地を入れる'}
                  </button>
                </div>
              </div>
              <div className="field">
                <label>けが人</label>
                <div className="type-chips">
                  {INCIDENT_INJURY.map((k) => (
                    <button key={k} type="button" className={`btn btn-sm ${f.injury === k ? (k === 'けが人あり' ? 'btn-danger' : 'btn-primary') : ''}`} aria-pressed={f.injury === k} onClick={() => setF({ ...f, injury: k })}>
                      {f.injury === k ? '✓ ' : ''}
                      {k}
                    </button>
                  ))}
                </div>
              </div>
              <div className="check-row">
                <label className="checkbox-field">
                  <input type="checkbox" checked={f.police} onChange={(e) => setF({ ...f, police: e.target.checked })} /> 警察に連絡した
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={f.insurer} onChange={(e) => setF({ ...f, insurer: e.target.checked })} /> 保険会社に連絡した
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={f.otherParty} onChange={(e) => setF({ ...f, otherParty: e.target.checked })} /> 相手がいる
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={f.canDrive} onChange={(e) => setF({ ...f, canDrive: e.target.checked })} /> そのまま走れる
                </label>
              </div>
              <div className="field">
                <label>状況（1000文字まで）</label>
                <textarea rows={4} maxLength={1000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="例：駐車場で後退中に、後ろのポールにバンパーが当たった。" />
              </div>
              <PhotoField ids={f.photos} onChange={(photos) => setF({ ...f, photos })} label="写真（任意・現場や傷など）" />
              <div className="incident-hint">報告日：{todayStr()}。運転者の名前を選ばなくても送れます。電話での連絡を、先にしてください。</div>
              {error && (
                <div role="alert" className="notice-box" style={{ borderColor: 'var(--red-600, #dc2626)' }}>
                  {error}
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
