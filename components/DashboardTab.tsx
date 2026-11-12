'use client';

import { useState } from 'react';
import { useMobileLimit } from '@/lib/useLimit';
import { AppData, Driver, MAINT_URGENCIES, Report, Reservation, cardKindIcon } from '@/lib/types';
import { urgencyLevel, urgencyPill, canEditMaintRequest, openMaintRequests, rentalReservations, reservationRange, todayStr } from '@/lib/utils';
import AlertsPanel, { MaintPrefill } from './AlertsPanel';
import DashboardNotices from './DashboardNotices';
import { fmtDateTime, isOverdue, useCards } from './useCards';
import MaintRequestModal, { MaintRequestInput } from './MaintRequestModal';
import ContactRequester from './ContactRequester';
import { PhotoThumbs } from './PhotoField';

export default function DashboardTab({
  data,
  onReturnCheckin,
  onOpenMaintenance,
  onOpenCalendar,
  currentDriver,
  onRequestDriverLogin,
  onSaveReservation,
  onDeleteReservation,
  isAdmin,
  onSubmitMaintRequest,
  onEditMaintRequest,
  onDeleteMaintRequest,
  mechanic,
}: {
  data: AppData;
  onReturnCheckin: (id: string) => void;
  onOpenMaintenance: () => void;
  onOpenCalendar: () => void;
  currentDriver?: Driver | null;
  onRequestDriverLogin: () => void;
  onSaveReservation: (r: Reservation) => Promise<unknown>;
  onDeleteReservation: (id: string) => Promise<unknown>;
  isAdmin: boolean;
  onSubmitMaintRequest: (r: MaintRequestInput) => Promise<unknown>;
  onEditMaintRequest: (id: string, r: MaintRequestInput) => Promise<unknown>;
  onDeleteMaintRequest: (id: string) => Promise<unknown>;
  mechanic: string | null;
}) {
  const [editingReq, setEditingReq] = useState<Report | null>(null);
  const { cards, loans } = useCards();
  // 整備依頼の入力画面。アラートから開くときは、車両・種類・内容をあらかじめ入れておく
  const [maintForm, setMaintForm] = useState<MaintPrefill | null>(null);
  const openMaintForm = (p: MaintPrefill) => {
    if (!currentDriver) return onRequestDriverLogin();
    setMaintForm(p);
  };
  const today = todayStr();
  const openReports = [...data.reports]
    .filter((r) => !r.postDone)
    .sort((a, b) => (a.date + a.preTime).localeCompare(b.date + b.preTime));
  const maintRequests = openMaintRequests(data.reports);
  const openLim = useMobileLimit(openReports, 3);
  const reqLim = useMobileLimit(maintRequests, 3);
  // 利用中（返却前で期間が残っている）レンタカーと、そこに入っている予約
  const activeRentals = data.rentals
    .filter((n) => !n.returnedAt && n.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div>
      <div className="card dash-intro" style={{ marginBottom: 14 }}>
        <h3 className="card-title" style={{ marginBottom: 4 }}>
          📊 ダッシュボード
        </h3>
        <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
          車検・点検・免許更新・アルコールチェックのアラート、帰着未登録の日報、整備依頼、貸出中のカードなどをまとめて確認できます。車両の使用・予約は「カレンダー」のページです。
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
            {openLim.shown.map((r) => {
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
          {openLim.more}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="card-title">
          🔧 整備依頼（対応待ち）
          {maintRequests.length > 0 && <span className="pill pill-red" style={{ marginLeft: 8 }}>{maintRequests.length}件</span>}
        </h3>
        <div style={{ marginBottom: 10 }}>
          <button
            className="btn btn-primary"
            onClick={() => openMaintForm({ vehicleId: '', type: '', note: '' })}
          >
            ＋ 整備を依頼する
          </button>
        </div>
        {maintRequests.length === 0 ? (
          <div className="empty-state">対応待ちの整備依頼はありません</div>
        ) : (
          <div className="alert-list">
            {reqLim.shown.map((r) => {
              return (
                <div key={r.id} className={`alert-item u-${urgencyLevel(r.maintRequestUrgency)}`}>
                  <span>🔧</span>
                  <div style={{ flex: 1 }}>
                    <strong>{r.vehicleName}</strong>
                    {r.plate ? `（${r.plate}）` : ''}— {r.maintRequestType || '整備'}
                    {r.maintRequestWatch && (
                      <span className="pill pill-sky" style={{ marginLeft: 6 }}>
                        👀 経過観察中
                      </span>
                    )}
                    <span className={`pill ${urgencyPill(r.maintRequestUrgency)}`} style={{ marginLeft: 6 }}>
                        {r.maintRequestUrgency || MAINT_URGENCIES[0]}
                      </span>
                    <div style={{ fontSize: 12, marginTop: 2 }}>
                      {r.maintRequestNote}　依頼: {r.date} {r.driver}
                      <PhotoThumbs ids={r.maintRequestPhotos} />
                      <div className="contact-row">
                        <ContactRequester report={r} drivers={data.drivers} show={Boolean(mechanic) || isAdmin} />
                      </div>
                    </div>
                  </div>
                  <div className="alert-actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {canEditMaintRequest(r, { driverId: currentDriver?.id, mechanic, isAdmin }) && (
                      <button className="btn btn-sm" onClick={() => setEditingReq(r)}>
                        ✏️ 編集
                      </button>
                    )}
                    {canEditMaintRequest(r, { driverId: currentDriver?.id, mechanic, isAdmin }) && (
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (confirm(`${r.vehicleName} の整備依頼「${r.maintRequestType || '整備'}」を削除しますか？`)) onDeleteMaintRequest(r.id);
                        }}
                      >
                        削除
                      </button>
                    )}
                    <button className="btn btn-sm btn-primary" onClick={onOpenMaintenance}>
                      整備台帳で対応
                    </button>
                  </div>
                </div>
              );
            })}
          {reqLim.more}
          </div>
        )}
      </div>

      {loans.some((l) => !l.returnedAt) && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 className="card-title">
            💳 貸出中のガソリンカード・ETCカード
            <span className="pill pill-amber" style={{ marginLeft: 8 }}>{loans.filter((l) => !l.returnedAt).length}枚</span>
          </h3>
          <div className="alert-list">
            {loans
              .filter((l) => !l.returnedAt)
              .map((l) => {
                const late = isOverdue(l, today);
                const c = cards.find((x) => x.id === l.cardId);
                return (
                  <div key={l.id} className={`alert-item ${late ? 'danger' : 'warn'}`}>
                    <span>{c ? cardKindIcon(c) : '💳'}</span>
                    <div style={{ flex: 1 }}>
                      <strong>{c?.name || '（削除済みのカード）'}</strong> — {l.borrower}
                      {l.dept ? `（${l.dept}）` : ''}　{fmtDateTime(l.borrowedAt)}〜
                      {l.dueDate ? `（返却予定 ${l.dueDate}${late ? '・期限超過' : ''}）` : ''}
                      {l.purpose ? `　${l.purpose}` : ''}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

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

      {maintForm && currentDriver && (
        <MaintRequestModal
          data={data}
          driver={currentDriver}
          initialVehicleId={maintForm.vehicleId || undefined}
          initialType={maintForm.type}
          initialNote={maintForm.note}
          onClose={() => setMaintForm(null)}
          onSubmit={onSubmitMaintRequest}
        />
      )}

      {editingReq && (
        <MaintRequestModal
          data={data}
          editing={editingReq}
          onClose={() => setEditingReq(null)}
          onSubmit={(input) => onEditMaintRequest(editingReq.id, input)}
        />
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="card-title">📅 車両の使用・予約カレンダー</h3>
        <div style={{ fontSize: 13, color: 'var(--slate-600)', marginBottom: 10 }}>
          車両の使用実績と予約を、月のカレンダーで確認できます。予約もここから入れられます。
        </div>
        <button className="btn btn-primary" onClick={onOpenCalendar}>
          📅 カレンダーを開く
        </button>
      </div>

      <AlertsPanel data={data} standalone onRequestMaint={openMaintForm} />
    </div>
  );
}
