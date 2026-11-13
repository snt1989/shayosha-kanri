'use client';

import { AppData, Vehicle } from '@/lib/types';
import { computeAlerts } from '@/lib/alerts';
import { DEFAULT_ALERT_SETTINGS, normalizeAlertSettings } from '@/lib/alert-settings';
import { openMaintRequests } from '@/lib/utils';
import { useMobileLimit } from '@/lib/useLimit';

export type MaintPrefill = { vehicleId: string; type: string; note: string };

// マスタの整備種別から、キーワードを含むものを探す（無ければ空 → 入力画面では先頭の種別になる）
const findType = (types: string[], keyword: string) => types.find((t) => t.includes(keyword)) || '';

export default function AlertsPanel({
  data,
  standalone,
  onRequestMaint,
}: {
  data: AppData;
  standalone?: boolean;
  onRequestMaint?: (p: MaintPrefill) => void;
}) {
  // 条件は lib/alerts.ts（モバイルアプリと共通）
  const { shaken: shakenAlerts, oil: oilAlerts, license: licenseAlerts, ngAlcohol, total } = computeAlerts(data);
  const st = data.alertSettings ? normalizeAlertSettings(data.alertSettings) : DEFAULT_ALERT_SETTINGS;

  const shakenLim = useMobileLimit(shakenAlerts, 3);
  const oilLim = useMobileLimit(oilAlerts, 3);
  const licenseLim = useMobileLimit(licenseAlerts, 3);
  const pending = openMaintRequests(data.reports);
  // 同じ車両・同じ種類の依頼が対応待ちなら、「依頼済み」と表示して二重に出さない
  const requested = (vehicleId: string, type: string) =>
    pending.some((r) => r.vehicleId === vehicleId && (r.maintRequestType || '') === type);
  const requestUi = (v: Vehicle, keyword: string, note: string) => {
    if (!onRequestMaint) return null;
    const type = findType(data.masters.maintTypes, keyword);
    if (type && requested(v.id, type)) return <span className="pill pill-green">依頼済み</span>;
    return (
      <button className="btn btn-sm btn-primary" onClick={() => onRequestMaint({ vehicleId: v.id, type, note })}>
        🔧 整備を依頼
      </button>
    );
  };

  if (total === 0) {
    if (!standalone) return null;
    return (
      <div className="card">
        <div className="empty-state">🎉 現在、対応が必要なアラートはありません</div>
      </div>
    );
  }

  return (
    <div className="grid grid-2">
      <div className="card">
        <h3 className="card-title">⚠️ 車検・点検アラート（{st.shakenDays}日以内）</h3>
        {shakenAlerts.length === 0 ? (
          <div className="empty-state">直近の車検予定はありません</div>
        ) : (
          <div className="alert-list">
            {shakenLim.shown.map(({ v, days }) => (
              <div key={v.id} className={`alert-item ${days !== null && (days as number) < 0 ? 'danger' : 'warn'}`}>
                <span>🚗</span>
                <div style={{ flex: 1 }}>
                  <strong>{v.name}</strong>（{v.plate}）— 車検満了日 {v.shakenDate}
                  {days !== null && ((days as number) < 0 ? `（${-(days as number)}日超過）` : `（あと${days}日）`)}
                </div>
                {requestUi(v, '車検', `車検の満了日（${v.shakenDate}）が近いため、車検をお願いします。`)}
              </div>
            ))}
{shakenLim.more}
          </div>
        )}

        {oilAlerts.length > 0 && (
          <>
            <h3 className="card-title" style={{ marginTop: 18 }}>
              🛢️ オイル交換アラート（残り{st.oilKm.toLocaleString()}km以内）
            </h3>
            <div className="alert-list">
              {oilLim.shown.map((v) => (
                <div key={v.id} className="alert-item warn">
                  <span>🛢️</span>
                  <div style={{ flex: 1 }}>
                    <strong>{v.name}</strong> — 現在 {v.odometer.toLocaleString()}km / 交換目安{' '}
                    {v.oilKm.toLocaleString()}km
                  </div>
                  {requestUi(v, 'オイル', `オイル交換の目安（${v.oilKm.toLocaleString()}km）が近いため、オイル交換をお願いします。（現在 ${v.odometer.toLocaleString()}km）`)}
                </div>
              ))}
{oilLim.more}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">🪪 免許更新アラート（{st.licenseDays}日以内）</h3>
        {licenseAlerts.length === 0 ? (
          <div className="empty-state">直近の免許更新予定はありません</div>
        ) : (
          <div className="alert-list">
            {licenseLim.shown.map(({ d, days }) => (
              <div key={d.id} className={`alert-item ${days !== null && (days as number) < 0 ? 'danger' : 'warn'}`}>
                <span>🪪</span>
                <div>
                  <strong>
                    {d.lastName} {d.firstName}
                  </strong>
                  （{d.dept}）— 更新期日 {d.licenseExpiry}
                  {days !== null && ((days as number) < 0 ? `（${-(days as number)}日超過）` : `（あと${days}日）`)}
                </div>
              </div>
            ))}
{licenseLim.more}
          </div>
        )}

        {ngAlcohol.length > 0 && (
          <>
            <h3 className="card-title" style={{ marginTop: 18 }}>
              🍺 アルコールチェック 検知記録
            </h3>
            <div className="alert-list">
              {ngAlcohol.slice(0, 5).map((r) => (
                <div key={r.id} className="alert-item danger">
                  <span>🍺</span>
                  <div>
                    {r.date} {r.driver}（出発前 {r.preAlcohol}mg/L
                    {r.postDone ? ` / 帰着後 ${r.postAlcohol}mg/L` : ''}）
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
