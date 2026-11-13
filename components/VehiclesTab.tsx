'use client';

import { useMemo, useRef, useState } from 'react';
import { useMobileLimit } from '@/lib/useLimit';
import { AppData, Vehicle } from '@/lib/types';
import { jpDate } from '@/lib/maint-schedule';
import { urgencyLevel, urgencyPill, daysUntil, genId, openMaintRequests, todayStr, tireSetsOf, tireInfoText, TIRE_YEAR_RE } from '@/lib/utils';
import { csvToVehicles, downloadCsv, vehiclesToCsv } from '@/lib/csv';
import { normalizeAlertSettings } from '@/lib/alert-settings';
import Modal from './Modal';
import VehicleOcrModal from './VehicleOcrModal';

const emptyVehicle = (data: AppData): Vehicle => ({
  id: '',
  name: '',
  plate: '',
  modelType: '',
  shakenDate: '',
  checkDate: '',
  odometer: 0,
  oilKm: 3000,
  tire: data.masters.tireTypes[0] || '',
  maintHistory: [],
});

// タイヤのメーカーの入力候補（これ以外も入力できる）
const TIRE_MAKERS = ['ブリヂストン', 'ヨコハマ', 'ダンロップ', 'トーヨー', 'ミシュラン', 'グッドイヤー', 'ピレリ', 'ファルケン', 'コンチネンタル', 'ハンコック', 'クムホ', 'ナンカン'];

export default function VehiclesTab({
  data,
  onSave,
  onDelete,
  onBulkSave,
  readOnly = false,
  onRefresh,
}: {
  data: AppData;
  onSave: (v: Vehicle) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onBulkSave: (list: Vehicle[]) => Promise<unknown>;
  // 管理者以外は見るだけ（登録・編集・削除・取込のボタンを出さない）
  readOnly?: boolean;
  // 車検証の画像を保存・削除したあとに、一覧を最新にする
  onRefresh?: () => unknown;
}) {
  const alertDays = normalizeAlertSettings(data.alertSettings);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);
  const [bulkRows, setBulkRows] = useState<Vehicle[] | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [showShakenOcr, setShowShakenOcr] = useState(false);
  // 登録済みの車両に車検証を追加する（車両カードの「車検証」）／編集中の車両に読み取り結果を入れる（編集画面）
  const [ocrTarget, setOcrTarget] = useState<Vehicle | null>(null);
  // 登録済みの画像を読み込んだ状態で、読み取りの画面を開くとき、どちらの書類か
  const [ocrPreload, setOcrPreload] = useState<'cert' | 'record' | undefined>(undefined);
  const [showEditOcr, setShowEditOcr] = useState(false);
  // 保存した車検証の画像を見る（管理者のみ）
  const [viewShaken, setViewShaken] = useState<Vehicle | null>(null);
  // 見ている画像の種類：車検証、または検査証記録事項
  const [viewKind, setViewKind] = useState<'cert' | 'record'>('cert');
  const [shakenMissing, setShakenMissing] = useState(false);
  // 各車両の「整備記録」「運転記録」を一覧で見る画面
  const [viewing, setViewing] = useState<{ vehicleId: string; kind: 'maint' | 'drive' } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const driveCounts = useMemo(() => {
    const map = new Map<string, number>();
    data.reports.filter((r) => !r.maintOnly).forEach((r) => map.set(r.vehicleId, (map.get(r.vehicleId) || 0) + 1));
    return map;
  }, [data.reports]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return data.vehicles;
    return data.vehicles.filter((v) => v.name.includes(q) || v.plate.includes(q));
  }, [data.vehicles, query]);

  function openNew() {
    setEditing(emptyVehicle(data));
  }
  function openEdit(v: Vehicle) {
    setEditing({ ...v, maintHistory: [...v.maintHistory] });
  }

  async function handleSubmit() {
    if (!editing) return;
    if (!editing.name || !editing.plate) {
      alert('車両呼称とナンバープレートは必須です。');
      return;
    }
    const sets = tireSetsOf(editing);
    const clean = (t: { maker?: string; year?: string }) => ({ maker: (t.maker || '').trim(), year: (t.year || '').trim() });
    const sm = clean(sets.summer);
    const wn = clean(sets.winter);
    if ((sm.year && !TIRE_YEAR_RE.test(sm.year)) || (wn.year && !TIRE_YEAR_RE.test(wn.year))) {
      alert('タイヤの製造年は、「2024」か「2024-05」の形で入れてください。');
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...editing, tireMaker: undefined, tireYear: undefined, tireSummer: sm, tireWinter: wn });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('この車両を削除しますか？関連する過去の日報は残ります。')) return;
    await onDelete(id);
  }

  async function deleteShakenFile(v: Vehicle) {
    const label = viewKind === 'record' ? '検査証記録事項' : '車検証';
    if (!confirm(`「${v.name}」の${label}の画像を削除しますか？（車両の登録内容は消えません）`)) return;
    try {
      await fetch(`/api/vehicles/${encodeURIComponent(v.id)}/shaken${viewKind === 'record' ? '?kind=record' : ''}`, { method: 'DELETE' });
    } finally {
      setViewShaken(null);
      await onRefresh?.();
    }
  }

  const shakenUrl = viewShaken
    ? `/api/vehicles/${encodeURIComponent(viewShaken.id)}/shaken?${viewKind === 'record' ? 'kind=record&' : ''}t=${encodeURIComponent((viewKind === 'record' ? viewShaken.recordFileAt : viewShaken.shakenFileAt) || '')}`
    : '';

  function shakenBadge(v: Vehicle) {
    const days = daysUntil(v.shakenDate);
    if (days === null) return <span className="pill pill-slate">未設定</span>;
    if (days < 0) return <span className="pill pill-red">期限切れ</span>;
    if (days <= alertDays.shakenDays) return <span className="pill pill-amber">あと{days}日</span>;
    return <span className="pill pill-green">正常</span>;
  }

  function openBulkEdit() {
    setBulkRows(data.vehicles.map((v) => ({ ...v, maintHistory: [...v.maintHistory] })));
  }

  function addBulkRow() {
    setBulkRows((rows) => [
      ...(rows || []),
      {
        id: genId('v'),
        name: '',
        plate: '',
        modelType: '',
        shakenDate: '',
        checkDate: '',
        odometer: 0,
        oilKm: 3000,
        tire: data.masters.tireTypes[0] || '',
        maintHistory: [],
      },
    ]);
  }

  function updateBulkRow(idx: number, patch: Partial<Vehicle>) {
    setBulkRows((rows) => {
      if (!rows) return rows;
      const list = [...rows];
      list[idx] = { ...list[idx], ...patch };
      return list;
    });
  }

  function removeBulkRow(idx: number) {
    setBulkRows((rows) => {
      if (!rows) return rows;
      const list = [...rows];
      list.splice(idx, 1);
      return list;
    });
  }

  async function saveBulkEdit() {
    if (bulkRows === null) return;
    if (bulkRows.some((v) => !v.name.trim() || !v.plate.trim())) {
      alert('車両呼称・ナンバープレートは全行で必須です。');
      return;
    }
    const removedCount = data.vehicles.length - bulkRows.filter((v) => v.id).length;
    const confirmMsg =
      removedCount > 0
        ? `${bulkRows.length}件を保存します（${removedCount}件の車両が削除されます）。よろしいですか？`
        : `${bulkRows.length}件を保存します。よろしいですか？`;
    if (!confirm(confirmMsg)) return;
    setBulkSaving(true);
    try {
      await onBulkSave(bulkRows);
      setBulkRows(null);
    } finally {
      setBulkSaving(false);
    }
  }

  function triggerCsvImport() {
    fileRef.current?.click();
  }

  function handleCsvFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || '');
      const imported = csvToVehicles(text, data.vehicles);
      const byId = new Map(data.vehicles.map((v) => [v.id, v]));
      imported.forEach((v) => byId.set(v.id, v));
      if (!confirm(`${imported.length}件の車両データを取り込みます。よろしいですか？`)) return;
      await onBulkSave(Array.from(byId.values()));
    };
    reader.readAsText(file, 'utf-8');
    if (fileRef.current) fileRef.current.value = '';
  }

  function exportCsv() {
    downloadCsv(`車両台帳_${todayStr()}.csv`, vehiclesToCsv(data.vehicles).replace(/^﻿/, ''));
  }

  // 「整備記録」「運転記録」の一覧に使うデータ
  const viewVehicle = viewing ? data.vehicles.find((x) => x.id === viewing.vehicleId) : undefined;
  const maintRows = viewVehicle ? [...viewVehicle.maintHistory].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)) : [];
  const maintCost = maintRows.reduce((sum, m) => sum + (m.cost || 0), 0);
  const maintRequests = viewVehicle ? openMaintRequests(data.reports).filter((r) => r.vehicleId === viewVehicle.id) : [];
  const driveRows = viewVehicle
    ? data.reports.filter((r) => !r.maintOnly && r.vehicleId === viewVehicle.id).sort((a, b) => (b.date + b.preTime).localeCompare(a.date + a.preTime))
    : [];
  const driveKm = driveRows.reduce((sum, r) => sum + (r.postDone ? r.tripKm || 0 : 0), 0);
  const driveOut = driveRows.filter((r) => !r.postDone).length;
  const lim = useMobileLimit(filtered, 3, query);

  return (
    <div>
      <div className="card">
        <div className="toolbar2">
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}>
              🚗 社用車 台帳管理 <span className="pill pill-slate">車検・車両・整備</span>
            </h3>
            <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
              車検満了日・12ヶ月点検・走行メーター・タイヤ種別を一括管理できます。
            </div>
          </div>
          <div className="actions">
            <input
              className="search"
              placeholder="車両呼称・ナンバーで検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid var(--slate-300)', borderRadius: 8, minWidth: 180 }}
            />
            {!readOnly && (
              <>
                <button className="btn btn-sm" onClick={openBulkEdit}>
                  📝 まとめて一括編集
                </button>
                <button className="btn btn-sm" onClick={triggerCsvImport}>
                  ⬆ 車両CSV取込
                </button>
              </>
            )}
            <button className="btn btn-sm" onClick={exportCsv}>
              ⬇ 車両CSV出力
            </button>
            {!readOnly && (
              <>
                <button className="btn btn-sm" onClick={() => setShowShakenOcr(true)}>
                  📷 車検証で登録・更新
                </button>
                <button className="btn btn-primary btn-sm" onClick={openNew}>
                  ＋ 1台ずつ新規登録
                </button>
              </>
            )}
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => handleCsvFile(e.target.files?.[0] || null)} />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">車両データがありません</div>
        ) : (
          <div className="cardgrid">
            {lim.shown.map((v) => {
              const remainOil = Math.max(0, v.oilKm - v.odometer);
              return (
                <div className="entity-card" key={v.id}>
                  <div className="ehead">
                    <div>
                      <div className="ename">{v.name}</div>
                      <div className="esub">
                        {v.plate} / 型式: {v.modelType || '-'}
                        {v.chassisNo ? ` / 車台番号: ${v.chassisNo}` : ''}
                      </div>
                    </div>
                    <span className="pill pill-slate">{v.tire}</span>
                  </div>
                  {(() => {
                    const t = tireSetsOf(v);
                    const winterNow = /スタッドレス|冬/.test(v.tire || '');
                    const lines = [
                      { ic: '☀️', label: '夏', info: tireInfoText(t.summer), on: !winterNow && !!v.tire },
                      { ic: '❄️', label: '冬', info: tireInfoText(t.winter), on: winterNow },
                    ].filter((x) => x.info);
                    return lines.length ? (
                      <div className="esub" style={{ marginBottom: 6 }}>
                        {lines.map((x) => (
                          <div key={x.label}>
                            {x.ic} {x.label}タイヤ: {x.info}
                            {x.on ? '（装着中）' : ''}
                          </div>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  <div className="emeta">
                    <div>
                      <span className="k">残存整備距離</span>
                      <span className="v">{remainOil.toLocaleString()} km</span>
                    </div>
                    <div>
                      <span className="k">次回オイル交換目安</span>
                      <span className="v">{v.oilKm.toLocaleString()} km</span>
                    </div>
                    <div>
                      <span className="k">車検満了日</span>
                      <span className="v">
                        {v.shakenDate || '-'} {shakenBadge(v)}
                      </span>
                    </div>
                    <div>
                      <span className="k">12ヶ月点検日</span>
                      <span className="v">{v.checkDate || '-'}</span>
                    </div>
                  </div>
                  <div className="efoot">
                    <div className="eactions">
                      {!readOnly && (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => openEdit(v)}>
                            ✏️ 編集
                          </button>
                          <button className="btn btn-sm" onClick={() => {
                            setOcrPreload(undefined);
                            setOcrTarget(v);
                          }}>
                            📷 車検証
                          </button>
                          {v.shakenFileAt && (
                            <button
                              className="btn btn-sm"
                              onClick={() => {
                                setShakenMissing(false);
                                setViewKind('cert');
                                setViewShaken(v);
                              }}
                            >
                              📎 車検証を見る
                            </button>
                          )}
                          {v.recordFileAt && (
                            <button
                              className="btn btn-sm"
                              onClick={() => {
                                setShakenMissing(false);
                                setViewKind('record');
                                setViewShaken(v);
                              }}
                            >
                              📎 記録事項を見る
                            </button>
                          )}
                        </>
                      )}
                      <button className="btn btn-sm" onClick={() => setViewing({ vehicleId: v.id, kind: 'maint' })}>
                        🔧 整備記録（{v.maintHistory.length}）
                      </button>
                      <button className="btn btn-sm" onClick={() => setViewing({ vehicleId: v.id, kind: 'drive' })}>
                        📋 運転記録（{driveCounts.get(v.id) || 0}）
                      </button>
                    </div>
                    {!readOnly && <span className="eid">{v.id}</span>}
                    {!readOnly && (
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(v.id)}>
                        削除
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {lim.more}
      </div>

      {viewing && viewVehicle && viewing.kind === 'maint' && (
        <Modal
          wide
          title={`🔧 整備記録 — ${viewVehicle.name}`}
          onClose={() => setViewing(null)}
          footer={
            <button className="btn" onClick={() => setViewing(null)}>
              閉じる
            </button>
          }
        >
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--slate-600)', marginBottom: 10 }}>
            <span>{viewVehicle.plate}</span>
            <span>全{maintRows.length}件</span>
            <span>費用合計 {maintCost.toLocaleString()} 円</span>
            <span>現在の走行距離 {viewVehicle.odometer.toLocaleString()} km</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 10 }}>整備記録の追加・修正・削除は「整備台帳」タブで行います。</div>
          {maintRequests.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                整備依頼（対応待ち）<span className="pill pill-red" style={{ marginLeft: 6 }}>{maintRequests.length}件</span>
              </div>
              <div className="alert-list">
                {maintRequests.map((r) => (
                  <div key={r.id} className={`alert-item u-${urgencyLevel(r.maintRequestUrgency)}`}>
                    <span>🔧</span>
                    <div style={{ flex: 1 }}>
                      <strong>{r.maintRequestType || '整備'}</strong>
                      <span className={`pill ${urgencyPill(r.maintRequestUrgency)}`} style={{ marginLeft: 6 }}>{r.maintRequestUrgency || '通常'}</span>
                      <div style={{ fontSize: 12, marginTop: 2 }}>
                        {r.maintRequestNote || '（内容の記入なし）'}　依頼: {r.date} {r.driver}
                        {r.maintRequestScheduledDate && <span className="pill pill-sky" style={{ marginLeft: 6 }}>📅 修理予定 {jpDate(r.maintRequestScheduledDate)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {maintRows.length === 0 ? (
            <div className="empty-state">この車両の整備記録はまだありません</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>実施日</th>
                    <th>整備種別</th>
                    <th>走行km</th>
                    <th>費用</th>
                    <th>実施先</th>
                    <th>依頼内容</th>
                    <th>整備内容</th>
                    <th>備考</th>
                  </tr>
                </thead>
                <tbody>
                  {maintRows.map((m, i) => (
                    <tr key={`${m.date}-${i}`}>
                      <td>{m.date}</td>
                      <td>
                        <span className="pill pill-slate">{m.type}</span>
                      </td>
                      <td>{m.km ? m.km.toLocaleString() : '-'}</td>
                      <td>{m.cost === undefined ? '-' : `${m.cost.toLocaleString()} 円`}</td>
                      <td>{m.shop || '-'}</td>
                      <td style={{ whiteSpace: 'pre-wrap' }}>{m.request || '-'}</td>
                      <td style={{ whiteSpace: 'pre-wrap' }}>{m.work || '-'}</td>
                      <td style={{ whiteSpace: 'pre-wrap' }}>{m.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {viewing && viewVehicle && viewing.kind === 'drive' && (
        <Modal
          wide
          title={`📋 運転記録 — ${viewVehicle.name}`}
          onClose={() => setViewing(null)}
          footer={
            <button className="btn" onClick={() => setViewing(null)}>
              閉じる
            </button>
          }
        >
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--slate-600)', marginBottom: 10 }}>
            <span>{viewVehicle.plate}</span>
            <span>全{driveRows.length}件</span>
            <span>実走行合計 {driveKm.toLocaleString()} km</span>
            {driveOut > 0 && <span className="pill pill-amber">出庫中 {driveOut}件</span>}
          </div>
          {driveRows.length === 0 ? (
            <div className="empty-state">この車両の運転記録はまだありません</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>運転者</th>
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
                      <td>{r.driver}</td>
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
                          <span className={`pill ${r.maintRequestWatch ? 'pill-sky' : r.maintRequestDone ? 'pill-green' : 'pill-red'} cell-sub-pill`}>
                            🔧 整備依頼{r.maintRequestWatch ? '（経過観察）' : r.maintRequestDone ? '（対応済）' : ''}
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

      {viewShaken && (
        <Modal
          title={`${viewKind === 'record' ? '検査証記録事項' : '車検証'}：${viewShaken.name}`}
          onClose={() => setViewShaken(null)}
          wide
          footer={
            <>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setOcrPreload(viewKind);
                  setOcrTarget(viewShaken);
                  setViewShaken(null);
                }}
              >
                🤖 この画像から読み取る
              </button>
              <button className="btn btn-danger" onClick={() => deleteShakenFile(viewShaken)}>
                画像を削除
              </button>
              <a
                className="btn"
                href={`/api/vehicles/${encodeURIComponent(viewShaken.id)}/shaken${viewKind === 'record' ? '?kind=record' : ''}`}
                download={`${viewKind === 'record' ? '検査証記録事項' : '車検証'}_${viewShaken.plate || viewShaken.id}.jpg`}
              >
                ⬇️ ダウンロード
              </a>
              <button className="btn btn-primary" onClick={() => setViewShaken(null)}>
                閉じる
              </button>
            </>
          }
        >
          {shakenMissing ? (
            <div className="notice-box">画像を読み込めませんでした。管理者ログインが切れていないか確認してください。</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 8 }}>
                保存日時：{new Date((viewKind === 'record' ? viewShaken.recordFileAt : viewShaken.shakenFileAt) || '').toLocaleString('ja-JP')}　※ 管理者だけが見られます。写真をタップすると拡大します。
              </div>
              <a href={shakenUrl} target="_blank" rel="noreferrer">
                <img
                  src={shakenUrl}
                  alt={viewKind === 'record' ? '保存した検査証記録事項' : '保存した車検証'}
                  className="photo-preview"
                  onError={() => setShakenMissing(true)}
                />
              </a>
            </>
          )}
        </Modal>
      )}
      {showShakenOcr && <VehicleOcrModal data={data} onClose={() => setShowShakenOcr(false)} onSave={onSave} onFileSaved={onRefresh} />}
      {ocrTarget && (
        <VehicleOcrModal
          data={data}
          target={ocrTarget}
          preload={ocrPreload}
          onClose={() => {
            setOcrTarget(null);
            setOcrPreload(undefined);
          }}
          onSave={onSave}
          onFileSaved={onRefresh}
        />
      )}
      {showEditOcr && editing && (
        <VehicleOcrModal
          data={data}
          onClose={() => setShowEditOcr(false)}
          onApply={(patch) => setEditing((cur) => (cur ? { ...cur, ...patch } : cur))}
        />
      )}

      {editing && (
        <Modal
          title={editing.id ? '車両情報を編集' : '車両を新規登録'}
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
          <div className="section-heading">基本情報</div>
          <div className="field-row">
            <div className="field">
              <label>車両呼称</label>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="field">
              <label>ナンバープレート</label>
              <input value={editing.plate} onChange={(e) => setEditing({ ...editing, plate: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>型式</label>
            <input value={editing.modelType} onChange={(e) => setEditing({ ...editing, modelType: e.target.value })} />
          </div>

          <div className="section-heading">点検・車検</div>
          <div className="field-row">
            <div className="field">
              <label>車検満了日</label>
              <input type="date" value={editing.shakenDate} onChange={(e) => setEditing({ ...editing, shakenDate: e.target.value })} />
            </div>
            <div className="field">
              <label>12ヶ月点検日</label>
              <input type="date" value={editing.checkDate} onChange={(e) => setEditing({ ...editing, checkDate: e.target.value })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>現在積算走行（km）</label>
              <input type="number" value={editing.odometer} onChange={(e) => setEditing({ ...editing, odometer: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>次回オイル交換目安（km）</label>
              <input type="number" value={editing.oilKm} onChange={(e) => setEditing({ ...editing, oilKm: Number(e.target.value) })} />
            </div>
          </div>
          <div className="field">
            <label>タイヤ種別</label>
            <select value={editing.tire} onChange={(e) => setEditing({ ...editing, tire: e.target.value })}>
              {data.masters.tireTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {(['summer', 'winter'] as const).map((k) => {
            const key = k === 'summer' ? 'tireSummer' : 'tireWinter';
            const cur = tireSetsOf(editing)[k];
            const set = (patch: { maker?: string; year?: string }) => setEditing({ ...editing, tireMaker: undefined, tireYear: undefined, tireSummer: tireSetsOf(editing).summer, tireWinter: tireSetsOf(editing).winter, [key]: { ...cur, ...patch } });
            return (
              <div className="field-row" key={k}>
                <div className="field">
                  <label>{k === 'summer' ? '☀️ 夏タイヤのメーカー' : '❄️ 冬タイヤ（スタッドレス）のメーカー'}（任意）</label>
                  <input list="tire-makers" value={cur.maker || ''} maxLength={30} placeholder="例：ブリヂストン" onChange={(e) => set({ maker: e.target.value })} />
                </div>
                <div className="field">
                  <label>{k === 'summer' ? '☀️ 夏タイヤ' : '❄️ 冬タイヤ'}の製造年（年式・任意）</label>
                  <input
                    value={cur.year || ''}
                    maxLength={7}
                    inputMode="numeric"
                    placeholder="例：2024 または 2024-05"
                    onChange={(e) => set({ year: e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^0-9-]/g, '') })}
                  />
                  {cur.year && !TIRE_YEAR_RE.test(cur.year) && <div style={{ fontSize: 11, color: 'var(--amber-600)', marginTop: 2 }}>「2024」か「2024-05」の形で入れてください。</div>}
                </div>
              </div>
            );
          })}
          <datalist id="tire-makers">
            {TIRE_MAKERS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <div style={{ fontSize: 11, color: 'var(--slate-500)', margin: '-6px 0 12px' }}>
            夏と冬のタイヤを、別々に記録できます（「タイヤ種別」は、いま付けているほうです）。製造年は、タイヤ側面の「DOT」の最後の4桁（例：2324 は 2024年の23週）で分かります。
          </div>

          <div className="section-heading" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            車検証の情報
            <button type="button" className="btn btn-sm" onClick={() => setShowEditOcr(true)}>
              📷 車検証から読み取る
            </button>
          </div>
          <div className="field-row">
            <div className="field">
              <label>車台番号</label>
              <input value={editing.chassisNo || ''} placeholder="例：GDH206-1234567" onChange={(e) => setEditing({ ...editing, chassisNo: e.target.value })} />
            </div>
            <div className="field">
              <label>初度登録年月</label>
              <input type="month" value={editing.firstRegistered || ''} onChange={(e) => setEditing({ ...editing, firstRegistered: e.target.value })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>車名（メーカー）</label>
              <input value={editing.maker || ''} onChange={(e) => setEditing({ ...editing, maker: e.target.value })} />
            </div>
            <div className="field">
              <label>燃料の種類</label>
              <input value={editing.fuelType || ''} placeholder="例：軽油" onChange={(e) => setEditing({ ...editing, fuelType: e.target.value })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>乗車定員</label>
              <input value={editing.capacity || ''} placeholder="例：5人" onChange={(e) => setEditing({ ...editing, capacity: e.target.value })} />
            </div>
            <div className="field">
              <label>車両総重量</label>
              <input value={editing.grossWeight || ''} placeholder="例：2,610kg" onChange={(e) => setEditing({ ...editing, grossWeight: e.target.value })} />
            </div>
            <div className="field">
              <label>総排気量</label>
              <input value={editing.displacement || ''} placeholder="例：2.76L" onChange={(e) => setEditing({ ...editing, displacement: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}

      {bulkRows !== null && (
        <Modal
          title="社用車台帳 まとめて一括編集"
          onClose={() => setBulkRows(null)}
          wide="x"
          footer={
            <>
              <button className="btn" onClick={() => setBulkRows(null)}>
                破棄して閉じる
              </button>
              <button className="btn btn-primary" onClick={saveBulkEdit} disabled={bulkSaving}>
                {bulkSaving ? '保存中…' : '✓ 変更を一括保存する'}
              </button>
            </>
          }
        >
          <div className="bulk-grid-toolbar">
            <button className="btn btn-sm bulk-grid-add-row" type="button" onClick={addBulkRow}>
              ＋ 車両行を追加（+1台）
            </button>
            <span className="bulk-grid-hint">※各セルを直接クリックして文字や数値を書き換えてください</span>
            <span className="bulk-grid-count">登録車両数: {bulkRows.length}台</span>
          </div>
          <div className="bulk-grid-wrap">
            <table className="bulk-grid">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>車両呼称（車名/色）*</th>
                  <th>ナンバープレート *</th>
                  <th>型式</th>
                  <th>車検満了日 *</th>
                  <th>12ヶ月点検日</th>
                  <th>現在積算（km）</th>
                  <th>次回オイル目安</th>
                  <th>装着タイヤ</th>
                  <th>削除</th>
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((v, idx) => (
                  <tr key={v.id || idx}>
                    <td className="bulk-no">{idx + 1}</td>
                    <td>
                      <input value={v.name} onChange={(e) => updateBulkRow(idx, { name: e.target.value })} />
                    </td>
                    <td>
                      <input value={v.plate} onChange={(e) => updateBulkRow(idx, { plate: e.target.value })} />
                    </td>
                    <td>
                      <input value={v.modelType} onChange={(e) => updateBulkRow(idx, { modelType: e.target.value })} />
                    </td>
                    <td>
                      <input type="date" value={v.shakenDate} onChange={(e) => updateBulkRow(idx, { shakenDate: e.target.value })} />
                    </td>
                    <td>
                      <input type="date" value={v.checkDate} onChange={(e) => updateBulkRow(idx, { checkDate: e.target.value })} />
                    </td>
                    <td>
                      <input type="number" value={v.odometer} onChange={(e) => updateBulkRow(idx, { odometer: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input type="number" value={v.oilKm} onChange={(e) => updateBulkRow(idx, { oilKm: Number(e.target.value) })} />
                    </td>
                    <td>
                      <select value={v.tire} onChange={(e) => updateBulkRow(idx, { tire: e.target.value })}>
                        {data.masters.tireTypes.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="bulk-del">
                      <button className="bulk-grid-del-btn" type="button" onClick={() => removeBulkRow(idx)} aria-label="この行を削除">
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}
