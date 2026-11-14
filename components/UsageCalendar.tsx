'use client';

import { useMemo, useState } from 'react';
import type { MaintBlock } from '@/lib/utils';
import { AppData, Driver, Rental, Report, Reservation } from '@/lib/types';
import { maintBlocks, rentalReservations, reservationRange, todayStr } from '@/lib/utils';
import { jpDate } from '@/lib/schedule-text';
import Modal from './Modal';

// 車両ごとの色（背景 / 文字）。台帳の並び順で割り当てる。
const VEHICLE_COLORS: { bg: string; fg: string }[] = [
  { bg: '#e0f2fe', fg: '#0369a1' },
  { bg: '#dcfce7', fg: '#15803d' },
  { bg: '#fef3c7', fg: '#b45309' },
  { bg: '#ede9fe', fg: '#6d28d9' },
  { bg: '#ccfbf1', fg: '#0f766e' },
  { bg: '#fce7f3', fg: '#be185d' },
];
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const MAX_CHIPS = 3;

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// 「車両1号（プリウス 白）」→「車両1号」
const shortName = (name: string) => name.split(/[（(]/)[0].trim() || name;
const addDays = (s: string, n: number) => {
  const [yy, mm, dd] = s.split('-').map(Number);
  return ymd(new Date(yy, mm - 1, dd + n));
};
const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
const rangeLabel = (v: Reservation) =>
  v.startDate === v.endDate ? `${md(v.startDate)} ${v.startTime}〜${v.endTime}` : `${md(v.startDate)} ${v.startTime}〜${md(v.endDate)} ${v.endTime}`;

// 日ごとの表示項目: 日報（使用実績）と予約
type Entry =
  | { kind: 'report'; time: string; r: Report }
  | { kind: 'reservation'; time: string; v: Reservation }
  | { kind: 'maint'; time: string; b: MaintBlock };

// レンタカーは車両ではないので専用の色にする
const RENTAL_COLOR = { bg: '#ffedd5', fg: '#c2410c' };
const RENTAL_FILTER = '__rental__';
const rentalName = (n: Rental) => [n.company, n.carModel].filter(Boolean).join(' ');

const newReservation = (date: string, vehicleId: string, driver?: Driver | null): Reservation => ({
  id: '',
  vehicleId,
  vehicleName: '',
  plate: '',
  driverId: driver?.id || '',
  driver: '',
  driverLast: '',
  startDate: date,
  endDate: date,
  startTime: '09:00',
  endTime: '18:00',
  destination: '',
  purpose: '',
  note: '',
  createdAt: '',
});

export default function UsageCalendar({
  data,
  currentDriver,
  onRequestDriverLogin,
  onSaveReservation,
  onDeleteReservation,
}: {
  data: AppData;
  currentDriver?: Driver | null;
  // 予約の追加・変更・取消は運転者としてログインしているときだけ行える
  onRequestDriverLogin: () => void;
  onSaveReservation: (r: Reservation) => Promise<unknown>;
  onDeleteReservation: (id: string) => Promise<unknown>;
}) {
  const today = todayStr();
  const [month, setMonth] = useState(today.slice(0, 7)); // YYYY-MM
  const [vehicleId, setVehicleId] = useState('');
  const [selected, setSelected] = useState<string>(today);
  const [form, setForm] = useState<Reservation | null>(null);
  const [saving, setSaving] = useState(false);

  const colorOf = useMemo(() => {
    const map = new Map<string, { bg: string; fg: string }>();
    data.vehicles.forEach((v, i) => map.set(v.id, VEHICLE_COLORS[i % VEHICLE_COLORS.length]));
    // レンタカー（車両台帳にないid）の予約はレンタカーの色
    return (id: string) => map.get(id) || RENTAL_COLOR;
  }, [data.vehicles]);

  const byDate = useMemo(() => {
    const map = new Map<string, Entry[]>();
    const push = (date: string, e: Entry) => {
      const list = map.get(date) || [];
      list.push(e);
      map.set(date, list);
    };
    data.reports.forEach((r) => {
      if (r.maintOnly) return;
      if (vehicleId && r.vehicleId !== vehicleId) return;
      push(r.date, { kind: 'report', time: r.preTime || '', r });
    });
    (data.reservations || []).forEach((v) => {
      if (vehicleId === RENTAL_FILTER ? !v.rentalId : vehicleId && v.vehicleId !== vehicleId) return;
      // 複数日の予約は、その期間の各日に表示する（長すぎる予約は62日まで）
      let d = v.startDate;
      for (let n = 0; d <= v.endDate && n < 62; n++) {
        push(d, { kind: 'reservation', time: d === v.startDate ? v.startTime : '00:00', v });
        d = addDays(d, 1);
      }
    });
    // 修理予定日：その車両は1日使えない
    if (vehicleId !== RENTAL_FILTER) {
      maintBlocks(data.reports).forEach((b) => {
        if (vehicleId && b.vehicleId !== vehicleId) return;
        push(b.date, { kind: 'maint', time: '00:00', b });
      });
    }
    map.forEach((list) => list.sort((a, b) => a.time.localeCompare(b.time)));
    return map;
  }, [data.reports, data.reservations, vehicleId]);

  const [y, m] = month.split('-').map(Number);
  const cells = useMemo(() => {
    const first = new Date(y, m - 1, 1);
    const start = new Date(y, m - 1, 1 - first.getDay());
    const weeks = Math.ceil((first.getDay() + new Date(y, m, 0).getDate()) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [y, m]);

  function shift(delta: number) {
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }

  const monthCounts = useMemo(() => {
    let use = 0;
    const reserved = new Set<string>();
    const rented = new Set<string>();
    byDate.forEach((list, d) => {
      if (!d.startsWith(month)) return;
      list.forEach((e) => {
        if (e.kind === 'report') use++;
        else if (e.kind === 'maint') return;
        else if (e.v.rentalId) rented.add(e.v.id);
        else reserved.add(e.v.id);
      });
    });
    return { use, res: reserved.size, rent: rented.size };
  }, [byDate, month]);
  const dayEntries = byDate.get(selected) || [];

  function openNewReservation(date: string) {
    if (!currentDriver) {
      onRequestDriverLogin();
      return;
    }
    setForm(newReservation(date, vehicleId || data.vehicles[0]?.id || '', currentDriver));
  }
  function setStartDate(value: string) {
    if (!form) return;
    setForm({ ...form, startDate: value, endDate: !form.endDate || form.endDate < value ? value : form.endDate });
  }
  // 予約できるレンタカー: 返却済みでなく、今日以降にまだ期間が残っているもの（変更中の予約のレンタカーは必ず含める）
  const bookableRentals = (data.rentals || []).filter((n) => n.id === form?.rentalId || (!n.returnedAt && n.endDate >= today));
  const formRental = form ? data.rentals.find((n) => n.id === form.vehicleId) || null : null;
  // 車両を選び直したとき、レンタカーなら日付を登録期間の中に収める
  function changeVehicle(id: string) {
    if (!form) return;
    const n = data.rentals.find((x) => x.id === id);
    if (!n) return setForm({ ...form, vehicleId: id, rentalId: undefined });
    const first = n.startDate;
    const last = n.returnedAt || n.endDate;
    const clamp = (d: string) => (d < first ? first : d > last ? last : d);
    const sd = clamp(form.startDate);
    const ed = clamp(form.endDate);
    setForm({ ...form, vehicleId: id, rentalId: id, startDate: sd, endDate: ed < sd ? sd : ed });
  }
  function openChangeReservation(v: Reservation) {
    if (!currentDriver) {
      onRequestDriverLogin();
      return;
    }
    setForm({ ...v });
  }
  async function submitReservation() {
    if (!form) return;
    const rental = data.rentals.find((x) => x.id === form.vehicleId);
    const veh = data.vehicles.find((x) => x.id === form.vehicleId);
    const v = veh || (rental ? { id: rental.id, name: `🚗 ${rentalName(rental)}`, plate: rental.plate } : undefined);
    // 運転者は、新規ならログイン中の運転者、変更なら予約に入っている運転者
    const d = data.drivers.find((x) => x.id === form.driverId);
    if (!v) {
      alert('車両を選択してください。');
      return;
    }
    if (!d && !form.driver) {
      alert('運転者としてログインしてください。');
      return;
    }
    if (!form.startDate || !form.endDate) {
      alert('利用日を入力してください。');
      return;
    }
    if (rental) {
      const last = rental.returnedAt || rental.endDate;
      if (form.startDate < rental.startDate || form.endDate > last) {
        alert(`レンタカーは登録期間（${rental.startDate}〜${last}）の中でだけ予約できます。`);
        return;
      }
    }
    const rec: Reservation = {
      ...form,
      rentalId: rental ? rental.id : undefined,
      vehicleName: v.name,
      plate: v.plate,
      // 台帳から削除された運転者の予約は、予約に残っている名前をそのまま使う
      driver: d ? `${d.lastName} ${d.firstName}`.trim() : form.driver,
      driverLast: d ? d.lastName : form.driverLast,
    };
    setSaving(true);
    try {
      await onSaveReservation(rec);
      setSelected(rec.startDate);
      setMonth(rec.startDate.slice(0, 7));
      setForm(null);
    } catch (e) {
      // 重複などのサーバー側の理由をそのまま伝える
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function cancelReservation(v: Reservation) {
    if (!currentDriver) {
      onRequestDriverLogin();
      return;
    }
    if (!confirm(`${v.vehicleName} の ${rangeLabel(v)}（${v.driver}）の予約を取り消しますか？`)) return;
    try {
      await onDeleteReservation(v.id);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="toolbar2">
        <div>
          <h3 className="card-title" style={{ marginBottom: 4 }}>
            📅 車両の使用・予約カレンダー
            <span className="pill pill-slate" style={{ marginLeft: 8 }}>
              {y}年{m}月　使用{monthCounts.use}件・予約{monthCounts.res}件{monthCounts.rent > 0 ? `・レンタカー予約${monthCounts.rent}件` : ''}
            </span>
          </h3>
          <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>日報の使用実績と、車両・レンタカーの予約を月単位で確認できます。日付を押すと詳細が表示されます。同じ車両の時間が重なる予約はできません。</div>
        </div>
        <div className="actions">
          <button className="btn btn-sm btn-primary" onClick={() => openNewReservation(selected)} disabled={data.vehicles.length === 0}>
            ＋ 予約を追加
          </button>
          <button className="btn btn-sm" onClick={() => shift(-1)} aria-label="前の月">
            ◀ 前月
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              setMonth(today.slice(0, 7));
              setSelected(today);
            }}
          >
            今日
          </button>
          <button className="btn btn-sm" onClick={() => shift(1)} aria-label="次の月">
            次月 ▶
          </button>
          <select
            aria-label="車両で絞り込み"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid var(--slate-300)', borderRadius: 8 }}
          >
            <option value="">すべての車両・レンタカー</option>
            {data.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
            <option value={RENTAL_FILTER}>レンタカーのみ</option>
          </select>
        </div>
      </div>

      <div className="cal-legend">
        {data.vehicles.map((v) => {
          const c = colorOf(v.id);
          return (
            <span key={v.id} className="cal-chip" style={{ background: c.bg, color: c.fg }}>
              {shortName(v.name)}
            </span>
          );
        })}
        <span className="cal-chip" style={{ background: RENTAL_COLOR.bg, color: RENTAL_COLOR.fg }}>
          🚗 レンタカー
        </span>
        <span className="cal-legend-note">実線＝使用実績（日報）／破線の「予」＝予約／赤の「🔧」＝整備予定（その日は使用不可）</span>
      </div>

      <div className="cal-scroll">
        <div className="cal-grid" role="grid" aria-label={`${y}年${m}月の車両使用状況`}>
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`cal-head ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>
              {w}
            </div>
          ))}
          {cells.map((d) => {
            const key = ymd(d);
            const inMonth = d.getMonth() === m - 1;
            const list = byDate.get(key) || [];
            const dow = d.getDay();
            return (
              <button
                key={key}
                type="button"
                className={`cal-cell ${inMonth ? '' : 'out'} ${key === today ? 'today' : ''} ${key === selected ? 'selected' : ''}`}
                onClick={() => setSelected(key)}
                aria-label={`${d.getMonth() + 1}月${d.getDate()}日 ${list.length}件`}
              >
                <span className={`cal-day ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}`}>{d.getDate()}</span>
                {list.slice(0, MAX_CHIPS).map((e) => {
                  if (e.kind === 'report') {
                    const r = e.r;
                    const c = colorOf(r.vehicleId);
                    return (
                      <span
                        key={r.id}
                        className="cal-chip"
                        style={{ background: c.bg, color: c.fg }}
                        title={`${r.preTime} ${r.vehicleName} / ${r.driver} / ${r.destination}`}
                      >
                        {shortName(r.vehicleName)} {r.driverLast}
                      </span>
                    );
                  }
                  if (e.kind === 'maint') {
                    return (
                      <span
                        key={`m-${e.b.reportId}`}
                        className="cal-chip"
                        style={{ background: '#fee2e2', color: '#b91c1c' }}
                        title={`【整備予定・使用不可】${e.b.vehicleName} / ${e.b.type}`}
                      >
                        🔧 {shortName(e.b.vehicleName)}
                      </span>
                    );
                  }
                  const v = e.v;
                  const c = colorOf(v.vehicleId);
                  return (
                    <span
                      key={`${v.id}-${key}`}
                      className="cal-chip reserved"
                      style={{ background: c.bg, color: c.fg }}
                      title={`【予約】${rangeLabel(v)} ${v.vehicleName} / ${v.driver} / ${v.destination}`}
                    >
                      予 {shortName(v.vehicleName)} {v.driverLast}
                    </span>
                  );
                })}
                {list.length > MAX_CHIPS && <span className="cal-more">+{list.length - MAX_CHIPS}件</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="cal-detail">
        <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>
          {selected.replace(/^(\d+)-(\d+)-(\d+)$/, (_, yy, mm, dd) => `${yy}年${Number(mm)}月${Number(dd)}日`)}の使用・予約状況
        </h4>
        {dayEntries.length === 0 ? (
          <div className="empty-state" style={{ padding: 12 }}>
            この日の使用予定・実績はありません
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => openNewReservation(selected)} disabled={data.vehicles.length === 0}>
                ＋ この日に予約を追加
              </button>
            </div>
          </div>
        ) : (
          <div className="alert-list">
            {dayEntries.map((e) => {
              const plain = { background: 'var(--slate-50)', borderColor: 'var(--slate-200)', color: 'var(--slate-800)' };
              if (e.kind === 'report') {
                const r = e.r;
                const c = colorOf(r.vehicleId);
                return (
                  <div key={r.id} className="alert-item" style={plain}>
                    <span className="cal-chip" style={{ background: c.bg, color: c.fg }}>
                      {shortName(r.vehicleName)}
                    </span>
                    <div style={{ flex: 1 }}>
                      <strong>{r.driver}</strong>
                      {r.dept ? `（${r.dept}）` : ''}— {r.destination}
                      {r.purpose ? ` / ${r.purpose}` : ''}
                      <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
                        {r.preTime}〜{r.postDone ? r.postTime || '帰着済' : ''}
                        {r.plate ? `　${r.plate}` : ''}
                      </div>
                    </div>
                    {r.postDone ? <span className="pill pill-green">帰着済</span> : <span className="pill pill-amber">出庫中</span>}
                  </div>
                );
              }
              if (e.kind === 'maint') {
                return (
                  <div key={`m-${e.b.reportId}`} className="alert-item" style={{ background: '#fef2f2', borderColor: '#fecaca', color: 'var(--slate-800)' }}>
                    <span className="cal-chip" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                      🔧 {shortName(e.b.vehicleName)}
                    </span>
                    <div style={{ flex: 1 }}>
                      <strong>整備予定（{e.b.type}）</strong>
                      <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
                        {jpDate(e.b.date)}は終日、この車両は使えません{e.b.plate ? `　${e.b.plate}` : ''}
                      </div>
                    </div>
                    <span className="pill pill-red">使用不可</span>
                  </div>
                );
              }
              const v = e.v;
              const c = colorOf(v.vehicleId);
              return (
                <div key={`${v.id}-${selected}`} className="alert-item" style={plain}>
                  <span className="cal-chip reserved" style={{ background: c.bg, color: c.fg }}>
                    予 {shortName(v.vehicleName)}
                  </span>
                  <div style={{ flex: 1 }}>
                    <strong>{v.driver}</strong>
                    {v.destination ? ` — ${v.destination}` : ''}
                    {v.purpose ? ` / ${v.purpose}` : ''}
                    <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
                      {rangeLabel(v)}
                      {v.plate ? `　${v.plate}` : ''}
                      {v.note ? `　${v.note}` : ''}
                    </div>
                  </div>
                  <span className="pill" style={{ background: 'var(--sky-100)', color: 'var(--sky-700)' }}>予約</span>
                  <button className="btn btn-sm" onClick={() => openChangeReservation(v)}>
                    変更
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => cancelReservation(v)}>
                    取消
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {form && (
        <Modal
          title={form.id ? `車両の予約を変更（${form.driver}）` : `車両を予約する（${currentDriver ? `${currentDriver.lastName} ${currentDriver.firstName}` : ''}）`}
          onClose={() => setForm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setForm(null)}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={submitReservation} disabled={saving}>
                {saving ? '保存中…' : form.id ? '変更を保存する' : '予約する'}
              </button>
            </>
          }
        >
          <div className="field">
            <label>車両 *</label>
            <select value={form.vehicleId} onChange={(e) => changeVehicle(e.target.value)}>
              <optgroup label="車両">
                {data.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}（{v.plate}）
                  </option>
                ))}
              </optgroup>
              {bookableRentals.length > 0 && (
                <optgroup label="レンタカー（登録期間のみ予約できます）">
                  {bookableRentals.map((n) => (
                    <option key={n.id} value={n.id}>
                      🚗 {rentalName(n)}
                      {n.plate ? `（${n.plate}）` : ''} {md(n.startDate)}〜{md(n.returnedAt || n.endDate)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {formRental && (
              <div style={{ fontSize: 12, color: 'var(--slate-500)', marginTop: 4 }}>
                このレンタカーは {formRental.startDate}〜{formRental.returnedAt || formRental.endDate} の間だけ予約できます。
              </div>
            )}
          </div>
          <div className="field-row">
            <div className="field">
              <label>開始日 *</label>
              <input type="date" value={form.startDate} min={formRental?.startDate} max={formRental ? formRental.returnedAt || formRental.endDate : undefined} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="field">
              <label>開始時刻</label>
              <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>終了日 *</label>
              <input type="date" value={form.endDate} min={form.startDate} max={formRental ? formRental.returnedAt || formRental.endDate : undefined} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
            <div className="field">
              <label>終了時刻</label>
              <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>行先</label>
              <input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
            </div>
            <div className="field">
              <label>用件</label>
              <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>備考</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </Modal>
      )}
    </div>
  );
}
