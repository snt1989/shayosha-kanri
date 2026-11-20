'use client';

import { useEffect, useState } from 'react';
import type { Report } from '@/lib/types';
import { downloadCsv } from '@/lib/csv';

type Archived = Report;
type Month = { month: string; count: number };

const label = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5, 7))}月`;
const alc = (v: string, skipped?: boolean) => (skipped ? 'パス' : parseFloat(v || '0') > 0 ? `${v}mg/L` : '0.00');

// 保管した古い日報（3か月より前の月。読むだけ）。運転日報のページの下に出す。
export default function ReportArchive({ toCsv, onTotal }: { toCsv: (reports: Report[]) => string; onTotal: (n: number) => void }) {
  const [months, setMonths] = useState<Month[]>([]);
  const [keep, setKeep] = useState(3);
  const [month, setMonth] = useState('');
  const [reports, setReports] = useState<Archived[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/reports/archive', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) return;
        setMonths(j.months);
        setKeep(j.keepMonths);
        onTotal(j.total);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!month) {
      setReports(null);
      return;
    }
    let live = true;
    setReports(null);
    setError('');
    fetch(`/api/reports/archive?month=${month}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.success) setReports(j.reports);
        else setError(j.message || '読み込めませんでした。');
      })
      .catch(() => live && setError('読み込めませんでした。電波の良い場所で、もう一度お試しください。'));
    return () => {
      live = false;
    };
  }, [month]);

  if (months.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="toolbar2">
        <div>
          <h3 className="card-title" style={{ marginBottom: 4 }}>
            🗄 以前の日報（保管分）
          </h3>
          <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
            帰着登録が済んだ日報のうち、{keep}か月より前の月のものは、ここに保管しています（見ることとCSV出力ができます。編集はできません）。
          </div>
        </div>
        <div className="actions">
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="見る月">
            <option value="">月を選ぶ…</option>
            {months.map((m) => (
              <option key={m.month} value={m.month}>
                {label(m.month)}（{m.count}件）
              </option>
            ))}
          </select>
          {reports && reports.length > 0 && (
            <button className="btn btn-sm" onClick={() => downloadCsv(`運転日報_${month}.csv`, toCsv(reports).replace(/^﻿/, ''))}>
              ⬇ CSV出力
            </button>
          )}
        </div>
      </div>
      {error && <div className="notice-box">{error}</div>}
      {month && !reports && !error && <div className="empty-state">読み込み中…</div>}
      {reports &&
        (reports.length === 0 ? (
          <div className="empty-state">この月の日報はありません</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table reports-table">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>運転者</th>
                  <th>使用車両</th>
                  <th>行先・用件</th>
                  <th>運転前ALC</th>
                  <th>運転後ALC</th>
                  <th>確認者</th>
                  <th>走行メーター</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.date}
                      {r.code && <span className="cell-sub">{r.code}</span>}
                    </td>
                    <td>
                      {r.driver}
                      {r.dept && <span className="pill pill-slate cell-sub-pill">{r.dept}</span>}
                    </td>
                    <td>
                      {r.vehicleName}
                      {r.plate && <span className="cell-sub">{r.plate}</span>}
                    </td>
                    <td>
                      {r.destination}
                      {r.purpose && <span className="cell-sub">{r.purpose}</span>}
                    </td>
                    <td>
                      {alc(r.preAlcohol, r.alcoholSkipped)}
                      {r.preTime && <span className="cell-sub">{r.preTime}</span>}
                    </td>
                    <td>
                      {alc(r.postAlcohol, r.alcoholSkipped)}
                      {r.postTime && <span className="cell-sub">{r.postTime}</span>}
                    </td>
                    <td>
                      {r.preChecker}
                      {r.postChecker && r.postChecker !== r.preChecker && <span className="cell-sub">{r.postChecker}</span>}
                    </td>
                    <td>{`${r.startKm.toLocaleString()}→${r.endKm.toLocaleString()}km（${r.tripKm}km）`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
