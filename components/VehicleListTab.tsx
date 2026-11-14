'use client';

import { useMemo, useState } from 'react';
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

// 車両台帳の「📋 一覧表」：全車両を1つの表で見比べる（車検・点検・走行・オイル・タイヤ・整備依頼）。誰でも見られる。
export default function VehicleListTab({ data, onOpenLedger }: { data: AppData; onOpenLedger: () => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('');
  const [sort, setSort] = useState<SortKey>('name');

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
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">条件に合う車両はありません</div>
        ) : (
          <div className="table-wrap vlist-wrap">
            <table className="data-table vlist-table">
              <thead>
                <tr>
                  <th className="vl-sticky">車両</th>
                  <th>型式</th>
                  <th>車検満了日</th>
                  <th>12ヶ月点検日</th>
                  <th style={{ textAlign: 'right' }}>走行（km）</th>
                  <th style={{ textAlign: 'right' }}>オイル交換</th>
                  <th>タイヤ</th>
                  <th>整備依頼</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ v, shaken, check, oilLeft, req }) => (
                  <tr key={v.id}>
                    <td className="vl-sticky">
                      <strong>{v.name}</strong>
                      <div style={{ fontSize: 11, color: 'var(--slate-500)' }}>{v.plate}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{v.modelType || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {v.shakenDate || '-'} {dayPill(shaken)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {v.checkDate || '-'} {dayPill(check)}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{v.odometer.toLocaleString()}</td>
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
                    <td style={{ fontSize: 12 }}>{tireCell(v)}</td>
                    <td>{req > 0 ? <span className="pill pill-red">{req}件</span> : <span style={{ color: 'var(--slate-400)' }}>-</span>}</td>
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
