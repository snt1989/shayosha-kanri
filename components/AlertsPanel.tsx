'use client';

import { AppData } from '@/lib/types';
import { computeAlerts } from '@/lib/alerts';

export default function AlertsPanel({ data, standalone }: { data: AppData; standalone?: boolean }) {
  // 条件は lib/alerts.ts（モバイルアプリと共通）
  const { shaken: shakenAlerts, oil: oilAlerts, license: licenseAlerts, ngAlcohol, total } = computeAlerts(data);

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
        <h3 className="card-title">⚠️ 車検・点検アラート（30日以内）</h3>
        {shakenAlerts.length === 0 ? (
          <div className="empty-state">直近の車検予定はありません</div>
        ) : (
          <div className="alert-list">
            {shakenAlerts.map(({ v, days }) => (
              <div key={v.id} className={`alert-item ${days !== null && (days as number) < 0 ? 'danger' : 'warn'}`}>
                <span>🚗</span>
                <div>
                  <strong>{v.name}</strong>（{v.plate}）— 車検満了日 {v.shakenDate}
                  {days !== null && ((days as number) < 0 ? `（${-(days as number)}日超過）` : `（あと${days}日）`)}
                </div>
              </div>
            ))}
          </div>
        )}

        {oilAlerts.length > 0 && (
          <>
            <h3 className="card-title" style={{ marginTop: 18 }}>
              🛢️ オイル交換アラート（残り1,000km以内）
            </h3>
            <div className="alert-list">
              {oilAlerts.map((v) => (
                <div key={v.id} className="alert-item warn">
                  <span>🛢️</span>
                  <div>
                    <strong>{v.name}</strong> — 現在 {v.odometer.toLocaleString()}km / 交換目安{' '}
                    {v.oilKm.toLocaleString()}km
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">🪪 免許更新アラート（30日以内）</h3>
        {licenseAlerts.length === 0 ? (
          <div className="empty-state">直近の免許更新予定はありません</div>
        ) : (
          <div className="alert-list">
            {licenseAlerts.map(({ d, days }) => (
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
