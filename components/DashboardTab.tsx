'use client';

import { WeatherAlertStrip } from './LiveWeatherPanel';
import FleetTodayPanel from './FleetTodayPanel';
import ReqTypes from './ReqTypes';
import { useState } from 'react';
import { useMobileLimit } from '@/lib/useLimit';
import { AppData, Driver, MAINT_URGENCIES, Report, Reservation, cardKindIcon } from '@/lib/types';
import { urgencyLevel, urgencyPill, canEditMaintRequest, openMaintRequests, rentalReservations, reservationRange, todayStr } from '@/lib/utils';
import AlertsPanel, { MaintPrefill } from './AlertsPanel';
import DashboardNotices from './DashboardNotices';
import { fmtDateTime, isOverdue, useCards } from './useCards';
import IncidentsPanel from './IncidentsPanel';
import MaintRequestModal, { MaintRequestInput } from './MaintRequestModal';
import RequestSchedule from './RequestSchedule';
import { jpDate } from '@/lib/schedule-text';
import ContactRequester from './ContactRequester';
import { PhotoThumbs } from './PhotoField';
import DashSection from './DashSection';

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
  hideOpenReports = false,
  onRefresh,
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
  // 整備士だけのときは、帰着登録が済んでいない日報の欄を出さない
  hideOpenReports?: boolean;
  onRefresh?: () => void;
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
  // スマホでは整備依頼を1件ずつ短く表示し、「詳細・操作」で開く
  const [reqOpen, setReqOpen] = useState<Set<string>>(new Set());
  const toggleReq = (id: string) =>
    setReqOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const openLim = useMobileLimit(openReports, 3);
  const reqLim = useMobileLimit(maintRequests, 3);
  // 利用中（返却前で期間が残っている）レンタカーと、そこに入っている予約
  const activeRentals = data.rentals
    .filter((n) => !n.returnedAt && n.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  // 役割ごとに、ダッシュボードの出し方を変える（管理者：すべて開く／整備士：整備依頼を中心に／運転者：自分に関係するものを先に）
  const role = isAdmin ? 'admin' : mechanic && !currentDriver ? 'mechanic' : currentDriver ? 'driver' : 'guest';
  const openBy = (...roles: string[]) => roles.includes(role);
  const myName = currentDriver ? `${currentDriver.lastName} ${currentDriver.firstName}` : '';
  const isMine = (r: Report) => Boolean(currentDriver && (r.driverId ? r.driverId === currentDriver.id : r.driver.replace(/\s/g, '') === myName.replace(/\s/g, '')));
  const myOpen = openReports.filter(isMine);
  const myReqs = maintRequests.filter(isMine);
  const myLoans = currentDriver ? loans.filter((l) => !l.returnedAt && l.borrowerId === currentDriver.id) : [];

  return (
    <div>
      {currentDriver && (
        <div className="card dash-me" style={{ marginBottom: 14 }}>
          <h3 className="card-title">🪪 {myName} さんの状況</h3>
          {myOpen.length + myReqs.length + myLoans.length === 0 ? (
            <div className="dash-me-ok">✅ いま、あなたが対応するものはありません</div>
          ) : (
            <div className="alert-list">
              {myOpen.map((r) => (
                <div key={r.id} className={`alert-item ${r.date < today ? 'danger' : 'warn'}`}>
                  <span>🚗</span>
                  <div style={{ flex: 1 }}>
                    <strong>帰着登録がまだです</strong>　{r.date} {r.vehicleName}
                    {r.destination ? ` — ${r.destination}` : ''}
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={() => onReturnCheckin(r.id)}>
                    帰着登録する
                  </button>
                </div>
              ))}
              {myReqs.map((r) => (
                <div key={r.id} className="alert-item info">
                  <span>🔧</span>
                  <div style={{ flex: 1 }}>
                    <strong>整備依頼を出しています</strong>　{r.vehicleName}
                    {r.maintRequestType ? `（${r.maintRequestType}）` : ''}
                    {r.maintRequestScheduledDate ? `　修理予定 ${jpDate(r.maintRequestScheduledDate)}` : '　修理予定日は、まだ決まっていません'}
                  </div>
                </div>
              ))}
              {myLoans.map((l) => {
                const c = cards.find((x) => x.id === l.cardId);
                const late = isOverdue(l, today);
                return (
                  <div key={l.id} className={`alert-item ${late ? 'danger' : 'warn'}`}>
                    <span>{c ? cardKindIcon(c) : '💳'}</span>
                    <div style={{ flex: 1 }}>
                      <strong>カードを借りています</strong>　{c?.name || 'カード'}
                      {l.dueDate ? `（返却予定 ${l.dueDate}${late ? '・期限超過' : ''}）` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="card dash-intro" style={{ marginBottom: 14 }}>
        <h3 className="card-title" style={{ marginBottom: 4 }}>
          📊 ダッシュボード
        </h3>
        <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
          車検・点検・免許更新・アルコールチェックのアラート、帰着未登録の日報、整備依頼、貸出中のカードなどをまとめて確認できます。車両の使用・予約は「カレンダー」のページです。
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <WeatherAlertStrip />
      </div>

      <FleetTodayPanel data={data} onReturnCheckin={onReturnCheckin} onOpenCalendar={onOpenCalendar} />

      <DashboardNotices isAdmin={isAdmin} />

      {isAdmin && <IncidentsPanel />}

      {!hideOpenReports && (
      <DashSection
        id="open-reports"
        role={role}
        defaultOpen={openBy('admin', 'guest') || openReports.length > myOpen.length}
        title="🚙 帰着登録が済んでいない日報"
        badge={openReports.length > 0 && <span className="pill pill-amber" style={{ marginLeft: 8 }}>{openReports.length}件</span>}
      >
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
      </DashSection>
      )}

      <DashSection
        id="maint-requests"
        role={role}
        defaultOpen
        title="🔧 整備依頼（対応待ち）"
        badge={maintRequests.length > 0 && <span className="pill pill-red" style={{ marginLeft: 8 }}>{maintRequests.length}件</span>}
      >
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
                <div key={r.id} className={`alert-item req-item u-${urgencyLevel(r.maintRequestUrgency)} ${reqOpen.has(r.id) ? 'req-open' : ''}`}>
                  <span>🔧</span>
                  <div style={{ flex: 1 }}>
                    <strong>{r.vehicleName}</strong>
                    <span className="req-plate">{r.plate ? `（${r.plate}）` : ''}</span>— <ReqTypes r={r} />
                    {r.maintRequestWorking && (
                      <span className="pill req-working" style={{ marginLeft: 6 }} title={`${r.maintRequestWorkingAt || ''} ${r.maintRequestWorkingBy || ''}`.trim()}>
                        🔧 整備中
                      </span>
                    )}
                    <span className={`pill ${urgencyPill(r.maintRequestUrgency)}`} style={{ marginLeft: 6 }}>
                        {r.maintRequestUrgency || MAINT_URGENCIES[0]}
                      </span>
                    <div style={{ fontSize: 12, marginTop: 2 }}>
                      <span className="req-note">{r.maintRequestNote || '（内容の記入なし）'}</span>
                      <span className="req-by">　依頼: {r.date} {r.driver}</span>
                      {r.maintRequestScheduledDate && <span className="req-short-date">　📅 {jpDate(r.maintRequestScheduledDate)}</span>}
                      <div className="req-more">
                        <PhotoThumbs ids={r.maintRequestPhotos} />
                        <RequestSchedule report={r} mechanic={mechanic} isAdmin={isAdmin} onChanged={onRefresh} />
                        <div className="contact-row">
                          <ContactRequester report={r} mechanic={mechanic} show={Boolean(mechanic) || isAdmin} />
                        </div>
                      </div>
                    </div>
                    <button type="button" className="req-toggle" onClick={() => toggleReq(r.id)}>
                      {reqOpen.has(r.id) ? '▲ 閉じる' : '▼ 詳細・操作'}
                    </button>
                  </div>
                  <div className="alert-actions req-more" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
      </DashSection>

      {loans.some((l) => !l.returnedAt) && (
        <DashSection
          id="card-loans"
          role={role}
          defaultOpen={openBy('admin', 'guest')}
          title="💳 貸出中のガソリンカード・ETCカード"
          badge={<span className="pill pill-amber" style={{ marginLeft: 8 }}>{loans.filter((l) => !l.returnedAt).length}枚</span>}
        >
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
        </DashSection>
      )}

      {activeRentals.length > 0 && (
        <DashSection
          id="rentals"
          role={role}
          defaultOpen={openBy('admin', 'driver', 'guest')}
          title="🚗 レンタカーの利用・予約状況"
          badge={<span className="pill pill-amber" style={{ marginLeft: 8 }}>{activeRentals.length}台</span>}
        >
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
        </DashSection>
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
