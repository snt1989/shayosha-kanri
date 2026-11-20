'use client';

import { useMemo, useState } from 'react';
import { IWATE_META, IWATE_ORBIS, IWATE_ORBIS_SOURCE, IWATE_UNITS, iwateByRoad } from '@/lib/traffic-iwate';

// 岩手県の取締り・オービス情報。外のページを開かなくても、ここで読めるようにまとめたもの。
export default function IwateTrafficPanel() {
  const [view, setView] = useState<'road' | 'unit'>('road');
  const [q, setQ] = useState('');
  const roads = useMemo(() => iwateByRoad(), []);
  const s = q.trim();
  const hit = (...xs: (string | undefined)[]) => !s || xs.some((x) => (x || '').includes(s));
  const roadsShown = roads.map((g) => ({ ...g, items: g.items.filter((r) => hit(g.road, r.road, r.section, r.unit)) })).filter((g) => g.items.length > 0);
  const unitsShown = IWATE_UNITS.filter((u) => hit(u.name, ...u.routes.flatMap((r) => [r.road, r.section])));
  const orbisShown = IWATE_ORBIS.filter((o) => hit(o.road, o.place));
  const quick = ['東北自動車道', '国道4号', '国道45号', '国道46号', '国道106号', '国道107号', '国道283号'];

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="toolbar2">
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}>
              🚓 岩手県：速度取締りの重点路線
              <span className="pill pill-slate" style={{ marginLeft: 8 }}>
                {IWATE_META.edition}
              </span>
            </h3>
            <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
              岩手県警察が公表している「速度取締り指針」（高速隊と16の警察署）をまとめたものです。対象は{IWATE_META.period}。
            </div>
          </div>
          <div className="actions">
            <input className="search" placeholder="道路・地名・警察署で検索…" value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: '9px 12px', border: '1px solid var(--slate-300)', borderRadius: 8, minWidth: 200 }} />
          </div>
        </div>
        <div className="type-chips" style={{ marginBottom: 8 }}>
          <button type="button" className={`btn btn-sm ${view === 'road' ? 'btn-primary' : ''}`} aria-pressed={view === 'road'} onClick={() => setView('road')}>
            🛣 道路ごと
          </button>
          <button type="button" className={`btn btn-sm ${view === 'unit' ? 'btn-primary' : ''}`} aria-pressed={view === 'unit'} onClick={() => setView('unit')}>
            🏢 警察署ごと
          </button>
          <span className="iw-sep" aria-hidden="true" />
          {quick.map((r) => (
            <button key={r} type="button" className={`btn btn-sm ${q === r ? 'btn-primary' : ''}`} onClick={() => setQ(q === r ? '' : r)}>
              {r.replace('自動車道', '道')}
            </button>
          ))}
        </div>

        {view === 'road' ? (
          roadsShown.length === 0 ? (
            <div className="empty-state">当てはまる路線がありません</div>
          ) : (
            <div className="iw-roads">
              {roadsShown.map((g) => (
                <div key={g.road} className="iw-road">
                  <div className="iw-road-name">
                    {g.road}
                    <span className="pill pill-slate">{g.items.length}区間</span>
                  </div>
                  {g.items.map((r, i) => (
                    <div key={i} className="iw-row">
                      <div className="iw-sec">
                        {r.section || '（区間は原本で確認）'}
                        {r.limit && <span className="pill pill-red">制限 {r.limit}</span>}
                      </div>
                      <div className="iw-meta">
                        {r.time ? <span className="iw-time">🕒 {r.time}</span> : <span className="iw-time none">🕒 時間帯は原本で確認</span>}
                        <a href={r.pdf} target="_blank" rel="noopener noreferrer" className="iw-unit">
                          {r.unit} ↗
                        </a>
                      </div>
                      {r.reason && <div className="iw-reason">{r.reason}</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        ) : unitsShown.length === 0 ? (
          <div className="empty-state">当てはまる警察署がありません</div>
        ) : (
          <div className="iw-roads">
            {unitsShown.map((u) => (
              <div key={u.key} className="iw-road">
                <div className="iw-road-name">
                  {u.name}
                  <a href={u.pdf} target="_blank" rel="noopener noreferrer" className="iw-unit">
                    原本（PDF）↗
                  </a>
                </div>
                {u.routes.map((r, i) => (
                  <div key={i} className="iw-row">
                    <div className="iw-sec">
                      <strong>{r.road}</strong>　{r.section || '（区間は原本で確認）'}
                      {r.limit && <span className="pill pill-red">制限 {r.limit}</span>}
                    </div>
                    <div className="iw-meta">{r.time ? <span className="iw-time">🕒 {r.time}</span> : <span className="iw-time none">🕒 時間帯は原本で確認</span>}</div>
                    {r.reason && <div className="iw-reason">{r.reason}</div>}
                  </div>
                ))}
                {u.points.length > 0 && (
                  <ul className="iw-points">
                    {u.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="iw-foot">
          ※ 出典：
          <a href={IWATE_META.pageUrl} target="_blank" rel="noopener noreferrer">
            {IWATE_META.title}（{IWATE_META.edition}）
          </a>
          。{IWATE_META.collectedAt} に読み取ってまとめました。区間・時間帯・制限速度は、表から読み取ったもので、まちがいがあるかもしれません。正確な内容は、各警察署の原本で確かめてください。<strong>重点の場所・時間帯のほかでも、取締りは行われます。</strong>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="card-title" style={{ marginBottom: 4 }}>
          📸 岩手県：オービスの場所（参考）
          <span className="pill pill-amber" style={{ marginLeft: 8 }}>
            公式の情報ではありません
          </span>
        </h3>
        <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 10 }}>警察は、設置場所の一覧を公表していません。民間の投稿サイトに載っている地点です。いまも設置されているかは、確かめていません。</div>
        {orbisShown.length === 0 ? (
          <div className="empty-state">当てはまる地点がありません</div>
        ) : (
          <div className="iw-orbis">
            {orbisShown.map((o) => (
              <a key={o.road + o.place} className={`iw-ob ${o.fixed ? 'fixed' : 'mobile'}`} href={`https://www.google.com/maps/search/${encodeURIComponent(`岩手県${o.place.replace(/\s/g, '')} ${o.road.replace(/（.*?）/, '')}`)}`} target="_blank" rel="noopener noreferrer">
                <span className="iw-ob-kind">{o.fixed ? '📸 固定式' : '🚓 移動式'}</span>
                <strong>
                  {o.road}　{o.dir}
                </strong>
                <span className="iw-ob-place">{o.place}</span>
                <span className="iw-ob-type">
                  {o.type}　🗺 地図 ↗
                </span>
              </a>
            ))}
          </div>
        )}
        <div className="iw-foot">
          ※ 出典：
          <a href={IWATE_ORBIS_SOURCE.url} target="_blank" rel="noopener noreferrer">
            {IWATE_ORBIS_SOURCE.name}
          </a>
          （{IWATE_META.collectedAt} に見た内容）。移動式（可搬式）は、通学路や生活道路など、ここに無い場所でも使われます。
        </div>
      </div>
    </>
  );
}
