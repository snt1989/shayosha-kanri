'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Driver } from '@/lib/types';
import IwateTrafficPanel from './IwateTrafficPanel';
import IwateRoadInfo from './IwateRoadInfo';
import LiveWeatherPanel, { WeatherAlertStrip } from './LiveWeatherPanel';
import dynamic from 'next/dynamic';

// 地図は、ブラウザの中だけで動かす（サーバーでは描かない）
const TrafficMap = dynamic(() => import('./TrafficMap'), { ssr: false, loading: () => <div className="tm-map tm-loading">地図を読み込んでいます…</div> });

type Section = 'map' | 'road' | 'enf' | 'spots';
const SECTIONS: { key: Section; label: string }[] = [
  { key: 'map', label: '🗺 マップ' },
  { key: 'road', label: '🚧 規制・交通・天気' },
  { key: 'enf', label: '🚓 取締り・オービス' },
  { key: 'spots', label: '📍 社内の注意地点' },
];
import { PREFECTURES, SPOT_KINDS, SpotKind, TrafficSpot, spotKind, spotMapUrl, trafficLinks } from '@/lib/traffic';

const PREF_KEY = 'fleet:traffic:pref';
const empty = { kind: 'orbis' as SpotKind, name: '', road: '', limit: '', note: '', lat: undefined as number | undefined, lng: undefined as number | undefined };

// 「取締り・オービス」のページ。公式・公開の情報へのリンクと、社内で共有する注意地点の一覧。
export default function TrafficTab({ currentDriver, mechanic, isAdmin, onRequestDriverLogin }: { currentDriver: Driver | null; mechanic: string | null; isAdmin: boolean; onRequestDriverLogin: () => void }) {
  const [pref, setPref] = useState('岩手県');
  const [section, setSection] = useState<Section>('map');
  const [spots, setSpots] = useState<TrafficSpot[] | null>(null);
  const [filter, setFilter] = useState<SpotKind | ''>('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<typeof empty | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const canAdd = Boolean(currentDriver || mechanic || isAdmin);

  useEffect(() => {
    try {
      const p = localStorage.getItem(PREF_KEY);
      if (p && PREFECTURES.includes(p)) setPref(p);
    } catch {
      // 覚えていなくても動かす
    }
  }, []);
  const load = useCallback(() => {
    fetch('/api/traffic-spots', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setSpots(j.success ? j.spots : []))
      .catch(() => setSpots([]));
  }, []);
  useEffect(() => load(), [load]);

  function changePref(p: string) {
    setPref(p);
    try {
      localStorage.setItem(PREF_KEY, p);
    } catch {
      // 覚えられなくても動かす
    }
  }
  function locate() {
    if (!form) return;
    if (!('geolocation' in navigator)) return setMsg('この端末では、いまの場所を取得できません。');
    setMsg('いまの場所を取得しています…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => (f ? { ...f, lat: pos.coords.latitude, lng: pos.coords.longitude } : f));
        setMsg('いまの場所を入れました。');
      },
      () => setMsg('いまの場所を取得できませんでした（位置情報の許可を確かめてください）。場所の名前だけでも登録できます。'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }
  async function save() {
    if (!form) return;
    if (!form.name.trim()) return setMsg('場所の名前を入力してください。');
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/traffic-spots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, driverId: currentDriver?.id || '', mechanic: mechanic || '' }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) return setMsg(j.message || '登録できませんでした。');
      setForm(null);
      load();
    } catch {
      setMsg('登録できませんでした。電波の良い場所で、もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }
  async function remove(s: TrafficSpot) {
    if (!confirm(`「${s.name}」を消しますか？`)) return;
    const res = await fetch('/api/traffic-spots', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, driverId: currentDriver?.id || '' }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.success) alert(j.message || '消せませんでした。');
    load();
  }

  const q = query.trim();
  const shown = (spots || []).filter((s) => (!filter || s.kind === filter) && (!q || [s.name, s.road, s.note].some((x) => (x || '').includes(q))));

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="card-title" style={{ marginBottom: 4 }}>
          🚦 交通情報（規制・取締り・オービス）
        </h3>
        <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 10 }}>
          安全運転のための情報です。出発の前に確かめてください。<strong>運転中は、スマホを操作しないでください。</strong>
        </div>
        <label className="alc-pick" style={{ marginBottom: 8 }}>
          都道府県
          <select value={pref} onChange={(e) => changePref(e.target.value)}>
            {PREFECTURES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <div className="subtabbar tr-tabs" role="tablist" aria-label="見る内容">
          {SECTIONS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={section === t.key} className={`subtab ${section === t.key ? 'active' : ''}`} onClick={() => setSection(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {pref === '岩手県' && section !== 'road' && (
        <div style={{ marginBottom: 14 }}>
          <WeatherAlertStrip onOpen={() => setSection('road')} />
        </div>
      )}

      {section === 'map' && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 className="card-title" style={{ marginBottom: 8 }}>
            🗺 取締り・規制のマップ{pref !== '岩手県' && <span className="pill pill-slate" style={{ marginLeft: 8 }}>岩手県のみ</span>}
          </h3>
          <TrafficMap spots={spots || []} />
        </div>
      )}

      {section === 'road' && pref === '岩手県' && (
        <>
          <LiveWeatherPanel />
          <IwateRoadInfo />
        </>
      )}
      {section === 'enf' && pref === '岩手県' && <IwateTrafficPanel />}
      {(section === 'enf' || section === 'road') && pref !== '岩手県' && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="empty-state">{pref}の情報は、ページの中にはまとめていません（いまは岩手県だけです）。下のボタンから、公式・公開の情報を開いてください。</div>
        </div>
      )}

      {(section === 'enf' || (section === 'road' && pref !== '岩手県')) && (
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="card-title" style={{ marginBottom: 8 }}>
          🔗 公式・公開の情報を開く（{pref}）
        </h3>
        <div className="tr-links">
          {trafficLinks(pref).map((l) => (
            <a key={l.label} className="tr-link" href={l.url} target="_blank" rel="noopener noreferrer">
              <span className="tr-link-ic" aria-hidden="true">
                {l.icon}
              </span>
              <span>
                <strong>{l.label}</strong>
                <small>{l.note}</small>
              </span>
              <span className="tr-link-go" aria-hidden="true">
                ↗
              </span>
            </a>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 8 }}>
          ※ 上のボタンは、外のサイト（検索・地図）を別の画面で開きます。このアプリは、オービスの位置や取締りの予定のデータを持っていません。取締りは、公表されていない場所・時間でも行われます。
        </div>
      </div>
      )}

      {section === 'spots' && (
      <div className="card">
        <div className="toolbar2">
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}>
              📍 社内で共有する注意地点{spots && spots.length > 0 && <span className="pill pill-slate" style={{ marginLeft: 8 }}>{spots.length}件</span>}
            </h3>
            <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>よく通る道のオービス、取締りの多い場所、事故の多い場所を、みんなで登録して共有できます。</div>
          </div>
          <div className="actions">
            <input className="search" placeholder="場所・道路で検索…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ padding: '9px 12px', border: '1px solid var(--slate-300)', borderRadius: 8, minWidth: 180 }} />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                if (!canAdd) return onRequestDriverLogin();
                setMsg('');
                setForm({ ...empty });
              }}
            >
              ＋ 注意地点を登録
            </button>
          </div>
        </div>
        <div className="type-chips" style={{ marginBottom: 10 }}>
          <button type="button" className={`btn btn-sm ${filter === '' ? 'btn-primary' : ''}`} aria-pressed={filter === ''} onClick={() => setFilter('')}>
            すべて
          </button>
          {SPOT_KINDS.map((k) => (
            <button key={k.key} type="button" className={`btn btn-sm ${filter === k.key ? 'btn-primary' : ''}`} aria-pressed={filter === k.key} onClick={() => setFilter(filter === k.key ? '' : k.key)}>
              {k.icon} {k.label.split('（')[0]}
            </button>
          ))}
        </div>

        {form && (
          <div className="tr-form">
            <div className="field">
              <label>種類</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as SpotKind })}>
                {SPOT_KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.icon} {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>場所の名前 *</label>
              <input value={form.name} maxLength={80} placeholder="例：○○交差点の手前、△△トンネルの出口" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field-row row2">
              <div className="field">
                <label>道路・方向</label>
                <input value={form.road} maxLength={60} placeholder="例：国道16号 上り" onChange={(e) => setForm({ ...form, road: e.target.value })} />
              </div>
              <div className="field">
                <label>制限速度</label>
                <input value={form.limit} maxLength={20} placeholder="例：60km/h" onChange={(e) => setForm({ ...form, limit: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>メモ</label>
              <input value={form.note} maxLength={300} placeholder="例：下り坂で速度が出やすい。朝の時間帯に多い" onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <button type="button" className="btn btn-sm" onClick={locate}>
                📍 いまの場所を入れる
              </button>
              {typeof form.lat === 'number' ? (
                <>
                  <span className="pill pill-green">場所あり（地図で開けます）</span>
                  <button type="button" className="btn btn-sm" onClick={() => setForm({ ...form, lat: undefined, lng: undefined })}>
                    場所を外す
                  </button>
                </>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--slate-500)' }}>その場所にいるときに押すと、地図で開けるようになります（停車中に）。</span>
              )}
            </div>
            {msg && (
              <div className="notice-box" role="status" style={{ marginBottom: 10 }}>
                {msg}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                {busy ? '登録中…' : '登録する'}
              </button>
              <button className="btn" onClick={() => setForm(null)} disabled={busy}>
                やめる
              </button>
            </div>
          </div>
        )}

        {spots === null ? (
          <div className="empty-state">読み込み中…</div>
        ) : shown.length === 0 ? (
          <div className="empty-state">{spots.length === 0 ? 'まだ登録がありません。「＋ 注意地点を登録」から、よく通る道の情報を登録できます。' : '当てはまる地点がありません'}</div>
        ) : (
          <div className="tr-list">
            {shown.map((s) => {
              const k = spotKind(s.kind);
              return (
                <div key={s.id} className={`tr-item ${s.kind}`}>
                  <span className="tr-ic" aria-hidden="true">
                    {k.icon}
                  </span>
                  <div className="tr-main">
                    <div className="tr-name">
                      {s.name}
                      {s.limit && <span className="pill pill-red" style={{ marginLeft: 6 }}>制限 {s.limit}</span>}
                    </div>
                    <div className="tr-sub">
                      {k.label.split('（')[0]}
                      {s.road ? `・${s.road}` : ''}
                    </div>
                    {s.note && <div className="tr-note">{s.note}</div>}
                    <div className="tr-by">
                      {s.createdAt.slice(0, 10)} {s.by}
                    </div>
                  </div>
                  <div className="tr-actions">
                    <a className="btn btn-sm" href={spotMapUrl(s)} target="_blank" rel="noopener noreferrer">
                      🗺 地図
                    </a>
                    {(isAdmin || (currentDriver && s.byId === currentDriver.id)) && (
                      <button className="btn btn-sm btn-danger" onClick={() => remove(s)}>
                        削除
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
