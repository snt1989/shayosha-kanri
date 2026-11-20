'use client';

import { JMA_URLS } from '@/lib/jma';
import { hm, useLiveWeather, weatherIcon } from './useLiveWeather';

const LEVEL_LABEL = { special: '特別警報', danger: '危険警報', warning: '警報', advisory: '注意報' } as const;
const dayLabel = (d: string, i: number) => (i === 0 ? '今日' : i === 1 ? '明日' : 'あさって') + `（${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}）`;

// 「規制・交通情報」の上に出す、いまの気象警報・注意報と天気予報（気象庁の公開データを、5分ごとに読み直す）
export default function LiveWeatherPanel() {
  const { data, loading, error, reload } = useLiveWeather();
  const w = data?.warning;
  const f = data?.forecast;
  const active = (w?.areas || []).filter((a) => a.warns.length > 0);

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="toolbar2">
        <div>
          <h3 className="card-title" style={{ marginBottom: 4 }}>
            🌤 天気・気象警報（いま）
            <span className="pill pill-green" style={{ marginLeft: 8 }}>
              自動で更新
            </span>
          </h3>
          <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
            気象庁（盛岡地方気象台）の発表を、このアプリの中に表示します。開いている間は5分ごとに読み直します。
            {data && `　最終確認 ${hm(data.fetchedAt)}`}
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-sm" onClick={reload} disabled={loading}>
            {loading ? '読み込み中…' : '↻ 更新'}
          </button>
        </div>
      </div>
      {error && <div className="notice-box">{error}</div>}
      {!data && !error && <div className="empty-state">読み込み中…</div>}

      {data && (
        <>
          <div className="lw-sec-title">
            ⚠️ 警報・注意報 {w?.reportDatetime && <small>（{hm(w.reportDatetime)} 発表）</small>}
          </div>
          {!w ? (
            <div className="notice-box">警報・注意報を読み込めませんでした。気象庁のページで確かめてください。</div>
          ) : active.length === 0 ? (
            <div className="lw-none">✅ いま、岩手県に発表中の警報・注意報はありません</div>
          ) : (
            <div className="lw-areas">
              {active.map((a) => (
                <div key={a.code} className="lw-area">
                  <div className="lw-area-name">{a.name}</div>
                  <div className="lw-warns">
                    {a.warns.map((x) => (
                      <span key={x.code} className={`lw-warn ${x.level}`} title={x.towns.join('、')}>
                        {x.road ? '🚗 ' : ''}
                        {x.name}
                      </span>
                    ))}
                  </div>
                  {a.warns.some((x) => x.towns.length > 0) && (
                    <details className="lw-towns">
                      <summary>市町村ごとに見る</summary>
                      {a.warns.map((x) => (
                        <div key={x.code}>
                          <b>{x.name}</b>：{x.towns.join('、') || '—'}
                        </div>
                      ))}
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
          {w?.headline && <div className="lw-headline">📣 {w.headline}</div>}
          {w?.anyRoad && <div className="lw-road">🚗 の付いたものは、雪・風・視界などで運転に影響が出やすいものです。出発の前に、道路の通行止め・規制も確かめてください。</div>}

          <div className="lw-sec-title" style={{ marginTop: 14 }}>
            🗓 天気予報 {f?.reportDatetime && <small>（{hm(f.reportDatetime)} 発表）</small>}
          </div>
          {!f ? (
            <div className="notice-box">天気予報を読み込めませんでした。</div>
          ) : (
            <>
              <div className="lw-fc">
                {f.areas.map((a) => (
                  <div key={a.code} className="lw-fc-area">
                    <div className="lw-area-name">{a.name}</div>
                    {a.days.map((d, i) => (
                      <div key={d.date} className="lw-day">
                        <span className="lw-day-l">{dayLabel(d.date, i)}</span>
                        <span className="lw-ic" aria-hidden="true">
                          {weatherIcon(d.weather)}
                        </span>
                        <span className="lw-wx">{d.weather}</span>
                        {d.pop && <span className="lw-pop">☔ {d.pop}%</span>}
                      </div>
                    ))}
                    {a.wind && <div className="lw-wind">💨 今日：{a.wind}</div>}
                  </div>
                ))}
              </div>
              {f.temps.length > 0 && (
                <div className="lw-temps">
                  {f.temps.map((t) => (
                    <div key={t.name} className="lw-temp">
                      <b>{t.name}</b>
                      {t.todayMax && <span>今日 最高 {t.todayMax}℃</span>}
                      {(t.tomorrowMin || t.tomorrowMax) && (
                        <span>
                          明日 <i className={Number(t.tomorrowMin) <= 0 ? 'lw-cold' : ''}>{t.tomorrowMin ?? '-'}℃</i> / {t.tomorrowMax ?? '-'}℃
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {f.temps.some((t) => Number(t.tomorrowMin) <= 0) && <div className="lw-road">❄️ 明日の朝は、0℃以下の予想の地点があります。橋の上・日陰・峠道の路面凍結に注意してください。</div>}
            </>
          )}
          <div className="iw-foot">
            出典：
            <a href={JMA_URLS.page} target="_blank" rel="noopener noreferrer">
              気象庁 岩手県の警報・注意報
            </a>
            ・
            <a href={JMA_URLS.forecastPage} target="_blank" rel="noopener noreferrer">
              天気予報
            </a>
            （気象庁のホームページのデータを使っています）
          </div>
        </>
      )}
    </div>
  );
}

// ダッシュボード・交通のページの上に出す、短い知らせ（運転に影響する警報・注意報が出ているときだけ）
export function WeatherAlertStrip({ onOpen }: { onOpen?: () => void }) {
  const { data } = useLiveWeather();
  const road = (data?.warning?.areas || []).flatMap((a) => a.warns.filter((w) => w.road || w.level !== 'advisory').map((w) => ({ ...w, area: a.name })));
  if (road.length === 0) return null;
  const names = [...new Set(road.map((w) => w.name))];
  const severe = road.some((w) => w.level !== 'advisory');
  return (
    <button type="button" className={`lw-strip${severe ? ' severe' : ''}`} onClick={onOpen}>
      <span aria-hidden="true">{severe ? '🚨' : '⚠️'}</span>
      <span>
        <b>{names.join('・')}</b> が発表されています（{[...new Set(road.map((w) => w.area))].join('・')}）。運転に注意してください。
      </span>
      {onOpen && <span className="lw-strip-go">くわしく ›</span>}
    </button>
  );
}
