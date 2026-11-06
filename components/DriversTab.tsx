'use client';

import { useMemo, useRef, useState } from 'react';
import { AppData, Driver } from '@/lib/types';
import { previewEmpId } from '@/lib/empId';
import { daysUntil, todayStr } from '@/lib/utils';
import { csvToDrivers, downloadCsv, driversToCsv } from '@/lib/csv';
import Modal from './Modal';

const emptyDriver = (data: AppData): Driver => ({
  id: '',
  lastName: '',
  firstName: '',
  empId: '',
  dept: data.masters.departments[0] || '',
  licenseType: data.masters.licenseTypes[0] || '',
  licenseExpiry: '',
  phone: '',
  licenseNo: '',
  notes: '',
});

export default function DriversTab({
  data,
  onSave,
  onDelete,
  onBulkSave,
}: {
  data: AppData;
  onSave: (d: Driver) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onBulkSave: (list: Driver[]) => Promise<unknown>;
}) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Driver | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reportsOf = (d: Driver) =>
    data.reports.filter((r) => !r.maintOnly && (r.driverId ? r.driverId === d.id : r.driver.replace(/\s/g, '') === `${d.lastName}${d.firstName}`));
  const countById = useMemo(() => {
    const m: Record<string, number> = {};
    data.drivers.forEach((d) => {
      m[d.id] = reportsOf(d).length;
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.drivers, data.reports]);
  const viewDriver = viewingId ? data.drivers.find((d) => d.id === viewingId) || null : null;
  const driveRows = viewDriver
    ? reportsOf(viewDriver).sort((a, b) => (b.date + b.preTime).localeCompare(a.date + a.preTime))
    : [];
  const driveKm = driveRows.reduce((s, r) => s + (r.postDone ? r.tripKm || 0 : 0), 0);
  const driveOut = driveRows.filter((r) => !r.postDone).length;

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return data.drivers;
    return data.drivers.filter(
      (d) => `${d.lastName}${d.firstName}`.includes(q) || d.empId.includes(q) || d.dept.includes(q)
    );
  }, [data.drivers, query]);

  function openNew() {
    setEditing(emptyDriver(data));
  }
  function openEdit(d: Driver) {
    setEditing({ ...d });
  }

  async function handleSubmit() {
    if (!editing) return;
    if (!editing.lastName || !editing.firstName) {
      alert('氏名（姓・名）は必須です。');
      return;
    }
    setSaving(true);
    try {
      await onSave(editing);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('この運転者を削除しますか？')) return;
    await onDelete(id);
  }

  function licenseBadge(d: Driver) {
    const days = daysUntil(d.licenseExpiry);
    if (days === null) return <span className="pill pill-slate">未設定</span>;
    if (days < 0) return <span className="pill pill-red">期限切れ</span>;
    if (days <= 30) return <span className="pill pill-amber">あと{days}日</span>;
    return <span className="pill pill-green">正常</span>;
  }

  function triggerCsvImport() {
    fileRef.current?.click();
  }

  function handleCsvFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || '');
      const imported = csvToDrivers(text);
      const byId = new Map(data.drivers.map((d) => [d.id, d]));
      imported.forEach((d) => byId.set(d.id, d));
      if (!confirm(`${imported.length}件の運転者データを取り込みます。よろしいですか？`)) return;
      await onBulkSave(Array.from(byId.values()));
    };
    reader.readAsText(file, 'utf-8');
    if (fileRef.current) fileRef.current.value = '';
  }

  function exportCsv() {
    downloadCsv(`運転者台帳_${todayStr()}.csv`, driversToCsv(data.drivers).replace(/^﻿/, ''));
  }

  return (
    <div>
      <div className="card">
        <div className="toolbar2">
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}>
              🪪 運転者 台帳管理 <span className="pill pill-slate">本人セルフ登録・免許OCR対応</span>
            </h3>
            <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
              運転者の登録・免許証有効期限アラート（60日以内）・所属部署管理
            </div>
          </div>
          <div className="actions">
            <input
              className="search"
              placeholder="氏名・社員番号・部署で検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid var(--slate-300)', borderRadius: 8, minWidth: 180 }}
            />
            <button className="btn btn-sm" onClick={openNew}>
              手入力で登録
            </button>
            <button className="btn btn-sm" onClick={triggerCsvImport}>
              ⬆ 運転者CSV取込
            </button>
            <button className="btn btn-sm" onClick={exportCsv}>
              ⬇ 運転者CSV出力
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => handleCsvFile(e.target.files?.[0] || null)} />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">運転者データがありません</div>
        ) : (
          <div className="cardgrid">
            {filtered.map((d) => (
              <div className="entity-card" key={d.id}>
                <div className="ehead">
                  <div>
                    <div className="ename">
                      {d.lastName} {d.firstName}
                    </div>
                    <div className="esub">
                      {d.dept} {d.empId && `(${d.empId})`}
                    </div>
                  </div>
                  <span className="pill pill-slate">{d.licenseType}</span>
                </div>
                <div className="emeta" style={{ gridTemplateColumns: '1fr' }}>
                  <div>
                    <span className="k">免許更新期限:</span> <span className="v">{d.licenseExpiry || '-'}</span> {licenseBadge(d)}
                  </div>
                  <div>
                    <span className="k">連絡先:</span> <span className="v">{d.phone || '-'}</span>
                  </div>
                  <div>
                    <span className="k">免許証番号:</span> <span className="v">{d.licenseNo || '-'}</span>
                  </div>
                </div>
                <div className="efoot">
                  <div className="eactions">
                    <button className="btn btn-sm" onClick={() => openEdit(d)}>
                      ✏️ 編集
                    </button>
                    <button className="btn btn-sm" onClick={() => setViewingId(d.id)}>
                      📋 運転記録（{countById[d.id] || 0}）
                    </button>
                  </div>
                  <span className="eid">{d.id}</span>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(d.id)}>
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewDriver && (
        <Modal
          wide
          title={`📋 運転記録 — ${viewDriver.lastName} ${viewDriver.firstName}`}
          onClose={() => setViewingId(null)}
          footer={
            <button className="btn" onClick={() => setViewingId(null)}>
              閉じる
            </button>
          }
        >
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--slate-600)', marginBottom: 10 }}>
            <span>{viewDriver.dept}</span>
            <span>全{driveRows.length}件</span>
            <span>実走行合計 {driveKm.toLocaleString()} km</span>
            {driveOut > 0 && <span className="pill pill-amber">出庫中 {driveOut}件</span>}
          </div>
          {driveRows.length === 0 ? (
            <div className="empty-state">この運転者の運転記録はまだありません</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>車両</th>
                    <th>行先・用件</th>
                    <th>出発〜帰着</th>
                    <th>メーター（実走行）</th>
                    <th>状態</th>
                  </tr>
                </thead>
                <tbody>
                  {driveRows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td>
                        {r.vehicleName}
                        <span className="cell-sub">{r.plate}</span>
                      </td>
                      <td>
                        {r.destination}
                        {r.purpose && <span className="cell-sub">{r.purpose}</span>}
                      </td>
                      <td>
                        {r.preTime}〜{r.postDone ? r.postTime : ''}
                      </td>
                      <td>
                        {r.postDone
                          ? `${r.startKm.toLocaleString()}→${r.endKm.toLocaleString()}km（${r.tripKm}km）`
                          : `${r.startKm.toLocaleString()}km〜`}
                      </td>
                      <td>
                        {r.postDone ? <span className="pill pill-green">帰着済</span> : <span className="pill pill-amber">出庫中</span>}
                        {r.maintRequest && (
                          <span className={`pill ${r.maintRequestDone ? 'pill-green' : 'pill-red'} cell-sub-pill`}>
                            🔧 整備依頼{r.maintRequestDone ? '（対応済）' : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {editing && (
        <Modal
          title={editing.id ? '運転者情報を編集' : '運転者を新規登録'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? '保存中…' : '保存する'}
              </button>
            </>
          }
        >
          <div className="field-row">
            <div className="field">
              <label>氏名（姓）</label>
              <input value={editing.lastName} onChange={(e) => setEditing({ ...editing, lastName: e.target.value })} />
            </div>
            <div className="field">
              <label>氏名（名）</label>
              <input value={editing.firstName} onChange={(e) => setEditing({ ...editing, firstName: e.target.value })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>社員番号</label>
              <input
                value={editing.empId}
                placeholder={editing.id ? '' : `空欄で自動採番（${previewEmpId(data)}）`}
                onChange={(e) => setEditing({ ...editing, empId: e.target.value })}
              />
            </div>
            <div className="field">
              <label>所属事業部</label>
              <select value={editing.dept} onChange={(e) => setEditing({ ...editing, dept: e.target.value })}>
                {data.masters.departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>免許種別</label>
              <select value={editing.licenseType} onChange={(e) => setEditing({ ...editing, licenseType: e.target.value })}>
                {data.masters.licenseTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>免許更新期日</label>
              <input type="date" value={editing.licenseExpiry} onChange={(e) => setEditing({ ...editing, licenseExpiry: e.target.value })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>連絡先電話番号</label>
              <input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>免許証番号</label>
              <input value={editing.licenseNo} onChange={(e) => setEditing({ ...editing, licenseNo: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>特記事項</label>
            <textarea rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
          </div>
        </Modal>
      )}

    </div>
  );
}
