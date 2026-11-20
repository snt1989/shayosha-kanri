'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import type { Map as LMap, Marker, TileLayer } from 'leaflet';
import { IWATE_CLOSURES, IWATE_META, IWATE_ORBIS, IWATE_UNITS, orbisGeo } from '@/lib/traffic-iwate';
import { TrafficSpot, spotKind } from '@/lib/traffic';

type Kind = 'enf' | 'orbis' | 'mobile' | 'closure' | 'spot';
const KINDS: { key: Kind; label: string; icon: string; color: string }[] = [
  { key: 'enf', label: '取締りの重点区間', icon: '🚓', color: '#ea580c' },
  { key: 'orbis', label: 'オービス（固定式）', icon: '📸', color: '#dc2626' },
  { key: 'mobile', label: '移動式の目撃', icon: '🚨', color: '#2563eb' },
  { key: 'closure', label: '冬期通行止め', icon: '⛔', color: '#7c3aed' },
  { key: 'spot', label: '社内の注意地点', icon: '📍', color: '#0f766e' },
];
const BASES = [
  { key: 'pale', label: '淡色', url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', max: 18 },
  { key: 'std', label: '標準', url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', max: 18 },
  { key: 'photo', label: '写真', url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', max: 18 },
] as const;
type BaseKey = (typeof BASES)[number]['key'];
const AREAS: { label: string; center: [number, number]; zoom: number }[] = [
  { label: '県全体', center: [39.6, 141.35], zoom: 8 },
  { label: '盛岡周辺', center: [39.7, 141.15], zoom: 11 },
  { label: '県北', center: [40.15, 141.35], zoom: 10 },
  { label: '県南', center: [39.15, 141.15], zoom: 10 },
  { label: '沿岸', center: [39.6, 141.85], zoom: 9 },
];

type Item = { id: string; kind: Kind; title: string; sub: string; lat: number; lng: number; html: string };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const pref = (p: string) => (p.startsWith('岩手県') ? p : `岩手県${p}`);
const gmap = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;
const kindOf = (k: Kind) => KINDS.find((x) => x.key === k)!;

// 取締り・規制・注意地点を、1枚の地図に表示する（国土地理院の地図）。
// 位置は、地名から引いたおおよその位置。重点区間の印は、区間の両端のまんなかに置いた目安。
export default function TrafficMap({ spots }: { spots: TrafficSpot[] }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const base = useRef<TileLayer | null>(null);
  const cluster = useRef<{ clearLayers: () => void; addLayer: (m: Marker) => void; zoomToShowLayer: (m: Marker, cb: () => void) => void } | null>(null);
  const markers = useRef<Record<string, Marker>>({});
  const [ready, setReady] = useState(false);
  const [geo, setGeo] = useState<Record<string, [number, number] | null>>({});
  const [on, setOn] = useState<Record<Kind, boolean>>({ enf: true, orbis: true, mobile: true, closure: true, spot: true });
  const [baseKey, setBaseKey] = useState<BaseKey>('pale');
  const [full, setFull] = useState(false);
  // 一覧は、広い画面では地図の横に出す。スマホでは、はじめは閉じておく（地図を大きく見せる）
  const [listOpen, setListOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 900);
  const [msg, setMsg] = useState('');

  const places = useMemo(() => {
    const set = new Set<string>();
    for (const u of IWATE_UNITS) for (const r of u.routes) for (const g of r.geo || []) set.add(pref(g));
    for (const o of IWATE_ORBIS) set.add(pref(orbisGeo(o)));
    for (const c of IWATE_CLOSURES) for (const g of c.geo) set.add(pref(g));
    return [...set];
  }, []);

  // 地図に出すもの（位置がわかったものだけ）
  const items = useMemo<Item[]>(() => {
    const at = (p: string) => geo[pref(p)] || null;
    const out: Item[] = [];
    IWATE_UNITS.forEach((u, ui) =>
      u.routes.forEach((r, ri) => {
        const pts = (r.geo || []).map(at).filter((x): x is [number, number] => Boolean(x));
        if (pts.length === 0) return;
        const lat = pts.reduce((n, p) => n + p[0], 0) / pts.length;
        const lng = pts.reduce((n, p) => n + p[1], 0) / pts.length;
        out.push({
          id: `e${ui}-${ri}`,
          kind: 'enf',
          title: `${r.road.replace(/（.*?）/g, '')}　${r.section || ''}`,
          sub: `${r.time ? `🕒 ${r.time}　` : ''}${u.name}`,
          lat,
          lng,
          html: `<div class="tm-pop"><div class="tm-pop-h" style="--c:#ea580c">🚓 取締りの重点区間</div><b>${esc(r.road)}</b><br>${esc(r.section || '（区間は原本で確認）')}${r.limit ? `<br>制限 <b>${esc(r.limit)}</b>` : ''}<br>🕒 ${esc(r.time || '時間帯は原本で確認')}${r.reason ? `<div class="tm-sub">${esc(r.reason)}</div>` : ''}<div class="tm-sub">${esc(u.name)}（${esc(IWATE_META.edition)}）・印は区間のおおよそのまんなか</div><a href="${esc(u.pdf)}" target="_blank" rel="noopener">原本（PDF）↗</a></div>`,
        });
      })
    );
    IWATE_ORBIS.forEach((o, i) => {
      const p = at(orbisGeo(o));
      if (!p) return;
      out.push({
        id: `o${i}`,
        kind: o.fixed ? 'orbis' : 'mobile',
        title: `${o.road.replace(/（.*?）/g, '')}　${o.dir}`,
        sub: o.place,
        lat: p[0],
        lng: p[1],
        html: `<div class="tm-pop"><div class="tm-pop-h" style="--c:${o.fixed ? '#dc2626' : '#2563eb'}">${o.fixed ? '📸 オービス（固定式）' : '🚨 移動式オービスの目撃'}</div><b>${esc(o.road)}　${esc(o.dir)}</b><br>${esc(o.place)}<div class="tm-sub">${esc(o.type)}・民間サイトの情報（参考）・おおよその位置</div><a href="${gmap(p[0], p[1])}" target="_blank" rel="noopener">Googleマップで開く ↗</a></div>`,
      });
    });
    IWATE_CLOSURES.forEach((c, i) => {
      const p = c.geo.map(at).find(Boolean);
      if (!p) return;
      out.push({
        id: `c${i}`,
        kind: 'closure',
        title: c.road.replace(/（.*?）/g, ''),
        sub: c.period,
        lat: p[0],
        lng: p[1],
        html: `<div class="tm-pop"><div class="tm-pop-h" style="--c:#7c3aed">⛔ 冬期通行止め</div><b>${esc(c.road)}</b><br>${esc(c.section)}<br>📅 ${esc(c.period)}${c.note ? `<div class="tm-sub">${esc(c.note)}</div>` : ''}<a href="${esc(c.source.url)}" target="_blank" rel="noopener">${esc(c.source.name)} ↗</a></div>`,
      });
    });
    spots.forEach((s) => {
      if (typeof s.lat !== 'number' || typeof s.lng !== 'number') return;
      const k = spotKind(s.kind);
      out.push({
        id: `s${s.id}`,
        kind: 'spot',
        title: s.name,
        sub: `${k.label.split('（')[0]}${s.road ? `・${s.road}` : ''}`,
        lat: s.lat,
        lng: s.lng,
        html: `<div class="tm-pop"><div class="tm-pop-h" style="--c:#0f766e">${k.icon} 社内の注意地点</div><b>${esc(s.name)}</b>${s.road ? `<br>${esc(s.road)}` : ''}${s.limit ? `<br>制限 <b>${esc(s.limit)}</b>` : ''}${s.note ? `<br>${esc(s.note)}` : ''}<div class="tm-sub">登録：${esc(s.by)}</div><a href="${gmap(s.lat, s.lng)}" target="_blank" rel="noopener">Googleマップで開く ↗</a></div>`,
      });
    });
    return out;
  }, [geo, spots]);
  const shown = items.filter((x) => on[x.kind]);

  // 地図をつくる（はじめの1回）
  useEffect(() => {
    let alive = true;
    (async () => {
      const L = (await import('leaflet')).default;
      (window as unknown as { L: typeof L }).L = L; // まとめ表示の部品が、L を使うため
      await import('leaflet.markercluster');
      if (!alive || !box.current || map.current) return;
      const m = L.map(box.current, { center: AREAS[0].center, zoom: AREAS[0].zoom, scrollWheelZoom: false, zoomControl: false });
      L.control.zoom({ position: 'bottomright' }).addTo(m);
      base.current = L.tileLayer(BASES[0].url, { maxZoom: BASES[0].max, attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>' }).addTo(m);
      const mc = (L as unknown as { markerClusterGroup: (o: object) => typeof cluster.current & { addTo: (m: LMap) => void } }).markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 42,
        spiderfyOnMaxZoom: true,
        // まとめた丸のふちを、中にある印の種類の色で塗り分ける（何がまとまっているか、わかるように）
        iconCreateFunction: (c: { getChildCount: () => number; getAllChildMarkers: () => { options: { kind?: Kind } }[] }) => {
          const n: Partial<Record<Kind, number>> = {};
          for (const m of c.getAllChildMarkers()) if (m.options.kind) n[m.options.kind] = (n[m.options.kind] || 0) + 1;
          const total = c.getChildCount();
          let acc = 0;
          const stops = KINDS.filter((k) => n[k.key]).map((k) => {
            const from = (acc / total) * 360;
            acc += n[k.key] || 0;
            return `${k.color} ${from}deg ${(acc / total) * 360}deg`;
          });
          return L.divIcon({ className: 'tm-cl', html: `<span style="background:conic-gradient(${stops.join(',')})"><b>${total}</b></span>`, iconSize: [40, 40] });
        },
      });
      mc.addTo(m);
      cluster.current = mc;
      // 地図をクリックしたら、ホイールでの拡大・縮小を使えるようにする（ページのスクロールのじゃまをしない）
      m.on('click', () => m.scrollWheelZoom.enable());
      m.on('mouseout', () => m.scrollWheelZoom.disable());
      map.current = m;
      setReady(true);
    })().catch(() => setMsg('地図を読み込めませんでした。'));
    return () => {
      alive = false;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // 地名 → 位置（サーバーが国土地理院に問い合わせ、結果を保存して使い回す）
  useEffect(() => {
    let alive = true;
    const ask = async (n: number) => {
      try {
        const j = await (await fetch('/api/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: places }) })).json();
        if (!alive || !j?.success) return;
        setGeo((cur) => ({ ...cur, ...j.geo }));
        if (j.pending > 0 && n < 3) setTimeout(() => ask(n + 1), 800);
      } catch {
        if (alive) setMsg('地図の位置の一部を読み込めませんでした。社内の注意地点だけを表示しています。');
      }
    };
    ask(0);
    return () => {
      alive = false;
    };
  }, [places]);

  // 地図の種類（淡色・標準・写真）
  useEffect(() => {
    const b = BASES.find((x) => x.key === baseKey)!;
    base.current?.setUrl(b.url);
  }, [baseKey]);

  // 印をつくり直す
  useEffect(() => {
    if (!ready || !cluster.current) return;
    let alive = true;
    (async () => {
      const L = (await import('leaflet')).default;
      if (!alive || !cluster.current) return;
      cluster.current.clearLayers();
      markers.current = {};
      for (const it of shown) {
        const k = kindOf(it.kind);
        const mk = L.marker([it.lat, it.lng], {
          icon: L.divIcon({ className: 'tm-pin-wrap', html: `<div class="tm-pin" style="--c:${k.color}"><span>${k.icon}</span></div>`, iconSize: [34, 42], iconAnchor: [17, 40], popupAnchor: [0, -36] }),
          title: it.title,
          kind: it.kind,
        } as L.MarkerOptions).bindPopup(it.html, { maxWidth: 280 });
        cluster.current.addLayer(mk);
        markers.current[it.id] = mk;
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready, shown]);

  // 全画面にしたら、地図の大きさを合わせる
  useEffect(() => {
    const t = setTimeout(() => map.current?.invalidateSize(), 60);
    document.body.style.overflow = full ? 'hidden' : '';
    return () => {
      clearTimeout(t);
      document.body.style.overflow = '';
    };
  }, [full, listOpen]);

  function focus(it: Item) {
    const mk = markers.current[it.id];
    if (!mk || !cluster.current || !map.current) return;
    cluster.current.zoomToShowLayer(mk, () => {
      map.current?.setView([it.lat, it.lng], Math.max(map.current.getZoom(), 12));
      mk.openPopup();
    });
  }
  function locate() {
    if (!map.current || !('geolocation' in navigator)) return setMsg('この端末では、いまの場所を取得できません。');
    setMsg('いまの場所を取得しています…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const L = (await import('leaflet')).default;
        if (!map.current) return;
        const p: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        L.circleMarker(p, { radius: 9, color: '#fff', weight: 3, fillColor: '#16a34a', fillOpacity: 1 }).bindPopup('いまの場所').addTo(map.current);
        map.current.setView(p, 12);
        setMsg('');
      },
      () => setMsg('いまの場所を取得できませんでした（位置情報の許可を確かめてください）。'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const count = (k: Kind) => items.filter((x) => x.kind === k).length;

  return (
    <div className={`tm-wrap${full ? ' full' : ''}`}>
      <div className="tm-top">
        <div className="tm-layers" role="group" aria-label="表示する印">
          {KINDS.map((k) => (
            <button key={k.key} type="button" className={`tm-chip${on[k.key] ? ' on' : ''}`} aria-pressed={on[k.key]} style={{ ['--c' as string]: k.color }} onClick={() => setOn({ ...on, [k.key]: !on[k.key] })}>
              <span className="tm-chip-ic">{k.icon}</span>
              {k.label}
              <b>{count(k.key)}</b>
            </button>
          ))}
        </div>
        <div className="tm-tools">
          <div className="tm-seg" role="group" aria-label="場所へ移る">
            {AREAS.map((a) => (
              <button key={a.label} type="button" onClick={() => map.current?.setView(a.center, a.zoom)}>
                {a.label}
              </button>
            ))}
          </div>
          <div className="tm-seg" role="group" aria-label="地図の種類">
            {BASES.map((b) => (
              <button key={b.key} type="button" className={baseKey === b.key ? 'on' : ''} aria-pressed={baseKey === b.key} onClick={() => setBaseKey(b.key)}>
                {b.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-sm" onClick={locate}>
            📍 いまの場所
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setListOpen(!listOpen)}>
            {listOpen ? '☰ 一覧を閉じる' : '☰ 一覧'}
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setFull(!full)}>
            {full ? '✕ 全画面を閉じる' : '⛶ 全画面'}
          </button>
        </div>
      </div>
      <div className={`tm-body${listOpen ? ' with-list' : ''}`}>
        <div ref={box} className="tm-map" role="region" aria-label="交通・取締りの地図" />
        {listOpen && (
          <div className="tm-list" aria-label="地図の印の一覧">
            {shown.length === 0 ? (
              <div className="empty-state">表示する印がありません</div>
            ) : (
              KINDS.filter((k) => on[k.key] && count(k.key) > 0).map((k) => (
                <div key={k.key} className="tm-list-g">
                  <div className="tm-list-h" style={{ ['--c' as string]: k.color }}>
                    {k.icon} {k.label}（{count(k.key)}）
                  </div>
                  {shown
                    .filter((x) => x.kind === k.key)
                    .map((it) => (
                      <button key={it.id} type="button" className="tm-li" style={{ ['--c' as string]: k.color }} onClick={() => focus(it)}>
                        <strong>{it.title}</strong>
                        <small>{it.sub}</small>
                      </button>
                    ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {msg && (
        <div className="notice-box" role="status" style={{ marginTop: 8 }}>
          {msg}
        </div>
      )}
      {!full && (
        <div className="iw-foot">
          印を押すと、くわしい内容が出ます。近くにある印は、数字の丸にまとまります（押すと広がります）。一覧の項目を押すと、その場所へ移ります。位置は、地名から引いた<strong>おおよその位置</strong>で、取締りの重点区間の印は、区間のまんなかの目安です（高速道路の区間は、地図に出していません）。取締りは{IWATE_META.title}（{IWATE_META.edition}）、オービスは民間サイトの情報（参考）です。
        </div>
      )}
    </div>
  );
}
