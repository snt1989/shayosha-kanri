'use client';

import { useMemo, useState } from 'react';
import { AppData, Driver, Rental, RentalTrip } from '@/lib/types';
import { rentalReservations, reservationRange, todayStr } from '@/lib/utils';
import { downloadCsv, rentalsToCsv } from '@/lib/csv';
import Modal from './Modal';
import { useMobileLimit } from '@/lib/useLimit';
import RentalTripsPanel from './RentalTripsPanel';

const yen = (n?: number) => (n ? `${n.toLocaleString()} 円` : '-');

const emptyRental = (data: AppData, d: Driver | null): Rental => ({
  id: '',
  company: data.masters.rentalCompanies[0] || '',
  carClass: data.masters.rentalCarClasses[0] || '',
  carModel: '',
  plate: '',
  reservationNo: '',
  driverId: d?.id,
  driver: d ? `${d.lastName} ${d.firstName}` : '',
  dept: d?.dept || '',
  startDate: todayStr(),
  endDate: todayStr(),
  cost: 0,
  notes: '',
  createdAt: '',
});

export default function RentalTab({
  data,
  currentDriver,
  onRequestDriverLogin,
  onSave,
  onDelete,
  onReturn,
  onCancelReturn,
  isAdmin,
  onRequestAdminLogin,
  onSaveTrip,
  onDeleteTrip,
}: {
  data: AppData;
  currentDriver: Driver | null;
  onRequestDriverLogin: () => void;
  onSave: (r: Rental) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onReturn: (id: string, info: { date: string; time: string; by: string; byId?: string }) => Promise<unknown>;
  onCancelReturn: (id: string) => Promise<unknown>;
  isAdmin: boolean;
  onRequestAdminLogin: () => void;
  onSaveTrip: (t: RentalTrip) => Promise<unknown>;
  onDeleteTrip: (id: string) => Promise<unknown>;
}) {
  const [view, setView] = useState<'rentals' | 'trips'>('rentals');
  const [tripRentalId, setTripRentalId] = useState('');
  const [query, setQuery] = useState('');
  const [rec, setRec] = useState<Rental | null>(null);
  const [saving, setSaving] = useState(false);
  const [ret, setRet] = useState<{ rental: Rental; date: string; time: string; pick: string; by: string } | null>(null);
  const [returnError, setReturnError] = useState('');
  const [error, setError] = useState('');

  const today = todayStr();
  const month = today.slice(0, 7);
  const all = useMemo(
    () => [...data.rentals].sort((a, b) => (b.startDate + b.createdAt).localeCompare(a.startDate + a.createdAt)),
    [data.rentals]
  );
  const rows = useMemo(() => {
    const q = query.trim();
    if (!q) return all;
    return all.filter((r) =>
      [r.driver, r.company, r.carModel, r.plate, r.reservationNo].some((s) => (s || '').includes(q))
    );
  }, [all, query]);
  const monthRows = all.filter((r) => r.startDate.startsWith(month));
  const monthCost = monthRows.reduce((s, r) => s + (r.cost || 0), 0);

  function guard(fn: () => void) {
    if (!currentDriver) return onRequestDriverLogin();
    fn();
  }
  // 編集・削除は管理者ログイン後に操作できる。未ログインなら管理者ログインを開く
  function adminOnly(fn: () => void) {
    if (!isAdmin) return onRequestAdminLogin();
    fn();
  }
  // 返却の入力画面（返却者・返却日・返却時刻）
  function openReturn(r: Rental) {
    guard(() => {
      setReturnError('');
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      setRet({
        rental: r,
        date: date < r.startDate ? r.startDate : date,
        time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
        pick: currentDriver!.id,
        by: `${currentDriver!.lastName} ${currentDriver!.firstName}`,
      });
    });
  }
  async function submitReturn() {
    if (!ret) return;
    if (!ret.by.trim()) return setReturnError('返却者を選ぶか、名前を入力してください。');
    if (!ret.date) return setReturnError('返却日を入力してください。');
    if (ret.date < ret.rental.startDate) return setReturnError('返却日は利用開始日以降にしてください。');
    if (!ret.time) return setReturnError('返却時刻を入力してください。');
    setSaving(true);
    setReturnError('');
    try {
      await onReturn(ret.rental.id, { date: ret.date, time: ret.time, by: ret.by.trim(), byId: ret.pick && ret.pick !== '__other__' ? ret.pick : undefined });
      setRet(null);
    } catch (e) {
      setReturnError((e as Error)?.message || '返却を記録できませんでした。');
    } finally {
      setSaving(false);
    }
  }
  async function cancelReturn(r: Rental) {
    if (!currentDriver) return onRequestDriverLogin();
    if (!confirm(`${r.company} ${r.carModel || ''} の返却（${r.returnedAt} ${r.returnedTime || ''} ${r.returnedBy || ''}）を取り消して、利用中に戻しますか？`)) return;
    try {
      await onCancelReturn(r.id);
    } catch (e) {
      alert((e as Error)?.message || '取り消せませんでした。');
    }
  }
  function openNew() {
    guard(() => {
      setError('');
      setRec(emptyRental(data, currentDriver));
    });
  }
  function openEdit(r: Rental) {
    guard(() => {
      setError('');
      setRec({ ...r });
    });
  }
  async function remove(r: Rental) {
    if (!currentDriver) return onRequestDriverLogin();
    const n = tripCount(r.id);
    if (!confirm(`${r.startDate} ${r.company} のレンタカー記録を削除しますか？${n ? `\n（運行記録${n}件も一緒に削除されます）` : ''}`)) return;
    await onDelete(r.id);
  }

  async function submit() {
    if (!rec) return;
    if (!rec.company) return setError('レンタカー会社を選んでください。');
    if (!rec.startDate) return setError('利用開始日を入力してください。');
    if (rec.endDate && rec.endDate < rec.startDate) return setError('返却日は利用開始日以降にしてください。');
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

  const set = <K extends keyof Rental>(k: K, v: Rental[K]) => rec && setRec({ ...rec, [k]: v });
  const numIn = (v: string) => (v === '' ? 0 : Math.max(0, Number(v) || 0));
  const tripCount = (id: string) => data.rentalTrips.filter((t) => t.rentalId === id).length;

  const lim = useMobileLimit(rows, 3, query);

  if (view === 'trips') {
    return (
      <RentalTripsPanel
        data={data}
        currentDriver={currentDriver}
        onRequestDriverLogin={onRequestDriverLogin}
        onSave={onSaveTrip}
        onDelete={onDeleteTrip}
        isAdmin={isAdmin}
        onRequestAdminLogin={onRequestAdminLogin}
        rentalId={tripRentalId}
        onRentalIdChange={setTripRentalId}
        onBack={() => setView('rentals')}
      />
    );
  }

  return (
    <div>
      <div className="card">
        <div className="toolbar2">
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}>
              🚗 レンタカー登録 <span className="pill pill-slate">社用車とは別管理</span>
            </h3>
            <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
              借りたレンタカーと料金を登録します。登録したレンタカーを押すと、運転した人を記録する「運行記録」の入力画面に切り替わります。
            </div>
          </div>
          <div className="actions">
            <input
              className="search"
              placeholder="運転者・会社・車種などで検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid var(--slate-300)', borderRadius: 8, minWidth: 180 }}
            />
            <button className="btn btn-sm" onClick={() => downloadCsv(`レンタカー記録_${todayStr()}.csv`, rentalsToCsv(all))} disabled={all.length === 0}>
              ⬇ CSV出力
            </button>
            <button className="btn btn-primary btn-sm" onClick={openNew}>
              ＋ レンタカーを登録
            </button>
          </div>
        </div>

        {!currentDriver && (
          <div className="alert-item warn" style={{ margin: '10px 0' }}>
            <span>🪪</span>
            <div style={{ flex: 1 }}>レンタカーの登録・変更をするには、先に運転者としてログインしてください。</div>
            <button className="btn btn-sm btn-primary" onClick={onRequestDriverLogin}>
              運転者としてログイン
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '12px 0' }}>
          <span className="pill pill-slate">全{all.length}件</span>
          <span className="pill pill-green">今月 {monthRows.length}件 ／ 料金合計 {monthCost.toLocaleString()} 円</span>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">レンタカーの記録はありません</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table rental-table">
              <thead>
                <tr>
                  <th>利用期間</th>
                  <th>レンタカー</th>
                  <th>登録者</th>
                  <th>料金</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {lim.shown.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => {
                      setTripRentalId(r.id);
                      setView('trips');
                    }}
                    style={{ cursor: 'pointer' }}
                    title="押すと、このレンタカーの運行記録の入力画面に切り替わります"
                  >
                    <td>
                      {r.startDate}
                      {r.endDate !== r.startDate && <span className="cell-sub">〜 {r.endDate}</span>}
                    </td>
                    <td>
                      {r.company}
                      <span className="cell-sub">{[r.carClass, r.carModel, r.plate].filter(Boolean).join(' / ') || '-'}</span>
                      {r.reservationNo && <span className="cell-sub">予約番号 {r.reservationNo}</span>}
                      {rentalReservations(data.reservations, r.id, today).map((v) => (
                        <span key={v.id} className="cell-sub" style={{ color: 'var(--sky-700, #0369a1)' }}>
                          📅 予約 {reservationRange(v)} {v.driver}
                          {v.destination ? `（${v.destination}）` : ''}
                        </span>
                      ))}
                      {r.returnedAt ? (
                        <span className="pill pill-green cell-sub-pill">
                          返却済 {r.returnedAt.slice(5).replace('-', '/')} {r.returnedTime || ''}
                          {r.returnedBy ? `　${r.returnedBy}` : ''}
                        </span>
                      ) : (
                        <span className="pill pill-amber cell-sub-pill">{r.startDate > today ? '利用前' : '利用中'}</span>
                      )}
                    </td>
                    <td>
                      {r.driver}
                      <span className="cell-sub">{r.dept}</span>
                    </td>
                    <td>
                      {yen(r.cost)}
                    </td>
                    <td>
                      <div className="eactions" onClick={(e) => e.stopPropagation()}>
                        {r.returnedAt ? (
                          <button className="btn btn-sm" onClick={() => cancelReturn(r)}>
                            ↩️ 返却を取り消し
                          </button>
                        ) : (
                          <button className="btn btn-sm btn-primary" onClick={() => openReturn(r)}>
                            ↩️ 返却
                          </button>
                        )}
                        <button className="btn btn-sm" onClick={() => adminOnly(() => openEdit(r))} title={isAdmin ? '' : '管理者ログインが必要です'}>
                          {isAdmin ? '' : '🔒 '}編集
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => adminOnly(() => remove(r))} title={isAdmin ? '' : '管理者ログインが必要です'}>
                          {isAdmin ? '' : '🔒 '}削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lim.more}
      </div>

      {ret && (
        <Modal
          title="↩️ レンタカーの返却"
          onClose={() => setRet(null)}
          footer={
            <>
              <button className="btn" onClick={() => setRet(null)}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={submitReturn} disabled={saving}>
                {saving ? '保存中…' : '返却済にする'}
              </button>
            </>
          }
        >
          {returnError && (
            <div className="alert-item warn" style={{ marginBottom: 10 }}>
              {returnError}
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--slate-600)', marginBottom: 10 }}>
            <b>{ret.rental.company}</b> {[ret.rental.carClass, ret.rental.carModel, ret.rental.plate].filter(Boolean).join(' / ')}　{ret.rental.startDate}〜{ret.rental.endDate}
          </div>
          {(() => {
            const n = data.reservations.filter((x) => x.rentalId === ret.rental.id && x.startDate > ret.date).length;
            return n > 0 ? (
              <div className="alert-item warn" style={{ marginBottom: 10 }}>
                返却日より後の予約 {n}件 は、返却すると取り消されます。
              </div>
            ) : null;
          })()}
          <div className="field-row">
            <div className="field">
              <label>返却日</label>
              <input type="date" value={ret.date} onChange={(e) => setRet({ ...ret, date: e.target.value })} />
            </div>
            <div className="field">
              <label>返却時刻</label>
              <input type="time" value={ret.time} onChange={(e) => setRet({ ...ret, time: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>返却者</label>
            <select
              value={ret.pick}
              onChange={(e) => {
                const v = e.target.value;
                const d = data.drivers.find((x) => x.id === v);
                setRet({ ...ret, pick: v, by: d ? `${d.lastName} ${d.firstName}` : '' });
              }}
            >
              {data.drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.lastName} {d.firstName}
                </option>
              ))}
              <option value="__other__">その他（台帳にない人）</option>
            </select>
          </div>
          {ret.pick === '__other__' && (
            <div className="field">
              <label>返却者の名前</label>
              <input value={ret.by} placeholder="例: ○○商事 佐藤" onChange={(e) => setRet({ ...ret, by: e.target.value })} />
            </div>
          )}
        </Modal>
      )}

      {rec && (
        <Modal
          wide
          title={rec.id ? 'レンタカー記録を編集' : 'レンタカーを登録'}
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
          {error && <div className="alert-item warn" style={{ marginBottom: 10 }}>{error}</div>}
          <div style={{ fontSize: 13, color: 'var(--slate-600)', marginBottom: 10 }}>
            登録者: <b>{rec.driver || '-'}</b>
            {rec.dept && `（${rec.dept}）`}
          </div>

          <div className="section-heading">レンタカー</div>
          <div className="field-row">
            <div className="field">
              <label>レンタカー会社</label>
              <select value={rec.company} onChange={(e) => set('company', e.target.value)}>
                {Array.from(new Set([...data.masters.rentalCompanies, rec.company].filter(Boolean))).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>予約番号（控えがあれば）</label>
              <input value={rec.reservationNo} onChange={(e) => set('reservationNo', e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>車種クラス</label>
              <select value={rec.carClass} onChange={(e) => set('carClass', e.target.value)}>
                {Array.from(new Set([...data.masters.rentalCarClasses, rec.carClass].filter(Boolean))).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>車種（任意）</label>
              <input value={rec.carModel} placeholder="例: ヤリス" onChange={(e) => set('carModel', e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>ナンバー</label>
              <input value={rec.plate} placeholder="例: 仙台 500 あ 1-23" onChange={(e) => set('plate', e.target.value)} />
            </div>
            <div className="field">
              <label>料金（円）</label>
              <input type="number" min={0} value={rec.cost || ''} onChange={(e) => set('cost', numIn(e.target.value))} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>利用開始日</label>
              <input type="date" value={rec.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </div>
            <div className="field">
              <label>返却日</label>
              <input type="date" value={rec.endDate} onChange={(e) => set('endDate', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>備考</label>
            <textarea rows={2} value={rec.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
