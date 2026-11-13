import { AppData, Driver, Report, Vehicle } from './types';
import { daysUntil } from './utils';
import { DEFAULT_ALERT_SETTINGS, normalizeAlertSettings } from './alert-settings';

// ダッシュボードのアラートの条件。Web（AlertsPanel）とモバイルアプリで同じものを使う。
export type Alerts = {
  shaken: { v: Vehicle; days: number }[]; // 車検満了日まで設定日数以内（初期値30日。超過も含む）
  oil: Vehicle[]; // オイル交換の目安kmまで残り設定km以内（初期値1,000km）
  license: { d: Driver; days: number }[]; // 免許の更新期日まで設定日数以内（初期値30日。超過も含む）
  ngAlcohol: Report[]; // 出発前または帰着後の測定値が0より大きい日報
  total: number;
};

export function computeAlerts(data: Pick<AppData, 'vehicles' | 'drivers' | 'reports'> & { alertSettings?: AppData['alertSettings'] }): Alerts {
  const st = data.alertSettings ? normalizeAlertSettings(data.alertSettings) : DEFAULT_ALERT_SETTINGS;
  const shaken: Alerts['shaken'] = [];
  for (const v of data.vehicles) {
    const days = daysUntil(v.shakenDate);
    if (days !== null && days <= st.shakenDays) shaken.push({ v, days });
  }
  shaken.sort((a, b) => a.days - b.days);

  const oil = data.vehicles.filter((v) => v.oilKm - v.odometer <= st.oilKm);

  const license: Alerts['license'] = [];
  for (const d of data.drivers) {
    const days = daysUntil(d.licenseExpiry);
    if (days !== null && days <= st.licenseDays) license.push({ d, days });
  }
  license.sort((a, b) => a.days - b.days);

  const ngAlcohol = data.reports.filter(
    (r) => parseFloat(r.preAlcohol || '0') > 0 || (r.postDone && parseFloat(r.postAlcohol || '0') > 0)
  );

  return { shaken, oil, license, ngAlcohol, total: shaken.length + oil.length + license.length + ngAlcohol.length };
}
