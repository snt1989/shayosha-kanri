'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppData, Driver, MAINT_URGENCIES, Report, Vehicle } from '@/lib/types';
import { nowTimeStr, todayStr } from '@/lib/utils';
import { downloadCsv } from '@/lib/csv';
import { extractOdometerReading, loadTesseract } from '@/lib/ocr';
import Modal from './Modal';

// 「前回使った車両」: 運転者が分かればその人の直近の日報、なければ全体で直近の日報の車両。
// 台帳から削除済みの車両は対象外。data.reports は新しい順に保存されている。
const lastUsedVehicle = (data: AppData, driverId?: string): Vehicle | undefined => {
  const exists = (id: string) => data.vehicles.find((v) => v.id === id);
  if (driverId) {
    const mine = data.reports.find((r) => r.driverId === driverId && r.vehicleId && exists(r.vehicleId));
    if (mine) return exists(mine.vehicleId);
  }
  const any = data.reports.find((r) => r.vehicleId && exists(r.vehicleId));
  return any ? exists(any.vehicleId) : undefined;
};

const emptyReport = (data: AppData, currentDriver?: Driver | null, destination = ''): Report => {
  const lastVehicle = lastUsedVehicle(data, currentDriver?.id);
  return {
  id: '',
  date: todayStr(),
  dept: currentDriver?.dept || data.masters.departments[0] || '',
  driverId: currentDriver?.id || '',
  driverLast: currentDriver?.lastName || '',
  driverFirst: currentDriver?.firstName || '',
  driver: currentDriver ? `${currentDriver.lastName} ${currentDriver.firstName}`.trim() : '',
  vehicleId: lastVehicle?.id || '',
  vehicleName: lastVehicle?.name || '',
  plate: lastVehicle?.plate || '',
  destination,
  purpose: '',
  preTime: nowTimeStr(),
  preAlcohol: '0.00',
  preChecker: data.masters.checkers[0] || '',
  preMethod: data.masters.checkMethods[0] || '',
  alcoholSkipped: false,
  tireOk: true,
  brakeOk: true,
  postDone: false,
  postTime: '',
  postAlcohol: '0.00',
  postChecker: '',
  postMethod: '',
  startKm: lastVehicle?.odometer || 0,
  endKm: 0,
  tripKm: 0,
  notes: '',
  inspectionPhoto: '',
  };
};

function reportsToCsv(reports: Report[]): string {
  const headers = ['日付', '運転者', '使用車両', '行先・用件', '運転前ALC', '運転後ALC', '出発km', '帰着km', '実走行km', 'ステータス', '整備依頼', '特記事項'];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = reports.map((r) =>
    [
      r.date,
      r.driver,
      r.vehicleName,
      `${r.destination}${r.purpose ? ' / ' + r.purpose : ''}`,
      r.preAlcohol,
      r.postDone ? r.postAlcohol : '-',
      r.startKm,
      r.postDone ? r.endKm : '',
      r.postDone ? r.tripKm : '',
      r.postDone ? '帰着済' : '出庫中',
      r.maintRequest
        ? `${r.maintRequestDone ? '対応済 ' : '対応待ち '}${r.maintRequestType || ''}（${r.maintRequestUrgency || '通常'}）${r.maintRequestNote ? ' ' + r.maintRequestNote : ''}`.trim()
        : '',
      r.notes,
    ]
      .map(esc)
      .join(',')
  );
  return '﻿' + [headers.map(esc).join(','), ...rows].join('\r\n');
}

export default function ReportsTab({
  data,
  onSave,
  onDelete,
  openTrigger,
  openDestination,
  onQuickReportHandled,
  returnCheckinRequest,
  onReturnCheckinHandled,
  currentDriver,
  onRequestDriverLogin,
  isAdmin,
  onRequestLogin,
}: {
  data: AppData;
  onSave: (r: Report) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  openTrigger?: number | null;
  // 現場管理アプリの案件から開いたときの現場名（出発登録の行先に入れる）
  openDestination?: string;
  onQuickReportHandled?: () => void;
  returnCheckinRequest?: { id: string; token: number } | null;
  onReturnCheckinHandled?: () => void;
  currentDriver?: Driver | null;
  // 入力操作は運転者としてログインしているときだけ行える。未ログインのときにログイン画面を開く。
  onRequestDriverLogin: () => void;
  isAdmin: boolean;
  onRequestLogin: () => void;
}) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Report | null>(null);
  // 帰着登録（出庫中の日報に帰着情報だけを入れる操作）のとき true。出発登録の入力欄は表示しない。
  const [returnMode, setReturnMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const meterPhotoInputRef = useRef<HTMLInputElement>(null);
  const [meterOcrTarget, setMeterOcrTarget] = useState<'startKm' | 'endKm' | null>(null);
  const [meterOcrRunning, setMeterOcrRunning] = useState(false);

  // openTrigger/returnCheckinRequest はタブ切替と同時に発火するため、このコンポーネント
  // 自体が新規マウントされるケースがある（親のrefベースの前回値比較だと、マウント時に
  // ref の初期値が最新のprops値と一致してしまい、初回クリックが無視される）。
  // そのため「開いたら親に伝えてリクエストをクリアしてもらう」方式にして、値が
  // 存在する限り毎回確実に開く。
  useEffect(() => {
    if (openTrigger != null) {
      if (currentDriver) {
        setReturnMode(false);
        setEditing(emptyReport(data, currentDriver, openDestination || ''));
      } else {
        onRequestDriverLogin();
      }
      onQuickReportHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTrigger]);

  useEffect(() => {
    if (returnCheckinRequest) {
      const r = data.reports.find((x) => x.id === returnCheckinRequest.id);
      if (r) openReturnCheckin(r);
      onReturnCheckinHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnCheckinRequest]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return data.reports;
    return data.reports.filter(
      (r) => r.driver.includes(q) || r.vehicleName.includes(q) || r.destination.includes(q) || r.date.includes(q)
    );
  }, [data.reports, query]);

  const reportCodes = useMemo(() => {
    const sorted = [...data.reports].sort((a, b) => (a.date + a.preTime).localeCompare(b.date + b.preTime));
    const map = new Map<string, string>();
    sorted.forEach((r, idx) => map.set(r.id, `R-${101 + idx}`));
    return map;
  }, [data.reports]);

  function openNew() {
    if (!currentDriver) {
      onRequestDriverLogin();
      return;
    }
    setReturnMode(false);
    setEditing(emptyReport(data, currentDriver));
  }
  function openEdit(r: Report) {
    if (!isAdmin) {
      onRequestLogin();
      return;
    }
    setReturnMode(false);
    setEditing({ ...r });
  }
  function openReturnCheckin(r: Report) {
    if (!currentDriver) {
      onRequestDriverLogin();
      return;
    }
    setReturnMode(true);
    setEditing({
      ...r,
      postDone: true,
      postTime: r.postTime || nowTimeStr(),
      postChecker: r.postChecker || data.masters.checkers[0] || '',
      postMethod: r.postMethod || data.masters.checkMethods[0] || '',
    });
  }

  function selectVehicle(id: string) {
    if (!editing) return;
    const v = data.vehicles.find((x) => x.id === id);
    if (!v) {
      setEditing({ ...editing, vehicleId: '', vehicleName: '', plate: '', startKm: 0 });
      return;
    }
    setEditing({ ...editing, vehicleId: v.id, vehicleName: v.name, plate: v.plate, startKm: editing.startKm || v.odometer });
  }

  function handlePhotoFile(file: File | null) {
    if (!editing || !file) return;
    const reader = new FileReader();
    reader.onload = () => setEditing((cur) => (cur ? { ...cur, inspectionPhoto: String(reader.result) } : cur));
    reader.readAsDataURL(file);
  }

  function triggerMeterCamera(target: 'startKm' | 'endKm') {
    setMeterOcrTarget(target);
    meterPhotoInputRef.current?.click();
  }

  function handleMeterPhotoFile(file: File | null) {
    const target = meterOcrTarget;
    if (!file || !target) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const photo = String(reader.result);
      setMeterOcrRunning(true);
      try {
        const Tesseract = await loadTesseract();
        const res = await Tesseract.recognize(photo, 'eng', {
          tessedit_char_whitelist: '0123456789.',
        });
        const text = res?.data?.text || '';
        const reading = extractOdometerReading(text);
        if (reading === null) {
          alert('メーターの数値を読み取れませんでした。手入力してください。');
        } else {
          setEditing((cur) => (cur ? { ...cur, [target]: reading } : cur));
        }
      } catch {
        alert('OCR処理に失敗しました。手入力してください。');
      } finally {
        setMeterOcrRunning(false);
        setMeterOcrTarget(null);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!editing) return;
    if (!editing.driverLast || !editing.driverFirst || !editing.vehicleId) {
      alert('運転者（姓・名）・車両は必須です。');
      return;
    }
    if (editing.postDone && editing.maintRequest && !(editing.maintRequestNote || '').trim()) {
      alert('整備依頼の内容・症状を入力してください。');
      return;
    }
    const tripKm = editing.postDone ? Math.max(0, (editing.endKm || 0) - (editing.startKm || 0)) : 0;
    const driver = `${editing.driverLast} ${editing.driverFirst}`.trim();
    setSaving(true);
    try {
      const maint = editing.maintRequest
        ? {}
        : { maintRequest: false, maintRequestType: '', maintRequestUrgency: '', maintRequestNote: '', maintRequestDone: false, maintRequestDoneAt: '' };
      await onSave({ ...editing, ...maint, driver, tripKm });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!isAdmin) {
      onRequestLogin();
      return;
    }
    if (!confirm('この日報を削除しますか？')) return;
    await onDelete(id);
  }

  function exportCsv() {
    downloadCsv(`運転日報_${todayStr()}.csv`, reportsToCsv(filtered).replace(/^﻿/, ''));
  }

  return (
    <div>
      <div className="card">
        <div className="toolbar2">
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}>
              📋 運転日報 &amp; 酒気帯び確認記録簿 <span className="pill pill-slate">白ナンバー点呼基準</span>
            </h3>
            <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
              運転前後の酒気帯び確認・簡易点検・実走行kmを記録保管します。
              確定済み日報の編集・削除は管理者ログインが必要です。
            </div>
          </div>
          <div className="actions">
            <input
              className="search"
              placeholder="運転者・車両・行先を検索…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid var(--slate-300)', borderRadius: 8, minWidth: 220 }}
            />
            <button className="btn btn-sm" onClick={exportCsv}>
              ⬇ CSV出力
            </button>
            <button className="btn btn-primary btn-sm" onClick={openNew}>
              ＋ 出発登録（運転前）
            </button>
          </div>
        </div>

        {!currentDriver && (
          <div className="alert-item warn" style={{ margin: '4px 0 12px' }}>
            <span>🪪</span>
            <div style={{ flex: 1 }}>出発登録・帰着登録をするには、先に運転者としてログインしてください。</div>
            <button className="btn btn-sm btn-primary" onClick={onRequestDriverLogin}>
              運転者としてログイン
            </button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="empty-state">日報データがありません</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>運転者</th>
                  <th>使用車両</th>
                  <th>行先・用件</th>
                  <th>運転前ALC</th>
                  <th>運転後ALC</th>
                  <th>走行メーター</th>
                  <th>点検写真</th>
                  <th>ステータス</th>
                  <th>管理操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.date}
                      <span className="cell-sub">{reportCodes.get(r.id)}</span>
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
                      {r.alcoholSkipped ? (
                        <span className="pill pill-slate">パス（免除）</span>
                      ) : parseFloat(r.preAlcohol || '0') > 0 ? (
                        <span className="pill pill-red">{r.preAlcohol}mg/L</span>
                      ) : (
                        <span className="pill pill-green">0.00</span>
                      )}
                    </td>
                    <td>
                      {!r.postDone ? (
                        <button className="btn btn-sm" style={{ background: 'var(--amber-50, #fffbeb)', borderColor: 'var(--amber-100, #fde68a)', color: 'var(--amber-600)' }} onClick={() => openReturnCheckin(r)}>
                          帰着登録する
                        </button>
                      ) : parseFloat(r.postAlcohol || '0') > 0 ? (
                        <span className="pill pill-red">{r.postAlcohol}mg/L</span>
                      ) : (
                        <span className="pill pill-green">0.00</span>
                      )}
                    </td>
                    <td>{r.postDone ? `${r.startKm.toLocaleString()}→${r.endKm.toLocaleString()}km（${r.tripKm}km）` : `${r.startKm.toLocaleString()}km〜`}</td>
                    <td>
                      {r.inspectionPhoto ? (
                        <img src={r.inspectionPhoto} alt="点検写真" className="thumb-photo" onClick={() => window.open(r.inspectionPhoto, '_blank')} />
                      ) : (
                        <span style={{ color: 'var(--slate-400, #94a3b8)', fontSize: 11 }}>-</span>
                      )}
                    </td>
                    <td>
                      {r.postDone ? <span className="pill pill-green">帰着済</span> : <span className="pill pill-amber">出庫中</span>}
                      {r.maintRequest && (
                        <span
                          className={`pill ${r.maintRequestDone ? 'pill-green' : 'pill-red'} cell-sub-pill`}
                          title={`${r.maintRequestType || ''} / ${r.maintRequestNote || ''}`}
                        >
                          🔧 整備依頼
                          {r.maintRequestDone
                            ? '（対応済）'
                            : r.maintRequestUrgency && r.maintRequestUrgency !== '通常'
                            ? `（${r.maintRequestUrgency}）`
                            : ''}
                        </span>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-sm" onClick={() => openEdit(r)}>
                        {isAdmin ? '編集' : '🔒 編集'}
                      </button>{' '}
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r.id)}>
                        {isAdmin ? '削除' : '🔒 削除'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Modal
          tone="dark"
          title={returnMode ? `【帰着登録】${editing.driverLast} ${editing.driverFirst} / ${editing.vehicleName}` : editing.postDone ? '【帰着後】日報を編集' : editing.id ? '【運転前】出発登録を編集' : `【運転前】出発登録 & アルコール点呼（${editing.driverLast} ${editing.driverFirst}）`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? '保存中…' : returnMode ? '帰着を登録する' : editing.id ? '保存する' : '出発を登録する（運行開始）'}
              </button>
            </>
          }
        >
          {!returnMode && (
          <>
          <div className="field-row" style={{ marginBottom: 12 }}>
            <div className="field">
              <label>利用日 *</label>
              <input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
            </div>
            <div className="field">
              <label>事業部 *</label>
              <select value={editing.dept} onChange={(e) => setEditing({ ...editing, dept: e.target.value })}>
                {data.masters.departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-row-4" style={{ marginBottom: 12 }}>
            <div className="field">
              <label>使用車両 *</label>
              <select value={editing.vehicleId} onChange={(e) => selectVehicle(e.target.value)}>
                <option value="">選択してください</option>
                {data.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>行先</label>
              <input value={editing.destination} onChange={(e) => setEditing({ ...editing, destination: e.target.value })} />
            </div>
            <div className="field">
              <label>用件</label>
              <input value={editing.purpose} onChange={(e) => setEditing({ ...editing, purpose: e.target.value })} />
            </div>
          </div>

          <div className="section-heading-row">
            <div className="section-heading">●【運転前】アルコールチェック &amp; 簡易点検</div>
            <label className="checkbox-field">
              <input type="checkbox" checked={!!editing.alcoholSkipped} onChange={(e) => setEditing({ ...editing, alcoholSkipped: e.target.checked })} />
              アルコールチェックをパス（免除）
            </label>
          </div>
          <div className="field-row-4" style={{ marginBottom: 4 }}>
            <div className="field">
              <label>出発時刻</label>
              <input type="time" value={editing.preTime} onChange={(e) => setEditing({ ...editing, preTime: e.target.value })} />
            </div>
            <div className="field">
              <label>検知器測定値（mg/L）</label>
              <input
                type="number"
                step="0.01"
                value={editing.preAlcohol}
                disabled={!!editing.alcoholSkipped}
                onChange={(e) => setEditing({ ...editing, preAlcohol: e.target.value })}
              />
            </div>
            <div className="field">
              <label>確認方法</label>
              <select value={editing.preMethod} onChange={(e) => setEditing({ ...editing, preMethod: e.target.value })}>
                {data.masters.checkMethods.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>確認者</label>
              <select value={editing.preChecker} onChange={(e) => setEditing({ ...editing, preChecker: e.target.value })}>
                {data.masters.checkers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="check-row">
            <label className="checkbox-field">
              <input type="checkbox" checked={editing.tireOk} onChange={(e) => setEditing({ ...editing, tireOk: e.target.checked })} />
              タイヤ空気圧・外観キズ異常なし
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={editing.brakeOk} onChange={(e) => setEditing({ ...editing, brakeOk: e.target.checked })} />
              ブレーキ・ランプ点灯良好
            </label>
          </div>

          <div className="field">
            <label>出発時メーター（km） *</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="number"
                value={editing.startKm}
                onChange={(e) => setEditing({ ...editing, startKm: Number(e.target.value) })}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => triggerMeterCamera('startKm')}
                disabled={meterOcrRunning}
              >
                {meterOcrRunning && meterOcrTarget === 'startKm' ? '解析中…' : '📷 撮影して自動入力'}
              </button>
            </div>
          </div>
          <div className="field">
            <label>点検写真（任意）</label>
            {editing.inspectionPhoto ? (
              <div>
                <img src={editing.inspectionPhoto} alt="点検写真プレビュー" className="photo-preview" />
                <button type="button" className="btn btn-sm" onClick={() => setEditing({ ...editing, inspectionPhoto: '' })}>
                  写真を削除
                </button>
              </div>
            ) : (
              <div className="photo-drop" onClick={() => photoInputRef.current?.click()}>
                📷 タップして点検写真を撮影・アップロード
              </div>
            )}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => handlePhotoFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="field">
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={editing.postDone}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    postDone: e.target.checked,
                    postTime: e.target.checked ? editing.postTime || nowTimeStr() : editing.postTime,
                    postChecker: e.target.checked ? editing.postChecker || data.masters.checkers[0] || '' : editing.postChecker,
                    postMethod: e.target.checked ? editing.postMethod || data.masters.checkMethods[0] || '' : editing.postMethod,
                  })
                }
              />
              帰着情報（運転後）も同時に今すぐ一括入力する
            </label>
          </div>
          </>
          )}
          {editing.postDone && (
            <>
              <div className="section-heading">帰着後点呼</div>
              <div className="field-row-4">
                <div className="field">
                  <label>帰着時刻</label>
                  <input type="time" value={editing.postTime} onChange={(e) => setEditing({ ...editing, postTime: e.target.value })} />
                </div>
                <div className="field">
                  <label>アルコール濃度（mg/L）</label>
                  <input type="number" step="0.01" value={editing.postAlcohol} onChange={(e) => setEditing({ ...editing, postAlcohol: e.target.value })} />
                </div>
                <div className="field">
                  <label>確認方法</label>
                  <select value={editing.postMethod} onChange={(e) => setEditing({ ...editing, postMethod: e.target.value })}>
                    {data.masters.checkMethods.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>確認者</label>
                  <select value={editing.postChecker} onChange={(e) => setEditing({ ...editing, postChecker: e.target.value })}>
                    {data.masters.checkers.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>帰着時 走行距離（km）</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="number"
                    value={editing.endKm}
                    onChange={(e) => setEditing({ ...editing, endKm: Number(e.target.value) })}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => triggerMeterCamera('endKm')}
                    disabled={meterOcrRunning}
                  >
                    {meterOcrRunning && meterOcrTarget === 'endKm' ? '解析中…' : '📷 撮影して自動入力'}
                  </button>
                </div>
              </div>

              <div className="section-heading">整備依頼</div>
              <div className="field">
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={!!editing.maintRequest}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        maintRequest: e.target.checked,
                        maintRequestType: editing.maintRequestType || data.masters.maintTypes[0] || '',
                        maintRequestUrgency: editing.maintRequestUrgency || MAINT_URGENCIES[0],
                      })
                    }
                  />
                  この車両の整備を依頼する（不具合・点検・消耗品交換など）
                </label>
              </div>
              {editing.maintRequest && (
                <>
                  <div className="field-row-4">
                    <div className="field">
                      <label>整備種別</label>
                      <select value={editing.maintRequestType || ''} onChange={(e) => setEditing({ ...editing, maintRequestType: e.target.value })}>
                        {data.masters.maintTypes.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>緊急度</label>
                      <select value={editing.maintRequestUrgency || MAINT_URGENCIES[0]} onChange={(e) => setEditing({ ...editing, maintRequestUrgency: e.target.value })}>
                        {MAINT_URGENCIES.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label>依頼内容・症状</label>
                    <textarea
                      rows={2}
                      placeholder="例: ブレーキから異音がする / 警告灯が点灯した / オイル交換の時期"
                      value={editing.maintRequestNote || ''}
                      onChange={(e) => setEditing({ ...editing, maintRequestNote: e.target.value })}
                    />
                  </div>
                </>
              )}
            </>
          )}

          <input
            ref={meterPhotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              handleMeterPhotoFile(e.target.files?.[0] || null);
              e.target.value = '';
            }}
          />

          <div className="field">
            <label>特記事項</label>
            <textarea rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
          </div>
        </Modal>
      )}
    </div>
  );
}
