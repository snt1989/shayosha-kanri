'use client';

import { useMemo, useState } from 'react';
import { AppData, Driver, FuelLog } from '@/lib/types';
import { todayStr } from '@/lib/utils';
import { computeEfficiency } from '@/lib/fuel';
import { downloadCsv, fuelLogsToCsv } from '@/lib/csv';
import Modal from './Modal';

const yen = (n: number) => `${n.toLocaleString()} 円`;
const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toLocaleString();

export default function FuelTab({
  data,
  currentDriver,
  onRequestDriverLogin,
  isAdmin,
  onRequestAdminLogin,
  onSave,
  onDelete,
}: {
  data: AppData;
  currentDriver: Driver | null;
  onRequestDriverLogin: () => void;
  isAdmin: boolean;
  onRequestAdminLogin: () => void;
  onSave: (f: FuelLog) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}) {
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [query, setQuery] = useState('');
  const [rec, setRec] = useState<FuelLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const efficiency = useMemo(() => computeEfficiency(data.fuelLogs), [data.fuelLogs]);
  const all = useMemo(
    () => [...data.fuelLogs].sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km || b.createdAt.localeCompare(a.createdAt)),
    [data.fuelLogs]
  );
  const months = useMemo(() => Array.from(new Set(all.map((f) => f.date.slice(0, 7)))), [all]);
  const rows = useMemo(() => {
    const q = query.trim();
    return all.filter((f) => {
      if (vehicleFilter && f.vehicleId !== vehicleFilter) return false;
      if (monthFilter && !f.date.startsWith(monthFilter)) return false;
      if (q && ![f.vehicleName, f.plate, f.driver, f.note, f.fuelType].some((s) => (s || '').includes(q))) return false;
      return true;
    });
  }, [all, vehicleFilter, monthFilter, query]);

  const totalLiters = rows.reduce((s, f) => s + f.liters, 0);
  const totalAmount = rows.reduce((s, f) => s + f.amount, 0);
  const effValues = rows.map((f) => efficiency.get(f.id)).filter((v): v is number => typeof v === 'number');
  const avgEff = effValues.length ? effValues.reduce((s, v) => s + v, 0) / effValues.length : null;

  function newRec(): FuelLog {
    const v = data.vehicles.find((x) => x.id === vehicleFilter) || data.vehicles.find((x) => x.id === all[0]?.vehicleId) || data.vehicles[0];
    const last = all.find((f) => f.vehicleId === v?.id);
    return {
      id: '',
      date: todayStr(),
      vehicleId: v?.id || '',
      vehicleName: v?.name || '',
      plate: v?.plate || '',
      fuelType: last?.fuelType || data.masters.fuelTypes[0] || '',
      liters: 0,
      amount: 0,
      km: v?.odometer || 0,
      full: true,
      payMethod: last?.payMethod || data.masters.payMethods[0] || '',
      driverId: currentDriver?.id,
      driver: currentDriver ? `${currentDriver.lastName} ${currentDriver.firstName}` : '',
      note: '',
      createdAt: '',
    };
  }
  function openNew() {
    if (!currentDriver) return onRequestDriverLogin();
    setError('');
    setRec(newRec());
  }
  function openEdit(f: FuelLog) {
    if (!isAdmin) return onRequestAdminLogin();
    setError('');
    setRec({ ...f });
  }
  async function remove(f: FuelLog) {
    if (!isAdmin) return onRequestAdminLogin();
    if (!confirm(`${f.date} ${f.vehicleName} の給油記録（${f.liters}L / ${yen(f.amount)}）を削除しますか？`)) return;
    await onDelete(f.id);
  }
  function changeVehicle(id: string) {
    if (!rec) return;
    const v = data.vehicles.find((x) => x.id === id);
    const last = all.find((f) => f.vehicleId === id);
    setRec({
      ...rec,
      vehicleId: id,
      vehicleName: v?.name || rec.vehicleName,
      plate: v?.plate || rec.plate,
      km: rec.id ? rec.km : v?.odometer || 0,
      fuelType: rec.id ? rec.fuelType : last?.fuelType || rec.fuelType,
    });
  }
  async function submit() {
    if (!rec) return;
    if (!rec.vehicleId) return setError('車両を選んでください。');
    if (!rec.date) return setError('給油日を入力してください。');
    if (!(rec.liters > 0)) return setError('給油量（L）を入力してください。');
    if (!rec.driver) return setError('運転者としてログインしてください。');
    // メーターが同じ車両の直前の記録より戻っていたら、入力ミスの可能性があるので止める
    const prev = all.filter((f) => f.vehicleId === rec.vehicleId && f.id !== rec.id && f.date <= rec.date).sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km)[0];
    if (rec.km > 0 && prev && prev.km > 0 && rec.km < prev.km) {
      return setError(`走行kmが、前回の給油（${prev.date}・${prev.km.toLocaleString()}km）より小さくなっています。確認してください。`);
    }
    setSaving(true);
    setError('');
    try {
      await onSave(rec);
      setRec(null);
    } catch (e) {
      setError((e as Error)?.message || '保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof FuelLog>(k: K, v: FuelLog[K]) => rec && setRec({ ...rec, [k]: v });
  const numIn = (v: string) => (v === '' ? 0 : Math.max(0, Number(v) || 0));
  const unit = rec && rec.liters > 0 && rec.amount > 0 ? rec.amount / rec.liters : null;
  const selectStyle = { padding: '8px 10px', border: '1px solid var(--slate-300)', borderRadius: 8 } as const;

  return (
    <div>
      <div className="card">
        <div className="toolbar2">
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}>
              ⛽ 給油台帳
            </h3>
            <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
              車両ごとの給油量・金額・メーターを記録し、燃費（満タン法）と費用を確認できます。
            </div>
          </div>
          <div className="actions">
            <input
              className="search"
              placeholder="車両・給油者などで検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid var(--slate-300)', borderRadius: 8, minWidth: 170 }}
            />
            <button className="btn btn-sm" onClick={() => downloadCsv(`給油台帳_${todayStr()}.csv`, fuelLogsToCsv(rows, efficiency))} disabled={rows.length === 0}>
              ⬇ CSV出力
            </button>
            <button className="btn btn-primary btn-sm" onClick={openNew} disabled={data.vehicles.length === 0}>
              ＋ 給油を記録
            </button>
          </div>
        </div>

        {!currentDriver && (
          <div className="alert-item warn" style={{ margin: '10px 0' }}>
            <span>🪪</span>
            <div style={{ flex: 1 }}>給油の記録をするには、先に運転者としてログインしてください。</div>
            <button className="btn btn-sm btn-primary" onClick={onRequestDriverLogin}>
              運転者としてログイン
            </button>
          </div>
        )}

        <div className="filter-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '12px 0' }}>
          <select aria-label="車両で絞り込み" value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} style={selectStyle}>
            <option value="">すべての車両</option>
            {data.vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <select aria-label="月で絞り込み" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} style={selectStyle}>
            <option value="">すべての期間</option>
            {months.map((m) => (
              <option key={m} value={m}>{m.replace('-', '年')}月</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <span className="pill pill-slate">{rows.length}件</span>
          <span className="pill pill-slate">給油量 {oneDecimal(totalLiters)} L</span>
          <span className="pill pill-green">費用合計 {yen(totalAmount)}</span>
          <span className="pill pill-slate">平均単価 {totalLiters > 0 ? `${oneDecimal(totalAmount / totalLiters)} 円/L` : '-'}</span>
          <span className="pill pill-amber">平均燃費 {avgEff === null ? '-' : `${oneDecimal(avgEff)} km/L`}</span>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">給油の記録はありません。「＋ 給油を記録」から登録できます。</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table fuel-table">
              <thead>
                <tr>
                  <th>給油日</th>
                  <th>車両</th>
                  <th>燃料</th>
                  <th>給油量</th>
                  <th>金額</th>
                  <th>単価</th>
                  <th>走行km</th>
                  <th>燃費</th>
                  <th>給油者</th>
                  <th>備考</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const eff = efficiency.get(f.id);
                  return (
                    <tr key={f.id}>
                      <td>{f.date}</td>
                      <td>
                        {f.vehicleName}
                        <span className="cell-sub">{f.plate}</span>
                      </td>
                      <td>
                        {f.fuelType || '-'}
                        {f.payMethod && <span className="cell-sub">{f.payMethod}</span>}
                      </td>
                      <td>
                        {oneDecimal(f.liters)} L{f.full && <span className="pill pill-green cell-sub-pill">満タン</span>}
                      </td>
                      <td>{yen(f.amount)}</td>
                      <td>{f.liters > 0 && f.amount > 0 ? `${oneDecimal(f.amount / f.liters)} 円/L` : '-'}</td>
                      <td>{f.km > 0 ? f.km.toLocaleString() : '-'}</td>
                      <td>{typeof eff === 'number' ? `${oneDecimal(eff)} km/L` : '-'}</td>
                      <td>{f.driver}</td>
                      <td className={f.note ? undefined : 'cell-empty'}>{f.note || '-'}</td>
                      <td>
                        <div className="eactions">
                          <button className="btn btn-sm" onClick={() => openEdit(f)} title={isAdmin ? '' : '管理者ログインが必要です'}>
                            {isAdmin ? '' : '🔒 '}編集
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => remove(f)} title={isAdmin ? '' : '管理者ログインが必要です'}>
                            {isAdmin ? '' : '🔒 '}削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--slate-400)', marginTop: 8 }}>
          燃費は「満タン給油」を基準に、前回の満タン給油からの走行距離 ÷ その間の給油量で計算します（最初の満タン給油は基準のため「-」）。
        </div>
      </div>

      {rec && (
        <Modal
          wide
          title={rec.id ? '給油記録を編集' : '⛽ 給油を記録'}
          onClose={() => setRec(null)}
          footer={
            <>
              <button className="btn" onClick={() => setRec(null)}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={submit} disabled={saving}>
                {saving ? '保存中…' : '登録する'}
              </button>
            </>
          }
        >
          {error && (
            <div className="alert-item warn" style={{ marginBottom: 10 }}>
              {error}
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--slate-600)', marginBottom: 10 }}>
            給油者: <b>{rec.driver || '-'}</b>
          </div>
          <div className="field-row">
            <div className="field">
              <label>車両</label>
              <select value={rec.vehicleId} onChange={(e) => changeVehicle(e.target.value)}>
                {data.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}（{v.plate}）
                  </option>
                ))}
                {!data.vehicles.some((v) => v.id === rec.vehicleId) && rec.vehicleId && <option value={rec.vehicleId}>{rec.vehicleName}（台帳から削除済み）</option>}
              </select>
            </div>
            <div className="field">
              <label>給油日</label>
              <input type="date" value={rec.date} onChange={(e) => set('date', e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>燃料</label>
              <select value={rec.fuelType} onChange={(e) => set('fuelType', e.target.value)}>
                {Array.from(new Set([...data.masters.fuelTypes, rec.fuelType].filter(Boolean))).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>支払方法</label>
              <select value={rec.payMethod} onChange={(e) => set('payMethod', e.target.value)}>
                {Array.from(new Set([...data.masters.payMethods, rec.payMethod].filter(Boolean))).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>給油量（L）</label>
              <input type="number" min={0} step="0.01" value={rec.liters || ''} onChange={(e) => set('liters', numIn(e.target.value))} />
            </div>
            <div className="field">
              <label>金額（円）{unit !== null && ` ／ 単価 ${oneDecimal(unit)} 円/L`}</label>
              <input type="number" min={0} value={rec.amount || ''} onChange={(e) => set('amount', numIn(e.target.value))} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>給油時のメーター（km）</label>
              <input type="number" min={0} value={rec.km || ''} onChange={(e) => set('km', numIn(e.target.value))} />
            </div>
            <div className="field">
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 24 }}>
                <input type="checkbox" checked={rec.full} onChange={(e) => set('full', e.target.checked)} style={{ width: 'auto' }} />
                満タンまで給油した（燃費の計算に使います）
              </label>
            </div>
          </div>
          <div className="field">
            <label>備考</label>
            <input value={rec.note} onChange={(e) => set('note', e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
