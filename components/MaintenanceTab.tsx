'use client';

import { useMemo, useState } from 'react';
import { AppData, MAINT_URGENCIES, MaintRecord, Report, Vehicle } from '@/lib/types';
import { canEditMaintRequest, openMaintRequests, todayStr } from '@/lib/utils';
import MaintRequestModal, { MaintRequestInput } from './MaintRequestModal';
import { downloadCsv, maintenanceToCsv } from '@/lib/csv';
import Modal from './Modal';

// 整備記録は各車両の maintHistory に保存されている。整備台帳はそれを全車両分まとめて
// 一覧・絞り込み・追加・編集・削除できる画面（データの持ち方は変えていない）。
type LedgerRow = MaintRecord & {
  vehicleId: string;
  vehicleName: string;
  plate: string;
  index: number; // 車両内の maintHistory の位置
};

type Editing = {
  vehicleId: string;
  index: number | null; // null は新規追加
  rec: MaintRecord;
  requestId?: string; // 整備依頼への対応として登録するとき、その日報のid
};

const yen = (n?: number) => (n === undefined || n === null || Number.isNaN(n) ? '-' : `${n.toLocaleString()} 円`);

export default function MaintenanceTab({
  data,
  onSave,
  onResolveRequest,
  onWatchRequest,
  mechanic,
  canEdit,
  currentDriverId,
  onEditRequest,
  onRequestMechanicLogin,
}: {
  data: AppData;
  onSave: (v: Vehicle) => Promise<unknown>;
  onResolveRequest: (reportId: string, done: boolean) => Promise<unknown>;
  onWatchRequest: (reportId: string, watch: boolean) => Promise<unknown>;
  // 整備士としてログイン中の名前（管理者だけのときは null）
  mechanic: string | null;
  // 記録の追加・修正・削除、依頼への対応ができるか（整備士または管理者のログイン）
  canEdit: boolean;
  // 依頼を出した本人が、自分の依頼を直せるように
  currentDriverId: string | null;
  onEditRequest: (id: string, r: MaintRequestInput) => Promise<unknown>;
  onRequestMechanicLogin: () => void;
}) {
  const [editingReq, setEditingReq] = useState<Report | null>(null);
  const [query, setQuery] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);

  const allRows = useMemo<LedgerRow[]>(() => {
    const rows: LedgerRow[] = [];
    data.vehicles.forEach((v) => {
      v.maintHistory.forEach((m, index) => {
        rows.push({ ...m, vehicleId: v.id, vehicleName: v.name, plate: v.plate, index });
      });
    });
    // 実施日の新しい順（同日は登録の新しい順＝車両内で先頭のもの）
    return rows.sort((a, b) => (a.date === b.date ? a.index - b.index : a.date < b.date ? 1 : -1));
  }, [data.vehicles]);

  // 既存記録で使われている種別も、マスタから外れていれば選択肢に残す
  const typeOptions = useMemo(() => {
    const set = new Set<string>(data.masters.maintTypes);
    allRows.forEach((r) => r.type && set.add(r.type));
    return Array.from(set);
  }, [data.masters.maintTypes, allRows]);

  const rows = useMemo(() => {
    const q = query.trim();
    return allRows.filter((r) => {
      if (vehicleFilter && r.vehicleId !== vehicleFilter) return false;
      if (typeFilter && r.type !== typeFilter) return false;
      if (q && !(r.note.includes(q) || (r.shop || '').includes(q) || r.type.includes(q) || r.vehicleName.includes(q) || r.plate.includes(q))) {
        return false;
      }
      return true;
    });
  }, [allRows, query, vehicleFilter, typeFilter]);

  const requests = useMemo(() => openMaintRequests(data.reports), [data.reports]);

  const totalCost = rows.reduce((sum, r) => sum + (r.cost || 0), 0);
  const thisYear = todayStr().slice(0, 4);
  const thisYearCount = rows.filter((r) => r.date.startsWith(thisYear)).length;

  function openNew() {
    if (!canEdit) return onRequestMechanicLogin();
    const v = data.vehicles.find((x) => x.id === vehicleFilter) || data.vehicles[0];
    setEditing({
      vehicleId: v?.id || '',
      index: null,
      rec: { date: todayStr(), type: '', km: v?.odometer || 0, note: '', cost: undefined, shop: '' },
    });
  }
  // 整備依頼を請けて、依頼の内容を引き継いだ整備記録の登録画面を開く
  function openFromRequest(r: Report) {
    if (!canEdit) return onRequestMechanicLogin();
    const v = data.vehicles.find((x) => x.id === r.vehicleId);
    if (!v) return;
    setEditing({
      vehicleId: v.id,
      index: null,
      requestId: r.id,
      rec: {
        date: todayStr(),
        type: typeOptions.includes(r.maintRequestType || '') ? (r.maintRequestType as string) : '',
        km: r.endKm || v.odometer || 0,
        note: `【依頼】${r.maintRequestNote || ''}（${r.driver} ${r.date}）`,
        cost: undefined,
        shop: '',
      },
    });
  }
  async function closeRequestWithoutRecord(r: Report) {
    if (!canEdit) return onRequestMechanicLogin();
    await onResolveRequest(r.id, true);
  }
  async function toggleWatch(r: Report) {
    if (!canEdit) return onRequestMechanicLogin();
    await onWatchRequest(r.id, !r.maintRequestWatch);
  }
  function openEdit(r: LedgerRow) {
    if (!canEdit) return onRequestMechanicLogin();
    setEditing({
      vehicleId: r.vehicleId,
      index: r.index,
      rec: { date: r.date, type: r.type, km: r.km, note: r.note, cost: r.cost, shop: r.shop || '', by: r.by },
    });
  }

  function changeVehicle(id: string) {
    if (!editing) return;
    const v = data.vehicles.find((x) => x.id === id);
    setEditing({ ...editing, vehicleId: id, rec: { ...editing.rec, km: editing.rec.km || v?.odometer || 0 } });
  }

  async function handleSubmit() {
    if (!editing) return;
    const v = data.vehicles.find((x) => x.id === editing.vehicleId);
    if (!v) {
      alert('車両を選択してください。');
      return;
    }
    if (!editing.rec.type) {
      alert('整備種別を選択してください。');
      return;
    }
    if (!editing.rec.date) {
      alert('実施日を入力してください。');
      return;
    }
    const rec: MaintRecord = {
      date: editing.rec.date,
      type: editing.rec.type,
      km: Number(editing.rec.km) || v.odometer,
      note: editing.rec.note || '',
    };
    if (editing.rec.cost !== undefined && !Number.isNaN(editing.rec.cost)) rec.cost = editing.rec.cost;
    if (editing.rec.shop) rec.shop = editing.rec.shop;
    // 記録した整備士。整備士としてログイン中ならその名前、編集のときは元の記録の名前を引き継ぐ
    const by = mechanic || editing.rec.by || (canEdit ? '管理者' : '');
    if (by) rec.by = by;

    const list = [...v.maintHistory];
    if (editing.index === null) list.unshift(rec);
    else list[editing.index] = rec;

    setSaving(true);
    try {
      await onSave({ ...v, maintHistory: list });
      if (editing.requestId) await onResolveRequest(editing.requestId, true);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r: LedgerRow) {
    if (!canEdit) return onRequestMechanicLogin();
    if (!confirm(`${r.date} ${r.vehicleName} の「${r.type}」を削除しますか？`)) return;
    const v = data.vehicles.find((x) => x.id === r.vehicleId);
    if (!v) return;
    const list = [...v.maintHistory];
    list.splice(r.index, 1);
    await onSave({ ...v, maintHistory: list });
  }

  function exportCsv() {
    downloadCsv(`整備台帳_${todayStr()}.csv`, maintenanceToCsv(rows));
  }

  const filtering = Boolean(query.trim() || vehicleFilter || typeFilter);

  return (
    <div>
      {requests.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 className="card-title">
            🛠 整備依頼（対応待ち）<span className="pill pill-red" style={{ marginLeft: 8 }}>{requests.length}件</span>
          </h3>
          <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 8 }}>
            帰着登録やダッシュボードで受け付けた依頼です。整備を実施したら「整備記録として登録」で台帳に残すと、対応済になります。記録を残さず閉じるときは「完了」、しばらく様子を見るときは「経過観察」を押します。
          </div>
          <div className="alert-list">
            {requests.map((r) => {
              const urgent = r.maintRequestUrgency === MAINT_URGENCIES[2];
              const vehicleExists = data.vehicles.some((v) => v.id === r.vehicleId);
              return (
                <div key={r.id} className={`alert-item ${urgent ? 'danger' : 'warn'}`}>
                  <span>🔧</span>
                  <div style={{ flex: 1 }}>
                    <strong>{r.vehicleName}</strong>
                    {r.plate ? `（${r.plate}）` : ''}— {r.maintRequestType || '整備'}
                    {r.maintRequestWatch && (
                      <span className="pill pill-sky" style={{ marginLeft: 6 }}>
                        👀 経過観察中{r.maintRequestWatchAt ? `（${r.maintRequestWatchAt}〜）` : ''}
                      </span>
                    )}
                    {r.maintRequestUrgency && r.maintRequestUrgency !== MAINT_URGENCIES[0] && (
                      <span className={`pill ${urgent ? 'pill-red' : 'pill-amber'}`} style={{ marginLeft: 6 }}>
                        {r.maintRequestUrgency}
                      </span>
                    )}
                    <div style={{ fontSize: 12, marginTop: 2 }}>
                      {r.maintRequestNote}　依頼: {r.date} {r.driver}
                      {!vehicleExists && '（車両は台帳から削除済み）'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {canEditMaintRequest(r, { driverId: currentDriverId, mechanic: canEdit ? mechanic || '管理者' : null, isAdmin: canEdit && !mechanic }) && (
                      <button className="btn btn-sm" onClick={() => setEditingReq(r)}>
                        ✏️ 編集
                      </button>
                    )}
                    <button className="btn btn-sm btn-primary" onClick={() => openFromRequest(r)} disabled={!vehicleExists}>
                      整備記録として登録
                    </button>
                    <button className="btn btn-sm" onClick={() => toggleWatch(r)}>
                      {r.maintRequestWatch ? '経過観察を解除' : '👀 経過観察'}
                    </button>
                    <button className="btn btn-sm" onClick={() => closeRequestWithoutRecord(r)}>
                      ✓ 完了
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <div className="toolbar2">
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}>
              🔧 整備台帳 <span className="pill pill-slate">全車両の整備記録</span>
            </h3>
            <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
              車両ごとの点検・整備・オイル交換などの記録を、実施日の新しい順にまとめて確認できます。
            </div>
          </div>
          <div className="actions">
            <input
              className="search"
              placeholder="備考・実施先で検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid var(--slate-300)', borderRadius: 8, minWidth: 160 }}
            />
            <select
              aria-label="車両で絞り込み"
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid var(--slate-300)', borderRadius: 8 }}
            >
              <option value="">すべての車両</option>
              {data.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <select
              aria-label="整備種別で絞り込み"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid var(--slate-300)', borderRadius: 8 }}
            >
              <option value="">すべての種別</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button className="btn btn-sm" onClick={exportCsv} disabled={rows.length === 0}>
              ⬇ 整備台帳CSV出力
            </button>
            <button className="btn btn-primary btn-sm" onClick={openNew} disabled={data.vehicles.length === 0}>
              {canEdit ? '' : '🔒 '}
              ＋ 整備記録を追加
            </button>
          </div>
        </div>

        {!canEdit && (
          <div className="alert-item warn" style={{ margin: '4px 0 12px' }}>
            <span>🔧</span>
            <div style={{ flex: 1 }}>整備記録の追加・修正・削除と、整備依頼への対応は、整備士としてログインすると行えます。</div>
            <button className="btn btn-sm btn-primary" onClick={onRequestMechanicLogin}>
              整備士としてログイン
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--slate-600)', margin: '4px 0 12px' }}>
          <span>
            {filtering ? `表示 ${rows.length}件 / 全${allRows.length}件` : `全${allRows.length}件`}
          </span>
          <span>今年の実施 {thisYearCount}件</span>
          <span>費用合計 {totalCost.toLocaleString()} 円</span>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">
            {allRows.length === 0 ? '整備記録はまだありません。「整備記録を追加」から登録できます。' : '条件に合う整備記録がありません'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>実施日</th>
                  <th>車両</th>
                  <th>整備種別</th>
                  <th>走行km</th>
                  <th>費用</th>
                  <th>実施先</th>
                  <th>整備士</th>
                  <th>備考</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.vehicleId}-${r.index}`}>
                    <td>{r.date}</td>
                    <td>
                      {r.vehicleName}
                      <div style={{ fontSize: 11, color: 'var(--slate-500)' }}>{r.plate}</div>
                    </td>
                    <td>
                      <span className="pill pill-slate">{r.type}</span>
                    </td>
                    <td>{r.km.toLocaleString()}</td>
                    <td>{yen(r.cost)}</td>
                    <td>{r.shop || '-'}</td>
                    <td>{r.by || '-'}</td>
                    <td>{r.note}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm" onClick={() => openEdit(r)}>
                        {canEdit ? '' : '🔒 '}編集
                      </button>{' '}
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r)}>
                        {canEdit ? '' : '🔒 '}削除
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
          title={editing.requestId ? '整備依頼への対応を記録' : editing.index === null ? '整備記録を追加' : '整備記録を編集'}
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
              <label>車両 *</label>
              <select value={editing.vehicleId} disabled={editing.index !== null} onChange={(e) => changeVehicle(e.target.value)}>
                {data.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}（{v.plate}）
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>実施日 *</label>
              <input type="date" value={editing.rec.date} onChange={(e) => setEditing({ ...editing, rec: { ...editing.rec, date: e.target.value } })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>整備種別 *</label>
              <select value={editing.rec.type} onChange={(e) => setEditing({ ...editing, rec: { ...editing.rec, type: e.target.value } })}>
                <option value="">選択</option>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>走行km</label>
              <input
                type="number"
                value={editing.rec.km || ''}
                onChange={(e) => setEditing({ ...editing, rec: { ...editing.rec, km: Number(e.target.value) } })}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>費用（円）</label>
              <input
                type="number"
                min={0}
                value={editing.rec.cost ?? ''}
                onChange={(e) =>
                  setEditing({ ...editing, rec: { ...editing.rec, cost: e.target.value === '' ? undefined : Number(e.target.value) } })
                }
              />
            </div>
            <div className="field">
              <label>実施先</label>
              <input
                placeholder="例: ○○自動車、ディーラー名"
                value={editing.rec.shop || ''}
                onChange={(e) => setEditing({ ...editing, rec: { ...editing.rec, shop: e.target.value } })}
              />
            </div>
          </div>
          <div className="field">
            <label>備考</label>
            <input value={editing.rec.note} onChange={(e) => setEditing({ ...editing, rec: { ...editing.rec, note: e.target.value } })} />
          </div>
        </Modal>
      )}
      {editingReq && (
        <MaintRequestModal
          data={data}
          editing={editingReq}
          onClose={() => setEditingReq(null)}
          onSubmit={(input) => onEditRequest(editingReq.id, input)}
        />
      )}
    </div>
  );
}
