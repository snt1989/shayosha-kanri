'use client';

import { AppData } from '@/lib/types';
import { daysUntil, todayStr } from '@/lib/utils';
import { DEFAULT_ALERT_SETTINGS, normalizeAlertSettings } from '@/lib/alert-settings';

export default function StatBar({ data }: { data: AppData }) {
  const st = data.alertSettings ? normalizeAlertSettings(data.alertSettings) : DEFAULT_ALERT_SETTINGS;
  const today = todayStr();
  const todayReports = data.reports.filter((r) => !r.maintOnly && r.date === today);
  const doneCount = todayReports.filter((r) => r.postDone).length;
  const outCount = todayReports.length - doneCount;

  const shakenSoon = data.vehicles.filter((v) => {
    const d = daysUntil(v.shakenDate);
    return d !== null && d <= st.shakenDays;
  }).length;

  const licenseSoon = data.drivers.filter((d) => {
    const days = daysUntil(d.licenseExpiry);
    return days !== null && days <= st.licenseDays;
  }).length;

  return (
    <div className="grid grid-4">
      <div className="stat-tile">
        <div className="label">登録日報件数</div>
        <div className="value">
          {todayReports.length} <small>件</small>
        </div>
        <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 4 }}>
          完了: {doneCount}件 / 運行中: {outCount}件
        </div>
      </div>
      <div className="stat-tile">
        <div className="label">登録運転者・免許管理</div>
        <div className="value">
          {data.drivers.length} <small>名</small>
        </div>
        <div style={{ fontSize: 11, color: licenseSoon > 0 ? 'var(--amber-600)' : 'var(--slate-500)', marginTop: 4 }}>
          {licenseSoon > 0 ? `更新期日 ${licenseSoon}件接近` : '更新接近なし'}
        </div>
      </div>
      <div className={`stat-tile ${shakenSoon > 0 ? 'warn' : ''}`}>
        <div className="label">車検・点検アラート</div>
        <div className="value">
          {shakenSoon} <small>台が{st.shakenDays}日以内</small>
        </div>
        <div style={{ fontSize: 11, color: shakenSoon > 0 ? 'var(--amber-600)' : 'var(--slate-500)', marginTop: 4 }}>
          {shakenSoon > 0 ? '期日接近あり' : '期日接近なし'}
        </div>
      </div>
      <div className="stat-tile">
        <div className="label">登録車両</div>
        <div className="value">
          {data.vehicles.length} <small>台</small>
        </div>
        <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 4 }}>走行積算自動連動</div>
      </div>
    </div>
  );
}
