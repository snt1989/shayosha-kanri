'use client';

import { useState } from 'react';
import type { AppData } from '@/lib/types';
import { TODAY_LABEL, TodayState, fleetToday } from '@/lib/fleet-today';
import { tireBadge, todayStr } from '@/lib/utils';

const ORDER: TodayState[] = ['out', 'reserved', 'back', 'maint', 'idle'];
const short = (name: string) => name.split(/[（(]/)[0].trim() || name;
const sub = (name: string) => (name.match(/[（(](.+?)[）)]/) || [])[1] || '';

// ダッシュボードの「今日の車両の動き」。1台を1枚のタイルにして、色で状態がわかるようにする。
export default function FleetTodayPanel({ data, onReturnCheckin, onOpenCalendar }: { data: AppData; onReturnCheckin: (id: string) => void; onOpenCalendar: () => void }) {
  const today = todayStr();
  const list = fleetToday(data, today);
  const [filter, setFilter] = useState<TodayState | ''>('');
  if (list.length === 0) return null;
  const count = (s: TodayState) => list.filter((x) => x.state === s).length;
  const shown = filter ? list.filter((x) => x.state === filter) : list;
  const d = new Date();
  const dateText = `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`;

  return (
    <div className="card ft-card" style={{ marginBottom: 14 }}>
      <h3 className="card-title ft-title">
        <span>🚦 今日の車両の動き</span>
        <span className="ft-date">{dateText}</span>
      </h3>
      <div className="ft-summary" role="group" aria-label="状態で絞り込み">
        <button type="button" className={`ft-chip all${filter === '' ? ' on' : ''}`} aria-pressed={filter === ''} onClick={() => setFilter('')}>
          全 {list.length}台
        </button>
        {ORDER.filter((s) => count(s) > 0).map((s) => (
          <button key={s} type="button" className={`ft-chip ${s}${filter === s ? ' on' : ''}`} aria-pressed={filter === s} onClick={() => setFilter(filter === s ? '' : s)}>
            {TODAY_LABEL[s].icon} {TODAY_LABEL[s].label} <strong>{count(s)}</strong>
          </button>
        ))}
      </div>
      <div className="ft-bar" aria-hidden="true">
        {ORDER.filter((s) => count(s) > 0).map((s) => (
          <span key={s} className={`ft-seg ${s}`} style={{ flexGrow: count(s) }} />
        ))}
      </div>
      <div className="ft-grid">
        {shown.map((v) => {
          const tb = tireBadge(data.vehicles.find((x) => x.id === v.id)?.tire);
          return (
            <div key={v.id} className={`ft-tile ${v.state}${v.overdue ? ' overdue' : ''}`}>
              <div className="ft-head">
                <span className="ft-state">
                  {TODAY_LABEL[v.state].icon} {v.overdue ? '帰着登録がまだ' : TODAY_LABEL[v.state].label}
                </span>
                <span className="ft-tire" title={tb.label}>
                  {tb.icon}
                </span>
              </div>
              <div className="ft-name">{short(v.name)}</div>
              <div className="ft-plate">
                {sub(v.name) ? `${sub(v.name)}・` : ''}
                {v.plate}
              </div>
              <div className="ft-body">
                {v.state === 'out' && v.trip && (
                  <>
                    <div className="ft-who">👤 {v.trip.driver}</div>
                    <div className="ft-line">
                      {v.overdue ? `${Number(v.trip.date.slice(5, 7))}/${Number(v.trip.date.slice(8, 10))} ` : ''}
                      {v.trip.preTime} 出発{v.trip.destination ? ` → ${v.trip.destination}` : ''}
                    </div>
                    <button type="button" className="btn btn-sm ft-btn" onClick={() => onReturnCheckin(v.trip!.id)}>
                      🏁 帰着登録
                    </button>
                  </>
                )}
                {v.state === 'back' && (
                  <>
                    <div className="ft-who">👤 {[...new Set(v.trips.map((t) => t.driver))].join('、')}</div>
                    <div className="ft-line">
                      今日 {v.trips.length}回・{v.km.toLocaleString()}km
                      {v.trips[v.trips.length - 1]?.postTime ? `（${v.trips[v.trips.length - 1].postTime} 帰着）` : ''}
                    </div>
                  </>
                )}
                {v.state === 'reserved' && (
                  <>
                    <div className="ft-who">👤 {v.reservations[0].driver}</div>
                    <div className="ft-line">
                      {v.reservations[0].startDate === today ? v.reservations[0].startTime : '前日'}〜{v.reservations[0].endDate === today ? v.reservations[0].endTime : '翌日以降'}
                      {v.reservations[0].destination ? ` → ${v.reservations[0].destination}` : ''}
                      {v.reservations.length > 1 ? `　ほか${v.reservations.length - 1}件` : ''}
                    </div>
                  </>
                )}
                {v.state === 'maint' && <div className="ft-line">今日は使えません（{v.maintType || '整備'}）</div>}
                {v.state === 'idle' && <div className="ft-line">今日は、まだ動いていません</div>}
                {v.state !== 'reserved' && v.reservations.length > 0 && v.state !== 'maint' && (
                  <div className="ft-note">
                    📅 予約 {v.reservations[0].startDate === today ? v.reservations[0].startTime : ''}〜 {v.reservations[0].driver}
                  </div>
                )}
                {v.openRequests > 0 && <div className="ft-note warn">🔧 整備依頼 {v.openRequests}件</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="ft-foot">
        <span>色：<b className="ft-dot out" />走行中　<b className="ft-dot reserved" />予約あり　<b className="ft-dot back" />帰着済み　<b className="ft-dot maint" />整備　<b className="ft-dot idle" />待機中</span>
        <button type="button" className="btn btn-sm" onClick={onOpenCalendar}>
          📅 カレンダーで見る
        </button>
      </div>
    </div>
  );
}
