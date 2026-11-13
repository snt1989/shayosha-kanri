'use client';

import { useCallback, useEffect, useState } from 'react';
import { Incident } from '@/lib/incidents';
import { PhotoThumbs } from './PhotoField';

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ダッシュボードの「事故・トラブルの報告」（管理者のみ）。対応中のものを上に出し、対応済にしたり、メモを残したりできる。
export default function IncidentsPanel() {
  const [list, setList] = useState<Incident[] | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/incidents', { cache: 'no-store' });
      const j = await res.json();
      if (res.ok && j.success) setList(j.incidents || []);
    } catch {
      // 読み込めなければ、今ある表示のまま
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  async function patch(id: string, body: object) {
    await fetch(`/api/incidents/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await load();
  }
  async function remove(i: Incident) {
    if (!confirm(`${fmt(i.at)} ${i.driver} さんの報告を削除しますか？`)) return;
    await fetch(`/api/incidents/${i.id}`, { method: 'DELETE' });
    await load();
  }

  if (list === null) return null;
  const open = list.filter((i) => i.status === 'open');
  const done = list.filter((i) => i.status === 'done');
  if (list.length === 0) return null;

  const item = (i: Incident) => (
    <div key={i.id} className={`alert-item ${i.status === 'open' ? 'danger' : ''} incident-item`}>
      <span>🚨</span>
      <div style={{ flex: 1 }}>
        <strong>
          {fmt(i.at)} {i.driver}
        </strong>
        {i.vehicleName ? `（${i.vehicleName}${i.plate ? ' ' + i.plate : ''}）` : ''} — {i.kind}
        <span className={`pill ${i.injury === 'けが人あり' ? 'pill-red' : 'pill-slate'}`} style={{ marginLeft: 6 }}>
          {i.injury}
        </span>
        {i.police && <span className="pill pill-sky" style={{ marginLeft: 4 }}>警察連絡済</span>}
        {i.otherParty && <span className="pill pill-amber" style={{ marginLeft: 4 }}>相手あり</span>}
        {!i.canDrive && <span className="pill pill-red" style={{ marginLeft: 4 }}>走行不可</span>}
        <div style={{ fontSize: 12, marginTop: 2 }}>
          {i.place && (
            <div>
              場所：{i.place}
              {i.lat !== undefined && i.lng !== undefined && (
                <>
                  {' '}
                  <a href={`https://www.google.com/maps?q=${i.lat},${i.lng}`} target="_blank" rel="noreferrer">
                    地図で見る
                  </a>
                </>
              )}
            </div>
          )}
          {i.note && <div>{i.note}</div>}
          <PhotoThumbs ids={i.photos} />
          {i.status === 'done' && i.doneAt && <div style={{ color: 'var(--slate-500)' }}>対応済：{fmt(i.doneAt)}</div>}
          <input
            className="incident-memo"
            defaultValue={i.memo || ''}
            maxLength={500}
            placeholder="対応メモ（保険会社へ連絡済み、修理の手配など）"
            onBlur={(e) => e.target.value.trim() !== (i.memo || '') && patch(i.id, { memo: e.target.value })}
          />
        </div>
      </div>
      <div className="alert-actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={() => patch(i.id, { status: i.status === 'open' ? 'done' : 'open' })}>
          {i.status === 'open' ? '✓ 対応済にする' : '対応中に戻す'}
        </button>
        <button className="btn btn-sm btn-danger" onClick={() => remove(i)}>
          削除
        </button>
      </div>
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 className="card-title">
        🚨 事故・トラブルの報告
        {open.length > 0 && <span className="pill pill-red" style={{ marginLeft: 8 }}>対応中 {open.length}件</span>}
      </h3>
      {open.length === 0 ? <div className="empty-state">対応中の報告はありません</div> : <div className="alert-list">{open.map(item)}</div>}
      {done.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-sm" onClick={() => setShowDone(!showDone)}>
            {showDone ? '対応済を隠す' : `対応済を見る（${done.length}件）`}
          </button>
          {showDone && <div className="alert-list" style={{ marginTop: 8 }}>{done.map(item)}</div>}
        </div>
      )}
    </div>
  );
}
