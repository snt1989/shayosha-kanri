'use client';

import { AppData, Driver, MAINT_URGENCIES, Reservation } from '@/lib/types';
import { openMaintRequests, rentalReservations, reservationRange, todayStr } from '@/lib/utils';
import AlertsPanel from './AlertsPanel';
import UsageCalendar from './UsageCalendar';
import DashboardNotices from './DashboardNotices';

export default function DashboardTab({
  data,
  onReturnCheckin,
  onOpenMaintenance,
  currentDriver,
  onRequestDriverLogin,
  onSaveReservation,
  onDeleteReservation,
  isAdmin,
}: {
  data: AppData;
  onReturnCheckin: (id: string) => void;
  onOpenMaintenance: () => void;
  currentDriver?: Driver | null;
  onRequestDriverLogin: () => void;
  onSaveReservation: (r: Reservation) => Promise<unknown>;
  onDeleteReservation: (id: string) => Promise<unknown>;
  isAdmin: boolean;
}) {
  const today = todayStr();
  const openReports = [...data.reports]
    .filter((r) => !r.postDone)
    .sort((a, b) => (a.date + a.preTime).localeCompare(b.date + b.preTime));
  const maintRequests = openMaintRequests(data.reports);
  // 利用中（返却前で期間が残っている）レンタカーと、そこに入っている予約
  const activeRentals = data.rentals
    .filter((n) => !n.returnedAt && n.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="card-title" style={{ marginBottom: 4 }}>
          📊 ダッシュボード
        </h3>
        <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
          車検・点検・免許更新・アルコールチェックのアラート、帰着未登録の日報、整備依頼、車両の使用・予約カレンダーをまとめて確認できます。
        </div>
      </div>

      <DashboardNotices isAdmin={isAdmin} />

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="card-title">
          🚙 帰着登録が済んでいない日報
          {openReports.length > 0 && <span className="pill pill-amber" style={{ marginLeft: 8 }}>{openReports.length}件</span>}
        </h3>
        {openReports.length === 0 ? (
          <div className="empty-state">帰着未登録の日報はありません</div>
        ) : (
          <div className="alert-list">
            {openReports.map((r) => {
              const overdue = r.date < today;
              return (
                <div key={r.id} className={`alert-item ${overdue ? 'danger' : 'warn'}`}>
                  <span>🚗</span>
                  <div style={{ flex: 1 }}>
                    <strong>
                      {r.date} {r.driver}
                    </strong>
                    （{r.vehicleName}）— {r.destination}
                    {r.purpose ? ` / ${r.purpose}` : ''}　出発 {r.preTime}
                    {overdue && '（日付超過）'}
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={() => onReturnCheckin(r.id)}>
                    帰着登録する
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="card-title">
          🔧 整備依頼（対応待ち）
          {maintRequests.length > 0 && <span className="pill pill-red" style={{ marginLeft: 8 }}>{maintRequests.length}件</span>}
        </h3>
        {maintRequests.length === 0 ? (
          <div className="empty-state">対応待ちの整備依頼はありません</div>
        ) : (
          <div className="alert-list">
            {maintRequests.map((r) => {
              const urgent = r.maintRequestUrgency === MAINT_URGENCIES[2];
              return (
                <div key={r.id} className={`alert-item ${urgent ? 'danger' : 'warn'}`}>
                  <span>🔧</span>
                  <div style={{ flex: 1 }}>
                    <strong>{r.vehicleName}</strong>
                    {r.plate ? `（${r.plate}）` : ''}— {r.maintRequestType || '整備'}
                    {r.maintRequestUrgency && r.maintRequestUrgency !== MAINT_URGENCIES[0] && (
                      <span className={`pill ${urgent ? 'pill-red' : 'pill-amber'}`} style={{ marginLeft: 6 }}>
                        {r.maintRequestUrgency}
                      </span>
                    )}
                    <div style={{ fontSize: 12, marginTop: 2 }}>
                      {r.maintRequestNote}　依頼: {r.date} {r.driver}
                    </div>
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={onOpenMaintenance}>
                    整備台帳で対応
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {activeRentals.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 className="card-title">
            🚗 レンタカーの利用・予約状況
            <span className="pill pill-amber" style={{ marginLeft: 8 }}>{activeRentals.length}台</span>
          </h3>
          <div className="alert-list">
            {activeRentals.map((n) => {
              const booked = rentalReservations(data.reservations, n.id, today);
              return (
                <div key={n.id} className="alert-item warn">
                  <span>🚗</span>
                  <div style={{ flex: 1 }}>
                    <strong>{[n.company, n.carModel].filter(Boolean).join(' ')}</strong>
                    {n.plate ? `（${n.plate}）` : ''}
                    <span style={{ marginLeft: 8, fontSize: 12 }}>
                      {n.startDate}〜{n.endDate}{n.startDate > today ? '（利用前）' : '（利用中）'}　登録者: {n.driver}
                    </span>
                    <div style={{ fontSize: 12, marginTop: 2 }}>
                      {booked.length === 0
                        ? '予約はまだありません'
                        : booked.map((v) => `📅 ${reservationRange(v)} ${v.driver}${v.destination ? `（${v.destination}）` : ''}`).join('　／　')}
                    </div>
                  </div>
                  {booked.length > 0 && <span className="pill pill-slate">予約{booked.length}件</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <UsageCalendar
        data={data}
        currentDriver={currentDriver}
        onRequestDriverLogin={onRequestDriverLogin}
        onSaveReservation={onSaveReservation}
        onDeleteReservation={onDeleteReservation}
      />

      <AlertsPanel data={data} standalone />
    </div>
  );
}
