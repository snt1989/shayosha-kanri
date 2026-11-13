'use client';

import { useState } from 'react';
import { Report } from '@/lib/types';
import { todayStr } from '@/lib/utils';
import { jpDate } from '@/lib/schedule-text';

// 整備依頼の「修理予定日」。決まっていれば日にちを表示し、整備士・管理者は決める・変える・取り消すができる。
// 決める（変える）と、全員向けのお知らせと、登録済みの端末への通知が出る。
export default function RequestSchedule({ report, mechanic, isAdmin, onChanged }: { report: Report; mechanic: string | null; isAdmin: boolean; onChanged?: () => void }) {
  const canSet = Boolean(mechanic) || isAdmin;
  const cur = report.maintRequestScheduledDate || '';
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(cur || todayStr());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function save(next: string) {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`/api/reports/${report.id}/maint-request/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: next, mechanic: mechanic || '' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.message || '保存できませんでした。');
      setEditing(false);
      setMsg(next ? (j.notified ? '決めました。みなさんに通知しました。' : '決めました。お知らせに出ました。') : '取り消しました。');
      window.dispatchEvent(new Event('fleet:notices-changed')); // お知らせの一覧を、すぐ更新する
      onChanged?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  if (!cur && !canSet) return null;
  return (
    <div className="req-schedule">
      {cur && <span className="pill pill-sky">📅 修理予定 {jpDate(cur)}</span>}
      {canSet && !editing && (
        <button type="button" className="btn btn-sm" onClick={() => { setDate(cur || todayStr()); setEditing(true); setMsg(''); }}>
          {cur ? '📅 予定日を変える' : '📅 修理予定日を決める'}
        </button>
      )}
      {canSet && editing && (
        <span className="req-schedule-edit">
          <input type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)} />
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !date} onClick={() => save(date)}>
            決める
          </button>
          {cur && (
            <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => save('')}>
              取り消す
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
            やめる
          </button>
        </span>
      )}
      {msg && <span className="req-schedule-msg">{msg}</span>}
      {canSet && editing && <div className="req-schedule-hint">決めると、「お知らせ」に出て（予定日まで）、みなさんの端末に通知が届きます。</div>}
    </div>
  );
}
