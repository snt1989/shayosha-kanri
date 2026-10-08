import { AppData, Driver, Report, Vehicle } from './types';
import { daysUntil } from './utils';

// ダッシュボードのアラートの条件。Web（AlertsPanel）とモバイルアプリで同じものを使う。
export type Alerts = {
  shaken: { v: Vehicle; days: number }[]; // 車検満了日まで30日以内（超過も含む）
  oil: Vehicle[]; // オイル交換の目安kmまで残り1,000km以内
  license: { d: Driver; days: number }[]; // 免許の更新期日まで30日以内（超過も含む）
  ngAlcohol: Report[]; // 出発前または帰着後の測定値が0より大きい日報
  total: number;
};

export function computeAlerts(data: Pick<AppData, 'vehicles' | 'drivers' | 'reports'>): Alerts {
  const shaken: Alerts['shaken'] = [];
  for (const v of data.vehicles) {
    const days = daysUntil(v.shakenDate);
    if (days !== null && days <= 30) shaken.push({ v, days });
  }
  shaken.sort((a, b) => a.days - b.days);

  const oil = data.vehicles.filter((v) => v.oilKm - v.odometer <= 1000);

  const license: Alerts['license'] = [];
  for (const d of data.drivers) {
    const days = daysUntil(d.licenseExpiry);
    if (days !== null && days <= 30) license.push({ d, days });
  }
  license.sort((a, b) => a.days - b.days);

  const ngAlcohol = data.reports.filter(
    (r) => parseFloat(r.preAlcohol || '0') > 0 || (r.postDone && parseFloat(r.postAlcohol || '0') > 0)
  );

  return { shaken, oil, license, ngAlcohol, total: shaken.length + oil.length + license.length + ngAlcohol.length };
}
