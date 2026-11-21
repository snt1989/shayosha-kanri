'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AppData, Report } from '@/lib/types';
import { downloadCsv } from '@/lib/csv';
import { editSummary } from '@/lib/report-edit';
import Modal from './Modal';

const jp = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5, 7))}月`;
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
// 酒気帯びの有無（検知器の値が 0 より大きければ「有」）
const drunk = (v: string) => (parseFloat(v || '0') > 0 ? '有' : '無');
const val = (v: string) => (v ? `${v}mg/L` : '');

type Row = { r: Report; skipped: boolean };

// アルコールチェック記録簿（酒気帯びの有無の確認の記録）。月と運転者を選んで、印刷（PDF保存）とCSV出力ができる。
// 保管へ移した古い月の日報も、合わせて読む。
export default function AlcoholRecordBook({ data, onClose }: { data: AppData; onClose: () => void }) {
  const [month, setMonth] = useState(thisMonth());
  const [driver, setDriver] = useState('');
  const [archived, setArchived] = useState<Report[]>([]);
  const [archiveMonths, setArchiveMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    fetch('/api/reports/archive', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => j?.success && setArchiveMonths(j.months.map((m: { month: string }) => m.month)))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    let live = true;
    setArchived([]);
    if (!archiveMonths.includes(month)) return;
    setLoading(true);
    fetch(`/api/reports/archive?month=${month}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => live && j?.success && setArchived(j.reports))
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [month, archiveMonths]);

  const months = useMemo(() => {
    const set = new Set<string>([thisMonth(), ...archiveMonths]);
    for (const r of data.reports) if (!r.maintOnly && /^\d{4}-\d{2}/.test(r.date)) set.add(r.date.slice(0, 7));
    return [...set].sort().reverse();
  }, [data.reports, archiveMonths]);

  const all = useMemo(() => {
    const seen = new Set<string>();
    return [...data.reports, ...archived]
      .filter((r) => !r.maintOnly && r.date.startsWith(month) && !seen.has(r.id) && seen.add(r.id))
      .sort((a, b) => (a.date + a.preTime).localeCompare(b.date + b.preTime));
  }, [data.reports, archived, month]);
  const drivers = useMemo(() => [...new Set(all.map((r) => r.driver))].sort((a, b) => a.localeCompare(b, 'ja')), [all]);
  const rows: Row[] = useMemo(() => all.filter((r) => !driver || r.driver === driver).map((r) => ({ r, skipped: Boolean(r.alcoholSkipped) })), [all, driver]);
  const edited = rows.filter((x) => x.r.editLog?.length);

  function exportCsv() {
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const head = ['日付', '運転者', '部署', '車両', '登録番号', '行先・用件', '運転前 時刻', '運転前 確認方法', '運転前 測定値(mg/L)', '運転前 酒気帯び', '運転前 確認者', '運転後 時刻', '運転後 確認方法', '運転後 測定値(mg/L)', '運転後 酒気帯び', '運転後 確認者', '特記事項・指示事項', '修正の履歴'];
    const body = rows.map(({ r, skipped }) =>
      [
        r.date,
        r.driver,
        r.dept,
        r.vehicleName,
        r.plate,
        `${r.destination}${r.purpose ? ' / ' + r.purpose : ''}`,
        r.preTime,
        skipped ? 'パス（免除）' : r.preMethod || '',
        skipped ? '' : r.preAlcohol,
        skipped ? '' : drunk(r.preAlcohol),
        r.preChecker,
        r.postDone ? r.postTime : '（帰着登録がまだ）',
        r.postDone ? (skipped ? 'パス（免除）' : r.postMethod || '') : '',
        r.postDone && !skipped ? r.postAlcohol : '',
        r.postDone && !skipped ? drunk(r.postAlcohol) : '',
        r.postDone ? r.postChecker : '',
        r.notes,
        (r.editLog || []).map(editSummary).join(' / '),
      ]
        .map(esc)
        .join(',')
    );
    downloadCsv(`アルコールチェック記録簿_${month}${driver ? '_' + driver.replace(/\s/g, '') : ''}.csv`, [head.map(esc).join(','), ...body].join('\r\n'));
  }

  const table = (
    <table className="alc-table">
      <thead>
        <tr>
          <th rowSpan={2}>日付</th>
          <th rowSpan={2}>運転者</th>
          <th rowSpan={2}>車両（登録番号）</th>
          <th colSpan={4}>運転前</th>
          <th colSpan={4}>運転後</th>
          <th rowSpan={2}>特記事項・指示事項</th>
        </tr>
        <tr>
          <th>時刻</th>
          <th>確認方法</th>
          <th>酒気帯び</th>
          <th>確認者</th>
          <th>時刻</th>
          <th>確認方法</th>
          <th>酒気帯び</th>
          <th>確認者</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ r, skipped }) => (
          <tr key={r.id}>
            <td>{r.date.slice(5).replace('-', '/')}</td>
            <td>{r.driver}</td>
            <td>
              {r.vehicleName}
              {r.plate ? `（${r.plate}）` : ''}
            </td>
            <td>{r.preTime}</td>
            <td>{skipped ? 'パス（免除）' : r.preMethod || ''}</td>
            <td className={!skipped && drunk(r.preAlcohol) === '有' ? 'alc-ng' : ''}>{skipped ? '-' : `${drunk(r.preAlcohol)} ${val(r.preAlcohol)}`}</td>
            <td>{r.preChecker}</td>
            {r.postDone ? (
              <>
                <td>{r.postTime}</td>
                <td>{skipped ? 'パス（免除）' : r.postMethod || ''}</td>
                <td className={!skipped && drunk(r.postAlcohol) === '有' ? 'alc-ng' : ''}>{skipped ? '-' : `${drunk(r.postAlcohol)} ${val(r.postAlcohol)}`}</td>
                <td>{r.postChecker}</td>
              </>
            ) : (
              <td colSpan={4} className="alc-open">
                帰着登録がまだ
              </td>
            )}
            <td>
              {r.notes}
              {r.editLog?.length ? <span className="alc-edited">（修正あり※）</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const notes = edited.length > 0 && (
    <div className="alc-edits">
      <strong>※ 修正の履歴</strong>
      {edited.map(({ r }) => (
        <div key={r.id}>
          {r.date} {r.driver}（{r.vehicleName}）：{(r.editLog || []).map(editSummary).join(' / ')}
        </div>
      ))}
    </div>
  );
  const title = `アルコールチェック記録簿　${jp(month)}${driver ? `　${driver}` : ''}`;

  return (
    <>
      <Modal
        title="🍺 アルコールチェック記録簿"
        onClose={onClose}
        wide="x"
        footer={
          <>
            <button className="btn" onClick={onClose}>
              閉じる
            </button>
            <button className="btn" onClick={exportCsv} disabled={rows.length === 0}>
              ⬇ CSV出力
            </button>
            <button className="btn btn-primary" onClick={() => window.print()} disabled={rows.length === 0}>
              🖨 印刷・PDF保存
            </button>
          </>
        }
      >
        <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 10 }}>
          運転前後の酒気帯びの確認の記録を、月ごとにまとめます。「印刷・PDF保存」を押し、送信先で「PDFに保存」を選ぶと、PDFで残せます（記録は1年間の保存が必要です）。
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <label className="alc-pick">
            月
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {jp(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="alc-pick">
            運転者
            <select value={driver} onChange={(e) => setDriver(e.target.value)}>
              <option value="">全員</option>
              {drivers.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <span className="pill pill-slate" style={{ alignSelf: 'center' }}>
            {loading ? '読み込み中…' : `${rows.length}件`}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="empty-state">この月の記録はありません</div>
        ) : (
          <div className="table-wrap">
            <div className="alc-scroll">{table}</div>
            {notes}
          </div>
        )}
      </Modal>
      {/* 印刷用（画面には出ない。印刷のときだけ、これだけを出す） */}
      {mounted &&
        createPortal(
          <div className="print-sheet alc-print">
            <h1>{title}</h1>
            <div className="alc-print-meta">
              出力日：{new Date().toLocaleDateString('ja-JP')}　件数：{rows.length}件
            </div>
            {table}
            {notes}
            <div className="alc-sign">安全運転管理者　確認：＿＿＿＿＿＿＿＿＿＿＿＿</div>
          </div>,
          document.body
        )}
    </>
  );
}
