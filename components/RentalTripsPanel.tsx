'use client';

import { useMemo, useState } from 'react';
import { AppData, Driver, RentalTrip } from '@/lib/types';
import { daysUntil, todayStr } from '@/lib/utils';
import { downloadCsv, rentalTripsToCsv } from '@/lib/csv';
import { normalizeAlertSettings } from '@/lib/alert-settings';
import Modal from './Modal';

const OTHER = '__other__';

type Draft = { rec: RentalTrip; pick: string };

// 運転日・運転者・備考の入力欄（入力画面と編集モーダルで共通）
function TripFields({ draft, onChange, drivers, departments, licenseDays }: { draft: Draft; onChange: (d: Draft) => void; drivers: Driver[]; departments: string[]; licenseDays: number }) {
  const { rec, pick } = draft;
  const picked = drivers.find((d) => d.id === pick);
  const days = picked ? daysUntil(picked.licenseExpiry) : null;
  const licenseMsg = !picked
    ? ''
    : days === null
      ? '免許の有効期限が未設定です。'
      : days < 0
        ? '免許の有効期限が切れています。'
        : days <= licenseDays
          ? `免許の有効期限まであと${days}日です。`
          : '';
  function pickDriver(v: string) {
    if (v === OTHER) return onChange({ pick: v, rec: { ...rec, driverId: undefined, driver: '' } });
    const d = drivers.find((x) => x.id === v);
    // 運転者を選んだら、その人の所属を事業部の初期値にする（変更もできる）
    onChange({ pick: v, rec: { ...rec, driverId: v, driver: d ? `${d.lastName} ${d.firstName}` : '', dept: d?.dept || rec.dept } });
  }
  return (
    <>
      <div className="field-row">
        <div className="field">
          <label>運転日</label>
          <input type="date" value={rec.date} onChange={(e) => onChange({ pick, rec: { ...rec, date: e.target.value } })} />
        </div>
        <div className="field">
          <label>運転者</label>
          <select value={pick} onChange={(e) => pickDriver(e.target.value)}>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.lastName} {d.firstName}
              </option>
            ))}
            <option value={OTHER}>その他（台帳にない人）</option>
          </select>
        </div>
      </div>
      {pick === OTHER && (
        <div className="field">
          <label>運転者の名前</label>
          <input value={rec.driver} placeholder="例: ○○商事 佐藤" onChange={(e) => onChange({ pick, rec: { ...rec, driver: e.target.value } })} />
        </div>
      )}
      {licenseMsg && (
        <div className="alert-item warn" style={{ marginBottom: 10 }}>
          {licenseMsg}
        </div>
      )}
      <div className="field-row">
        <div className="field">
          <label>事業部</label>
          <select value={rec.dept || ''} onChange={(e) => onChange({ pick, rec: { ...rec, dept: e.target.value } })}>
            <option value="">選択してください</option>
            {Array.from(new Set([...departments, rec.dept].filter(Boolean) as string[])).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>現場名</label>
          <input value={rec.site || ''} placeholder="例: ○○ビル新築工事" onChange={(e) => onChange({ pick, rec: { ...rec, site: e.target.value } })} />
        </div>
      </div>
      <div className="field">
        <label>備考（区間・用件など、任意）</label>
        <input value={rec.note} onChange={(e) => onChange({ pick, rec: { ...rec, note: e.target.value } })} />
      </div>
    </>
  );
}

export default function RentalTripsPanel({
  data,
  currentDriver,
  onRequestDriverLogin,
  onSave,
  onDelete,
  isAdmin,
  onRequestAdminLogin,
  rentalId,
  onRentalIdChange,
  onBack,
}: {
  data: AppData;
  currentDriver: Driver | null;
  onRequestDriverLogin: () => void;
  onSave: (t: RentalTrip) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  isAdmin: boolean;
  onRequestAdminLogin: () => void;
  rentalId: string; // 空なら全レンタカーの一覧、指定があればそのレンタカーの入力画面
  onRentalIdChange: (id: string) => void;
  onBack: () => void;
}) {
  const [driverFilter, setDriverFilter] = useState('');
  const [form, setForm] = useState<Draft | null>(null); // 既存の記録の編集／全件画面からの新規入力（モーダル）
  const [draft, setDraft] = useState<Draft | null>(null); // 入力画面の入力欄
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const rentalById = useMemo(() => new Map(data.rentals.map((r) => [r.id, r])), [data.rentals]);
  const sortedRentals = useMemo(() => [...data.rentals].sort((a, b) => b.startDate.localeCompare(a.startDate)), [data.rentals]);
  const rentalLabel = (id: string) => {
    const r = rentalById.get(id);
    return r ? `${r.startDate} ${r.company} ${[r.carModel, r.plate].filter(Boolean).join(' ')}`.trim() : '（削除済み）';
  };
  const driverNames = useMemo(() => Array.from(new Set(data.rentalTrips.map((t) => t.driver))), [data.rentalTrips]);
  const focused = rentalId ? rentalById.get(rentalId) || null : null;

  const rows = useMemo(
    () =>
      data.rentalTrips
        .filter((t) => (!rentalId || t.rentalId === rentalId) && (!driverFilter || t.driver === driverFilter))
        .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)),
    [data.rentalTrips, rentalId, driverFilter]
  );

  const blankDraft = (rid: string, date = todayStr()): Draft => ({
    rec: {
      id: '',
      rentalId: rid,
      date,
      driverId: currentDriver?.id,
      driver: currentDriver ? `${currentDriver.lastName} ${currentDriver.firstName}` : '',
      dept: currentDriver?.dept || '',
      site: '',
      note: '',
      createdAt: '',
    },
    pick: currentDriver?.id || OTHER,
  });
  // 入力画面の入力欄。まだ触っていなければ、ログイン中の運転者・今日の日付が初期値
  const entry: Draft = draft && draft.rec.rentalId === rentalId ? draft : blankDraft(rentalId);

  function guard(fn: () => void) {
    if (!currentDriver) return onRequestDriverLogin();
    fn();
  }
  function openNewModal() {
    guard(() => {
      setError('');
      setForm(blankDraft(sortedRentals[0]?.id || ''));
    });
  }
  function openEdit(t: RentalTrip) {
    if (!isAdmin) return onRequestAdminLogin();
    guard(() => {
      setError('');
      setForm({ rec: { ...t }, pick: t.driverId && data.drivers.some((d) => d.id === t.driverId) ? t.driverId : OTHER });
    });
  }
  async function remove(t: RentalTrip) {
    if (!isAdmin) return onRequestAdminLogin();
    if (!confirm(`${t.date} ${t.driver} の運行記録を削除しますか？`)) return;
    await onDelete(t.id);
  }

  async function save(d: Draft): Promise<boolean> {
    const { rec } = d;
    if (!currentDriver) {
      onRequestDriverLogin();
      return false;
    }
    if (!rec.rentalId) {
      setError('レンタカーを選んでください。（先にレンタカーを登録してください）');
      return false;
    }
    if (!rec.date) {
      setError('運転日を入力してください。');
      return false;
    }
    if (!rec.driver.trim()) {
      setError('運転者を選ぶか、名前を入力してください。');
      return false;
    }
    if (!(rec.dept || '').trim()) {
      setError('事業部を選んでください。');
      return false;
    }
    if (!(rec.site || '').trim()) {
      setError('現場名を入力してください。');
      return false;
    }
    setSaving(true);
    setError('');
    setOkMsg('');
    try {
      await onSave({ ...rec, driver: rec.driver.trim() });
      return true;
    } catch (e) {
      setError((e as Error)?.message || '保存できませんでした。');
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function submitModal() {
    if (form && (await save(form))) setForm(null);
  }
  async function submitInline() {
    if (!(await save(entry))) return;
    // 続けて入力できるよう、運転日は残して運転者・備考を初期化する
    setOkMsg(`${entry.rec.date} ${entry.rec.driver} を登録しました。`);
    // 同じ現場が続くことが多いので、運転日・事業部・現場名は残す
    const next = blankDraft(entry.rec.rentalId, entry.rec.date);
    setDraft({ ...next, rec: { ...next.rec, dept: entry.rec.dept, site: entry.rec.site } });
  }

  return (
    <div>
      <div className="card">
        <div className="toolbar2">
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}>
              📋 レンタカー 運行記録 <span className="pill pill-slate">誰が運転したかを別で管理</span>
            </h3>
            {focused ? (
              <div style={{ fontSize: 13, color: 'var(--slate-700)' }}>
                <b>{focused.company}</b> {[focused.carClass, focused.carModel, focused.plate].filter(Boolean).join(' / ')}
                <span style={{ color: 'var(--slate-500)' }}>
                  　{focused.startDate}〜{focused.endDate}　登録者: {focused.driver}
                </span>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
                レンタカーを運転した日と運転者を記録します。運転者が変わったら、その都度追加してください。
              </div>
            )}
          </div>
          <div className="actions">
            <button className="btn btn-sm" onClick={onBack}>
              ← レンタカー登録へ戻る
            </button>
            <button
              className="btn btn-sm"
              onClick={() => downloadCsv(`レンタカー運行記録_${todayStr()}.csv`, rentalTripsToCsv(rows, data.rentals))}
              disabled={rows.length === 0}
            >
              ⬇ CSV出力
            </button>
            {!focused && (
              <button className="btn btn-primary btn-sm" onClick={openNewModal} disabled={data.rentals.length === 0}>
                ＋ 運行記録を登録
              </button>
            )}
          </div>
        </div>

        {!currentDriver && (
          <div className="alert-item warn" style={{ margin: '10px 0' }}>
            <span>🪪</span>
            <div style={{ flex: 1 }}>運行記録の登録・変更をするには、先に運転者としてログインしてください。</div>
            <button className="btn btn-sm btn-primary" onClick={onRequestDriverLogin}>
              運転者としてログイン
            </button>
          </div>
        )}
        {data.rentals.length === 0 && <div className="empty-state">先に「レンタカー登録」でレンタカーを登録してください</div>}

        {focused && (
          <div className="card" style={{ background: 'var(--slate-50)', margin: '12px 0' }}>
            <div className="section-heading" style={{ marginTop: 0 }}>
              運行記録を入力
            </div>
            {error && (
              <div className="alert-item warn" style={{ marginBottom: 10 }}>
                {error}
              </div>
            )}
            <TripFields draft={entry} onChange={setDraft} drivers={data.drivers} departments={data.masters.departments} licenseDays={normalizeAlertSettings(data.alertSettings).licenseDays} />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={submitInline} disabled={saving}>
                {saving ? '保存中…' : '登録する'}
              </button>
              {okMsg && <span style={{ fontSize: 12, color: 'var(--green-600)' }}>{okMsg}</span>}
            </div>
          </div>
        )}

        {data.rentals.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '12px 0' }}>
              <select
                value={rentalId}
                onChange={(e) => {
                  onRentalIdChange(e.target.value);
                  setOkMsg('');
                  setError('');
                }}
                style={{ padding: '8px 10px', border: '1px solid var(--slate-300)', borderRadius: 8 }}
              >
                <option value="">すべてのレンタカー</option>
                {sortedRentals.map((r) => (
                  <option key={r.id} value={r.id}>
                    {rentalLabel(r.id)}
                  </option>
                ))}
              </select>
              <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--slate-300)', borderRadius: 8 }}>
                <option value="">すべての運転者</option>
                {driverNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="pill pill-slate" style={{ alignSelf: 'center' }}>
                {rows.length}件
              </span>
            </div>

            {rows.length === 0 ? (
              <div className="empty-state">運行記録はありません</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>運転日</th>
                      <th>運転者</th>
                      <th>事業部</th>
                      <th>現場名</th>
                      {!focused && <th>レンタカー</th>}
                      <th>備考</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.id}>
                        <td>{t.date}</td>
                        <td>
                          {t.driver}
                          {!t.driverId && <span className="cell-sub">台帳外</span>}
                        </td>
                        <td>{t.dept || '-'}</td>
                        <td>{t.site || '-'}</td>
                        {!focused && <td>{rentalLabel(t.rentalId)}</td>}
                        <td>{t.note || '-'}</td>
                        <td>
                          <div className="eactions">
                            <button className="btn btn-sm" onClick={() => openEdit(t)} title={isAdmin ? '' : '管理者ログインが必要です'}>
                              {isAdmin ? '' : '🔒 '}編集
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => remove(t)} title={isAdmin ? '' : '管理者ログインが必要です'}>
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
          </>
        )}
      </div>

      {form && (
        <Modal
          title={form.rec.id ? '運行記録を編集' : '運行記録を登録'}
          onClose={() => setForm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setForm(null)}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={submitModal} disabled={saving}>
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
          <div className="field">
            <label>レンタカー</label>
            <select value={form.rec.rentalId} onChange={(e) => setForm({ ...form, rec: { ...form.rec, rentalId: e.target.value } })}>
              {sortedRentals.map((r) => (
                <option key={r.id} value={r.id}>
                  {rentalLabel(r.id)}
                </option>
              ))}
            </select>
          </div>
          <TripFields draft={form} onChange={setForm} drivers={data.drivers} departments={data.masters.departments} licenseDays={normalizeAlertSettings(data.alertSettings).licenseDays} />
        </Modal>
      )}
    </div>
  );
}
