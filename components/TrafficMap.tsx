'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { LayerGroup, Map as LMap } from 'leaflet';
import { IWATE_CLOSURES, IWATE_META, IWATE_ORBIS, IWATE_UNITS, orbisGeo } from '@/lib/traffic-iwate';
import { TrafficSpot, spotKind } from '@/lib/traffic';

type LayerKey = 'enf' | 'orbis' | 'closure' | 'spots';
const LAYERS: { key: LayerKey; label: string; color: string }[] = [
  { key: 'enf', label: '🚓 取締りの重点区間', color: '#ea580c' },
  { key: 'orbis', label: '📸 オービス（参考）', color: '#dc2626' },
  { key: 'closure', label: '⛔ 冬期通行止め', color: '#7c3aed' },
  { key: 'spots', label: '📍 社内の注意地点', color: '#0369a1' },
];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const pref = (p: string) => (p.startsWith('岩手県') ? p : `岩手県${p}`);
const gmap = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

// 取締り・規制・注意地点を、1枚の地図に重ねて表示する（国土地理院の地図）。
// 位置は、地名から引いたおおよその位置。重点区間は、区間の両端を直線で結んだ目安（実際の道の形ではない）。
export default function TrafficMap({ spots }: { spots: TrafficSpot[] }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const groups = useRef<Partial<Record<LayerKey, LayerGroup>>>({});
  const me = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [geo, setGeo] = useState<Record<string, [number, number] | null>>({});
  const [on, setOn] = useState<Record<LayerKey, boolean>>({ enf: true, orbis: true, closure: true, spots: true });
  const [msg, setMsg] = useState('');

  const places = useMemo(() => {
    const set = new Set<string>();
    for (const u of IWATE_UNITS) for (const r of u.routes) for (const g of r.geo || []) set.add(pref(g));
    for (const o of IWATE_ORBIS) set.add(pref(orbisGeo(o)));
    for (const c of IWATE_CLOSURES) for (const g of c.geo) set.add(pref(g));
    return [...set];
  }, []);

  // 地図をつくる（はじめの1回）
  useEffect(() => {
    let alive = true;
    (async () => {
      const L = (await import('leaflet')).default;
      if (!alive || !box.current || map.current) return;
      const m = L.map(box.current, { center: [39.65, 141.25], zoom: 8, scrollWheelZoom: false, tap: true } as L.MapOptions);
      L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>',
      }).addTo(m);
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

  // 重ねる印をつくり直す
  useEffect(() => {
    if (!ready || !map.current) return;
    let alive = true;
    (async () => {
      const L = (await import('leaflet')).default;
      if (!alive || !map.current) return;
      for (const g of Object.values(groups.current)) g?.remove();
      const at = (p: string) => geo[pref(p)] || null;
      const dot = (lat: number, lng: number, color: string, r: number, html: string) =>
        L.circleMarker([lat, lng], { radius: r, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 }).bindPopup(html, { maxWidth: 260 });

      const enf = L.layerGroup();
      for (const u of IWATE_UNITS) {
        for (const r of u.routes) {
          const pts = (r.geo || []).map(at).filter((x): x is [number, number] => Boolean(x));
          if (pts.length === 0) continue;
          const html = `<div class="tm-pop"><b>🚓 ${esc(r.road)}</b><br>${esc(r.section || '')}${r.limit ? `<br>制限 ${esc(r.limit)}` : ''}<br>🕒 ${esc(r.time || '時間帯は原本で確認')}<br><span class="tm-sub">${esc(u.name)}${r.reason ? `：${esc(r.reason)}` : ''}</span><br><a href="${esc(u.pdf)}" target="_blank" rel="noopener">原本（PDF）↗</a></div>`;
          if (pts.length > 1) L.polyline(pts, { color: '#ea580c', weight: 5, opacity: 0.75, dashArray: '8 6' }).bindPopup(html, { maxWidth: 260 }).addTo(enf);
          for (const p of pts) dot(p[0], p[1], '#ea580c', 6, html).addTo(enf);
        }
      }
      const orbis = L.layerGroup();
      for (const o of IWATE_ORBIS) {
        const p = at(orbisGeo(o));
        if (!p) continue;
        dot(p[0], p[1], o.fixed ? '#dc2626' : '#2563eb', 8, `<div class="tm-pop"><b>${o.fixed ? '📸 オービス（固定式）' : '🚓 移動式（見かけた報告）'}</b><br>${esc(o.road)} ${esc(o.dir)}<br>${esc(o.place)}<br><span class="tm-sub">${esc(o.type)}・民間サイトの情報（参考）</span><br><a href="${gmap(p[0], p[1])}" target="_blank" rel="noopener">Googleマップで開く ↗</a></div>`).addTo(orbis);
      }
      const closure = L.layerGroup();
      for (const c of IWATE_CLOSURES) {
        const p = c.geo.map(at).find(Boolean);
        if (!p) continue;
        L.marker(p, { icon: L.divIcon({ className: 'tm-x', html: '⛔', iconSize: [26, 26], iconAnchor: [13, 13] }) })
          .bindPopup(`<div class="tm-pop"><b>⛔ ${esc(c.road)}</b><br>${esc(c.section)}<br>${esc(c.period)}${c.note ? `<br><span class="tm-sub">${esc(c.note)}</span>` : ''}<br><a href="${esc(c.source.url)}" target="_blank" rel="noopener">${esc(c.source.name)} ↗</a></div>`, { maxWidth: 260 })
          .addTo(closure);
      }
      const sp = L.layerGroup();
      for (const s of spots) {
        if (typeof s.lat !== 'number' || typeof s.lng !== 'number') continue;
        const k = spotKind(s.kind);
        L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'tm-spot', html: k.icon, iconSize: [28, 28], iconAnchor: [14, 14] }) })
          .bindPopup(`<div class="tm-pop"><b>${k.icon} ${esc(s.name)}</b>${s.road ? `<br>${esc(s.road)}` : ''}${s.limit ? `<br>制限 ${esc(s.limit)}` : ''}${s.note ? `<br>${esc(s.note)}` : ''}<br><span class="tm-sub">社内で登録：${esc(s.by)}</span></div>`, { maxWidth: 260 })
          .addTo(sp);
      }
      groups.current = { enf, orbis, closure, spots: sp };
      for (const l of LAYERS) if (on[l.key]) groups.current[l.key]?.addTo(map.current);
    })();
    return () => {
      alive = false;
    };
  }, [ready, geo, spots, on]);

  function locate() {
    if (!map.current || !('geolocation' in navigator)) return setMsg('この端末では、いまの場所を取得できません。');
    setMsg('いまの場所を取得しています…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const L = (await import('leaflet')).default;
        if (!map.current) return;
        me.current?.remove();
        const p: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        me.current = L.layerGroup([L.circleMarker(p, { radius: 9, color: '#fff', weight: 3, fillColor: '#16a34a', fillOpacity: 1 }).bindPopup('いまの場所')]).addTo(map.current);
        map.current.setView(p, 12);
        setMsg('');
      },
      () => setMsg('いまの場所を取得できませんでした（位置情報の許可を確かめてください）。'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const count = (k: LayerKey) =>
    k === 'enf'
      ? IWATE_UNITS.reduce((n, u) => n + u.routes.filter((r) => (r.geo || []).some((g) => geo[pref(g)])).length, 0)
      : k === 'orbis'
        ? IWATE_ORBIS.filter((o) => geo[pref(orbisGeo(o))]).length
        : k === 'closure'
          ? IWATE_CLOSURES.filter((c) => c.geo.some((g) => geo[pref(g)])).length
          : spots.filter((s) => typeof s.lat === 'number').length;

  return (
    <div>
      <div className="tm-bar">
        {LAYERS.map((l) => (
          <button key={l.key} type="button" className={`tm-chip${on[l.key] ? ' on' : ''}`} aria-pressed={on[l.key]} style={{ ['--c' as string]: l.color }} onClick={() => setOn({ ...on, [l.key]: !on[l.key] })}>
            <span className="tm-sw" aria-hidden="true" />
            {l.label} <b>{count(l.key)}</b>
          </button>
        ))}
        <button type="button" className="btn btn-sm" onClick={locate} style={{ marginLeft: 'auto' }}>
          📍 いまの場所
        </button>
      </div>
      <div ref={box} className="tm-map" role="region" aria-label="取締り・規制の地図" />
      {msg && (
        <div className="notice-box" role="status" style={{ marginTop: 8 }}>
          {msg}
        </div>
      )}
      <div className="iw-foot">
        印を押すと、くわしい内容が出ます。位置は、地名から引いた<strong>おおよその位置</strong>です。取締りの重点区間は、区間の両端を直線で結んだ目安で、実際の道の形ではありません（高速道路の区間は、地図には出していません。「取締り・オービス」で見てください）。取締りは{IWATE_META.title}（{IWATE_META.edition}）、オービスは民間サイトの情報（参考）です。
      </div>
    </div>
  );
}
