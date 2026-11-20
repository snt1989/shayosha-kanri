'use client';

import { AppData, Driver } from '@/lib/types';
import { daysUntil, openMaintRequests, tireBadge } from '@/lib/utils';
import Modal from './Modal';

// 車両のQRコード（ステッカー）を読み取ったときに開く画面。その車両でよく使う操作を、大きなボタンで出す。
export default function VehicleQuickModal({
  data,
  vehicleId,
  currentDriver,
  onClose,
  onDepart,
  onReturn,
  onMaint,
  onIncident,
}: {
  data: AppData;
  vehicleId: string;
  currentDriver: Driver | null;
  onClose: () => void;
  onDepart: () => void;
  onReturn: (reportId: string) => void;
  onMaint: () => void;
  onIncident: () => void;
}) {
  const v = data.vehicles.find((x) => x.id === vehicleId);
  if (!v) {
    return (
      <Modal title="車両が見つかりません" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>閉じる</button>}>
        <div className="notice-box">このQRコードの車両は、車両台帳に登録されていません（削除された可能性があります）。管理者にお知らせください。</div>
      </Modal>
    );
  }
  // 出庫中（帰着登録がまだ）の日報
  const trip = data.reports.find((r) => r.vehicleId === v.id && !r.postDone && !r.maintOnly);
  const reqs = openMaintRequests(data.reports).filter((r) => r.vehicleId === v.id);
  const shaken = daysUntil(v.shakenDate);
  const oilLeft = v.oilKm ? v.oilKm - v.odometer : null;
  const mine = trip && currentDriver && trip.driverId === currentDriver.id;

  return (
    <Modal title="🚙 この車両でできること" onClose={onClose} footer={<button className="btn" onClick={onClose}>閉じる</button>}>
      <div className="vq-head">
        <div className="vq-name">{v.name}</div>
        <div className="vq-sub">
          {v.plate}
          {v.modelType ? ` / ${v.modelType}` : ''}
        </div>
        <div className="vq-chips">
          {trip ? <span className="pill pill-amber">🚗 使用中：{trip.driver}さん（{trip.date}出発）</span> : <span className="pill pill-green">✓ 空いています</span>}
          <span className={`tire-now ${tireBadge(v.tire).kind}`}>{tireBadge(v.tire).icon} {tireBadge(v.tire).label}</span>
          {shaken !== null && <span className={`pill ${shaken < 0 ? 'pill-red' : shaken <= 30 ? 'pill-amber' : 'pill-slate'}`}>車検 {shaken < 0 ? `${-shaken}日超過` : `あと${shaken}日`}</span>}
          {oilLeft !== null && <span className={`pill ${oilLeft < 0 ? 'pill-red' : oilLeft <= 1000 ? 'pill-amber' : 'pill-slate'}`}>オイル {oilLeft < 0 ? `${(-oilLeft).toLocaleString()}km超過` : `残り${oilLeft.toLocaleString()}km`}</span>}
          {reqs.some((r) => r.maintRequestWorking) && <span className="pill req-working">🔧 整備中</span>}
          {reqs.length > 0 && <span className="pill pill-red">整備依頼 {reqs.length}件</span>}
        </div>
        {v.note && <div className="vq-note">📝 {v.note}</div>}
      </div>
      <div className="vq-actions">
        {trip ? (
          <button type="button" className="btn btn-primary vq-btn" onClick={() => onReturn(trip.id)}>
            <span className="vq-ic">🏁</span>
            <span><strong>帰着登録</strong><small>{mine ? 'あなたの出発の帰着を登録します' : `${trip.driver}さんの出発の帰着を登録します`}</small></span>
          </button>
        ) : (
          <button type="button" className="btn btn-primary vq-btn" onClick={onDepart}>
            <span className="vq-ic">🚗</span>
            <span><strong>この車両で出発登録</strong><small>運転前に、アルコールチェックと出発の入力をします</small></span>
          </button>
        )}
        <button type="button" className="btn vq-btn" onClick={onMaint}>
          <span className="vq-ic">🔧</span>
          <span><strong>整備・修理を依頼する</strong><small>気になる点（異音・警告灯・傷など）を伝えます</small></span>
        </button>
        <button type="button" className="btn btn-danger vq-btn" onClick={onIncident}>
          <span className="vq-ic">🆘</span>
          <span><strong>事故・故障・レッカー</strong><small>電話（レッカー・警察・救急・保険）と、会社への報告</small></span>
        </button>
      </div>
    </Modal>
  );
}
