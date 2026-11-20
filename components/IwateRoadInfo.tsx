'use client';

import { IWATE_CLOSURES, IWATE_LIVE_LINKS, IWATE_META } from '@/lib/traffic-iwate';

// 岩手県の規制・交通情報。季節の通行止めはページの中に、いまの規制・渋滞は公式のページへのボタンで。
export default function IwateRoadInfo() {
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
          <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 10 }}>毎日・毎時間かわる情報です。押すと、公式のページが別の画面で開きます（このアプリから自動で読み込むことが、できない情報です）。出発の前に確かめてください。</div>
          <div className="tr-links">
            {g.items.map((l) => (
              <a key={l.label} className="tr-link" href={l.url} target="_blank" rel="noopener noreferrer">
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
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
