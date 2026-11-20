'use client';

import { useState } from 'react';
import { IWATE_CLOSURES, IWATE_LIVE_LINKS, IWATE_META } from '@/lib/traffic-iwate';

// 岩手県の規制・交通情報。季節の通行止めはページの中に、いまの規制・渋滞は公式のページへのボタンで。
export default function IwateRoadInfo() {
  const [open, setOpen] = useState<string | null>(null);
  const cur = IWATE_LIVE_LINKS.flatMap((g) => g.items).find((l) => l.url === open);
  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="card-title" style={{ marginBottom: 4 }}>
          ⛔ この冬の通行止め（岩手県）
        </h3>
        <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 10 }}>冬の間、通れない道です。公式の発表を見てまとめました。天候や路面で、期間が変わることがあります。</div>
        <div className="rd-closures">
          {IWATE_CLOSURES.map((c) => (
            <div key={c.road} className="rd-closure">
              <div className="rd-c-head">⛔ {c.road}</div>
              <div className="rd-c-sec">{c.section}</div>
              <div className="rd-c-period">📅 {c.period}</div>
              {c.note && <div className="rd-c-note">{c.note}</div>}
              <a className="iw-unit" href={c.source.url} target="_blank" rel="noopener noreferrer">
                出典：{c.source.name} ↗
              </a>
            </div>
          ))}
        </div>
        <div className="iw-foot">
          ※ ここに無い県道・林道・峠道にも、冬期通行止めがあります。全部の区間は、下の「冬期通行止めの地図」「冬期通行不能区間」で確かめてください。（{IWATE_META.collectedAt} にまとめた内容）
        </div>
      </div>

      {IWATE_LIVE_LINKS.map((g) => (
        <div key={g.group} className="card" style={{ marginBottom: 14 }}>
          <h3 className="card-title" style={{ marginBottom: 4 }}>
            {g.group === '通行止め・規制（いま）' ? '🚧 ' : '🚗 '}
            {g.group}
          </h3>
          <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 10 }}>毎日・毎時間かわる情報です。押すと、公式のページが別の画面で開きます。「アプリ内で見る」で、このページの中にも表示できます（公式サイトの都合で表示されないことがあります）。出発の前に確かめてください。</div>
          <div className="tr-links">
            {g.items.map((l) => (
              <div key={l.label}>
              <a className="tr-link" href={l.url} target="_blank" rel="noopener noreferrer">
                <span className="tr-link-ic" aria-hidden="true">
                  {l.icon}
                </span>
                <span>
                  <strong>{l.label}</strong>
                  <small>{l.note}</small>
                </span>
                <span className="tr-link-go" aria-hidden="true">
                  ↗
                </span>
              </a>
              <button type="button" className="btn btn-sm" style={{ margin: '4px 0 8px' }} onClick={() => setOpen(open === l.url ? null : l.url)}>
                {open === l.url ? '▲ 閉じる' : '▼ アプリ内で見る'}
              </button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {cur && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 className="card-title" style={{ marginBottom: 4 }}>{cur.icon} {cur.label}</h3>
          <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 8 }}>
            何も表示されないときは、公式サイトがこの形での表示を許していません。<a href={cur.url} target="_blank" rel="noopener noreferrer">別の画面で開く ↗</a>
          </div>
          <iframe src={cur.url} title={cur.label} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style={{ width: '100%', height: 560, border: '1px solid var(--slate-200, #e2e8f0)', borderRadius: 8 }} />
        </div>
      )}
    </>
  );
}
