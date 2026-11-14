'use client';

import { useEffect, useMemo, useState } from 'react';
import { photoUrl } from '@/lib/image';
import { AppData, Vehicle } from '@/lib/types';
import { DEFAULT_ALERT_SETTINGS, normalizeAlertSettings } from '@/lib/alert-settings';
import { downloadCsv, vehiclesToCsv } from '@/lib/csv';
import { daysUntil, openMaintRequests, tireInfoText, tireSetsOf, todayStr } from '@/lib/utils';

type SortKey = 'name' | 'shaken' | 'check' | 'oil' | 'odometer';
type Filter = '' | 'shaken' | 'check' | 'oil' | 'request';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'name', label: '車両名' },
  { key: 'shaken', label: '車検満了日が近い順' },
  { key: 'check', label: '12ヶ月点検日が近い順' },
  { key: 'oil', label: 'オイル交換まで少ない順' },
  { key: 'odometer', label: '走行距離が多い順' },
];

// 表に出す項目（「車両」の列は常に出す）。チェックで出し入れでき、選んだ内容はこの端末に残る
type ColKey = 'photo' | 'model' | 'chassis' | 'shaken' | 'check' | 'odo' | 'oil' | 'tire' | 'req';
const COLS: { key: ColKey; label: string; on: boolean }[] = [
  { key: 'photo', label: '写真', on: false },
  { key: 'model', label: '型式', on: true },
  { key: 'chassis', label: '車台番号', on: false },
  { key: 'shaken', label: '車検満了日', on: true },
  { key: 'check', label: '12ヶ月点検日', on: true },
  { key: 'odo', label: '走行距離', on: true },
  { key: 'oil', label: 'オイル交換', on: true },
  { key: 'tire', label: 'タイヤ', on: true },
  { key: 'req', label: '整備依頼', on: true },
];
const COLS_KEY = 'fleet:vlist:cols';
const defaultCols = () => COLS.filter((c) => c.on).map((c) => c.key);

// 車両台帳の「📋 一覧表」：全車両を1つの表で見比べる（車検・点検・走行・オイル・タイヤ・整備依頼）。誰でも見られる。
export default function VehicleListTab({ data, onOpenLedger }: { data: AppData; onOpenLedger: () => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('');
  const [sort, setSort] = useState<SortKey>('name');
  const [cols, setCols] = useState<ColKey[]>(defaultCols());
  const [colsOpen, setColsOpen] = useState(false);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(COLS_KEY) || 'null');
      if (Array.isArray(raw)) setCols(COLS.map((c) => c.key).filter((k) => raw.includes(k)));
    } catch {
      // 読めなければ標準の表示
    }
  }, []);
  const toggleCol = (k: ColKey) => {
    const next = COLS.map((c) => c.key).filter((x) => (x === k ? !cols.includes(x) : cols.includes(x)));
    setCols(next);
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify(next));
    } catch {
      // 保存できなくても、この画面の間は変わる
    }
  };
  const show = (k: ColKey) => cols.includes(k);

  const st = data.alertSettings ? normalizeAlertSettings(data.alertSettings) : DEFAULT_ALERT_SETTINGS;
  const requests = useMemo(() => openMaintRequests(data.reports), [data.reports]);
  const reqCount = (id: string) => requests.filter((r) => r.vehicleId === id).length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data.vehicles
      .map((v) => ({
        v,
        shaken: daysUntil(v.shakenDate),
        check: daysUntil(v.checkDate),
        oilLeft: v.oilKm - v.odometer,
        req: reqCount(v.id),
      }))
      .filter(({ v, shaken, check, oilLeft, req }) => {
        if (q && !`${v.name} ${v.plate} ${v.modelType} ${v.maker || ''}`.toLowerCase().includes(q)) return false;
        if (filter === 'shaken') return shaken !== null && shaken <= st.shakenDays;
        if (filter === 'check') return check !== null && check <= st.shakenDays;
        if (filter === 'oil') return oilLeft <= st.oilKm;
        if (filter === 'request') return req > 0;
        return true;
      });
    const far = 1e9;
    return list.sort((a, b) => {
      if (sort === 'shaken') return (a.shaken ?? far) - (b.shaken ?? far);
      if (sort === 'check') return (a.check ?? far) - (b.check ?? far);
      if (sort === 'oil') return a.oilLeft - b.oilLeft;
      if (sort === 'odometer') return b.v.odometer - a.v.odometer;
      return a.v.name.localeCompare(b.v.name, 'ja');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.vehicles, requests, query, filter, sort, st.shakenDays, st.oilKm]);

  const dayPill = (days: number | null) => {
    if (days === null) return null;
    if (days < 0) return <span className="pill pill-red">{-days}日超過</span>;
    if (days <= st.shakenDays) return <span className="pill pill-amber">あと{days}日</span>;
    return <span className="pill pill-green">あと{days}日</span>;
  };

  const tireCell = (v: Vehicle) => {
    const sets = tireSetsOf(v);
    const line = (label: string, key: 'summer' | 'winter') => {
      const t = sets[key];
      const txt = tireInfoText(t);
      const now = (v.tire || '').includes(key === 'summer' ? '夏' : '冬');
      return txt || now ? (
        <div key={key} style={{ whiteSpace: 'nowrap' }}>
          {label} {txt || '（未入力）'}
          {now && <span className="pill pill-sky" style={{ marginLeft: 4 }}>装着中</span>}
        </div>
      ) : null;
    };
    const a = line('☀️', 'summer');
    const b = line('❄️', 'winter');
    return a || b ? (
      <>
        {a}
        {b}
      </>
    ) : (
      <span style={{ color: 'var(--slate-400)' }}>-</span>
    );
  };

  return (
    <div>
      <div className="card">
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📋 車両一覧</span>
          <span className="pill pill-slate">{rows.length}/{data.vehicles.length}台</span>
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={() => downloadCsv(`車両一覧_${todayStr()}.csv`, vehiclesToCsv(rows.map((r) => r.v)).replace(/^﻿/, ''))}
          >
            ⬇ CSV
          </button>
        </h3>
        <div className="toolbar vlist-toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input
            className="search"
            placeholder="車両名・ナンバー・型式で検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ padding: '9px 12px', border: '1px solid var(--slate-300)', borderRadius: 8, flex: '1 1 100%', minWidth: 0 }}
          />
          <select aria-label="絞り込み" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} style={{ flex: '1 1 0', minWidth: 0, padding: '9px 12px', border: '1px solid var(--slate-300)', borderRadius: 8 }}>
            <option value="">すべての車両</option>
            <option value="shaken">車検が近い・超過（{st.shakenDays}日以内）</option>
            <option value="check">点検が近い・超過（{st.shakenDays}日以内）</option>
            <option value="oil">オイル交換が近い（残り{st.oilKm.toLocaleString()}km以内）</option>
            <option value="request">整備依頼あり</option>
          </select>
          <select aria-label="並び順" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ flex: '1 1 0', minWidth: 0, padding: '9px 12px', border: '1px solid var(--slate-300)', borderRadius: 8 }}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                並び順：{s.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-sm" aria-expanded={colsOpen} onClick={() => setColsOpen(!colsOpen)}>
            ☑ 表示項目{cols.length < COLS.length ? `（${cols.length}/${COLS.length}）` : ''}
          </button>
        </div>
        {colsOpen && (
          <div className="vlist-cols">
            <div className="vlist-cols-title">表に出す項目にチェックを入れてください（車両名は常に出ます。この端末に残ります）</div>
            <div className="vlist-cols-grid">
              {COLS.map((c) => (
                <label key={c.key} className="checkbox-field">
                  <input type="checkbox" checked={show(c.key)} onChange={() => toggleCol(c.key)} /> {c.label}
                </label>
              ))}
            </div>
            <button type="button" className="btn btn-sm" onClick={() => { setCols(defaultCols()); try { localStorage.removeItem(COLS_KEY); } catch {} }}>
              標準に戻す
            </button>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="empty-state">条件に合う車両はありません</div>
        ) : (
          <div className="table-wrap vlist-wrap">
            <table className="data-table vlist-table">
              <thead>
                <tr>
                  <th className="vl-sticky">車両</th>
                  {show('photo') && <th>写真</th>}
                  {show('model') && <th>型式</th>}
                  {show('chassis') && <th>車台番号</th>}
                  {show('shaken') && <th>車検満了日</th>}
                  {show('check') && <th>12ヶ月点検日</th>}
                  {show('odo') && <th style={{ textAlign: 'right' }}>走行（km）</th>}
                  {show('oil') && <th style={{ textAlign: 'right' }}>オイル交換</th>}
                  {show('tire') && <th>タイヤ</th>}
                  {show('req') && <th>整備依頼</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ v, shaken, check, oilLeft, req }) => (
                  <tr key={v.id}>
                    <td className="vl-sticky">
                      <strong>{v.name}</strong>
                      <div style={{ fontSize: 11, color: 'var(--slate-500)' }}>{v.plate}</div>
                    </td>
                    {show('photo') && (
                      <td>
                        {v.photos && v.photos[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photoUrl(v.photos[0])} alt="車両の写真" loading="lazy" style={{ width: 56, height: 42, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                        ) : (
                          <span style={{ color: 'var(--slate-400)' }}>-</span>
                        )}
                      </td>
                    )}
                    {show('model') && <td style={{ whiteSpace: 'nowrap' }}>{v.modelType || '-'}</td>}
                    {show('chassis') && <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{v.chassisNo || '-'}</td>}
                    {show('shaken') && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {v.shakenDate || '-'} {dayPill(shaken)}
                      </td>
                    )}
                    {show('check') && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {v.checkDate || '-'} {dayPill(check)}
                      </td>
                    )}
                    {show('odo') && <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{v.odometer.toLocaleString()}</td>}
                    {show('oil') && (
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {v.oilKm ? (
                        <>
                          {v.oilKm.toLocaleString()}
                          <div>
                            {oilLeft < 0 ? (
                              <span className="pill pill-red">{(-oilLeft).toLocaleString()}km超過</span>
                            ) : oilLeft <= st.oilKm ? (
                              <span className="pill pill-amber">残り{oilLeft.toLocaleString()}km</span>
                            ) : (
                              <span className="pill pill-green">残り{oilLeft.toLocaleString()}km</span>
                            )}
                          </div>
                        </>
                      ) : (
                        '-'
                      )}
                    </td>
                    )}
                    {show('tire') && <td style={{ fontSize: 12 }}>{tireCell(v)}</td>}
                    {show('req') && <td>{req > 0 ? <span className="pill pill-red">{req}件</span> : <span style={{ color: 'var(--slate-400)' }}>-</span>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--slate-500)' }}>
          車検・点検・オイルの色は、設定の「アラートを出す時期」に合わせています。登録・編集・車検証の確認は{' '}
          <button type="button" className="btn btn-sm" onClick={onOpenLedger}>
            🗂 カード表示へ
          </button>
        </div>
      </div>
    </div>
  );
}
