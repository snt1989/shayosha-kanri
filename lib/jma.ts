// 気象庁の公開データ（ホームページが使っているJSON）から、岩手県の警報・注意報と天気予報を読む。
// ※ 気象庁が仕様を約束しているAPIではない。形が変わったら、ここを直す。
//   警報：https://www.jma.go.jp/bosai/warning/data/r8/030000.json（令和8年5月28日からの新しい形。旧の /warning/030000.json は更新が止まっている）
//   予報：https://www.jma.go.jp/bosai/forecast/data/forecast/030000.json
//   地域名：https://www.jma.go.jp/bosai/common/const/area.json
export const JMA_OFFICE = '030000'; // 岩手県（盛岡地方気象台）
export const JMA_URLS = {
  warning: `https://www.jma.go.jp/bosai/warning/data/r8/${JMA_OFFICE}.json`,
  forecast: `https://www.jma.go.jp/bosai/forecast/data/forecast/${JMA_OFFICE}.json`,
  area: 'https://www.jma.go.jp/bosai/common/const/area.json',
  page: `https://www.jma.go.jp/bosai/warning/#area_type=offices&area_code=${JMA_OFFICE}`,
  forecastPage: `https://www.jma.go.jp/bosai/forecast/#area_type=offices&area_code=${JMA_OFFICE}`,
};

// 警報・注意報のコード（気象庁 防災情報XML 別表3 による。令和8年5月からの新しい形）
const NAMES: Record<string, string> = {
  '02': '暴風雪警報', '03': '大雨警報', '04': '洪水警報', '05': '暴風警報', '06': '大雪警報', '07': '波浪警報', '08': '高潮警報', '09': '土砂災害警報',
  '10': '大雨注意報', '12': '大雪注意報', '13': '風雪注意報', '14': '雷注意報', '15': '強風注意報', '16': '波浪注意報', '17': '融雪注意報', '18': '洪水注意報',
  '19': '高潮注意報', '20': '濃霧注意報', '21': '乾燥注意報', '22': 'なだれ注意報', '23': '低温注意報', '24': '霜注意報', '25': '着氷注意報', '26': '着雪注意報',
  '27': 'その他の注意報', '29': '土砂災害注意報', '32': '暴風雪特別警報', '33': '大雨特別警報', '35': '暴風特別警報', '36': '大雪特別警報', '37': '波浪特別警報',
  '38': '高潮特別警報', '39': '土砂災害特別警報', '43': '大雨危険警報', '48': '高潮危険警報', '49': '土砂災害危険警報',
};
// 運転にかかわりの大きいもの（雪・風・視界・路面）
const ROAD = new Set(['02', '05', '06', '12', '13', '15', '20', '22', '23', '25', '26', '32', '35', '36', '03', '43', '33']);
export type WarnLevel = 'special' | 'danger' | 'warning' | 'advisory';
export const levelOf = (code: string): WarnLevel => {
  const n = Number(code);
  if (n >= 32 && n <= 39) return 'special';
  if (n >= 40) return 'danger';
  if (n <= 9) return 'warning';
  return 'advisory';
};
export const warnName = (code: string) => NAMES[code] || `警報・注意報（コード${code}）`;

export type ActiveWarn = { code: string; name: string; level: WarnLevel; road: boolean; status: string; towns: string[] };
export type AreaWarns = { code: string; name: string; warns: ActiveWarn[] };
export type WeatherDay = { date: string; weather: string; pop?: string; tempMin?: string; tempMax?: string };
export type AreaWeather = { code: string; name: string; days: WeatherDay[]; wind?: string };
export type CityTemp = { name: string; todayMax?: string; tomorrowMin?: string; tomorrowMax?: string };
export type LiveWeather = {
  fetchedAt: string;
  warning: { reportDatetime: string; headline: string; areas: AreaWarns[]; anyRoad: boolean } | null;
  forecast: { reportDatetime: string; areas: AreaWeather[]; temps: CityTemp[] } | null;
  errors: string[];
};

type Area = { name: string; parent?: string };
type AreaConst = { class10s: Record<string, Area>; class20s: Record<string, Area>; class15s?: Record<string, Area> };

const isActive = (status?: string) => Boolean(status && status !== '解除' && !status.includes('なし'));
const order = (l: WarnLevel) => ({ special: 0, danger: 1, warning: 2, advisory: 3 })[l];

// 警報・注意報の JSON から、いま出ているものを地域（内陸・沿岸北部・沿岸南部）ごとにまとめる
export function parseWarnings(raw: unknown, area: AreaConst | null): LiveWeather['warning'] {
  if (!Array.isArray(raw)) return null;
  type Item = { reportDatetime?: string; headlineText?: string; warning?: { class10Items?: { areaCode: string; kinds: { code?: string; status?: string }[] }[]; class20Items?: { areaCode: string; kinds: { code?: string; status?: string }[] }[] } };
  const items = raw as Item[];
  const latest = items.map((x) => x.reportDatetime || '').sort().pop() || '';
  const headline = items.find((x) => x.reportDatetime === latest)?.headlineText || '';
  const by10 = new Map<string, Map<string, ActiveWarn>>();
  const name10 = (c: string) => area?.class10s?.[c]?.name || c;
  // 市町村の親（一次細分区域）をたどる：class20 → class15 → class10
  const parent10 = (c20: string) => {
    const p15 = area?.class20s?.[c20]?.parent;
    const p10 = p15 ? area?.class15s?.[p15]?.parent : undefined;
    return p10 || '';
  };
  for (const it of items) {
    for (const a of it.warning?.class10Items || []) {
      for (const k of a.kinds || []) {
        if (!k.code || !isActive(k.status)) continue;
        const m = by10.get(a.areaCode) || new Map();
        if (!m.has(k.code)) m.set(k.code, { code: k.code, name: warnName(k.code), level: levelOf(k.code), road: ROAD.has(k.code), status: k.status || '', towns: [] });
        by10.set(a.areaCode, m);
      }
    }
    for (const a of it.warning?.class20Items || []) {
      for (const k of a.kinds || []) {
        if (!k.code || !isActive(k.status)) continue;
        const p = parent10(a.areaCode);
        const m = by10.get(p) || new Map();
        const w = m.get(k.code) || { code: k.code, name: warnName(k.code), level: levelOf(k.code), road: ROAD.has(k.code), status: k.status || '', towns: [] };
        const town = area?.class20s?.[a.areaCode]?.name;
        if (town && !w.towns.includes(town)) w.towns.push(town);
        m.set(k.code, w);
        if (p) by10.set(p, m);
      }
    }
  }
  const codes = Object.keys(area?.class10s || {}).filter((c) => c.startsWith('0300'));
  const all10 = [...new Set([...codes, ...by10.keys()])].filter(Boolean).sort();
  const areas = all10.map((c) => ({ code: c, name: name10(c), warns: [...(by10.get(c)?.values() || [])].sort((a, b) => order(a.level) - order(b.level) || a.code.localeCompare(b.code)) }));
  return { reportDatetime: latest, headline, areas, anyRoad: areas.some((a) => a.warns.some((w) => w.road)) };
}

// 天気予報の JSON から、今日・明日・あさっての天気と、主な地点の気温を取り出す
export function parseForecast(raw: unknown): LiveWeather['forecast'] {
  if (!Array.isArray(raw) || !raw[0]) return null;
  type TS = { timeDefines: string[]; areas: { area: { name: string; code: string }; weathers?: string[]; winds?: string[]; pops?: string[]; temps?: string[]; tempsMin?: string[]; tempsMax?: string[] }[] };
  const r0 = raw[0] as { reportDatetime: string; timeSeries: TS[] };
  const ts = r0.timeSeries || [];
  const w = ts[0];
  const pops = ts[1];
  const temps = ts[2];
  const day = (iso: string) => iso.slice(0, 10);
  const areas: AreaWeather[] = (w?.areas || []).map((a) => {
    const days: WeatherDay[] = (w.timeDefines || []).map((t, i) => ({ date: day(t), weather: (a.weathers?.[i] || '').replace(/　/g, ' ') }));
    // 降水確率は、その日の6時間ごとの最大
    const pa = pops?.areas.find((x) => x.area.code === a.area.code);
    for (const d of days) {
      const vals = (pops?.timeDefines || []).map((t, i) => (day(t) === d.date ? Number(pa?.pops?.[i]) : NaN)).filter((n) => Number.isFinite(n));
      if (vals.length) d.pop = String(Math.max(...vals));
    }
    return { code: a.area.code, name: a.area.name, days, wind: (a.winds?.[0] || '').replace(/　/g, ' ') };
  });
  // 主な地点の気温。時刻が 09:00 の値はその日の最高、00:00 の値はその日の最低（発表の時刻によって、入っている日が変わる）
  const today = day(r0.reportDatetime);
  const cities: CityTemp[] = (temps?.areas || []).map((a) => {
    const out: CityTemp = { name: a.area.name };
    (temps?.timeDefines || []).forEach((t, i) => {
      const v = a.temps?.[i];
      if (!v) return;
      const d = day(t);
      const h = t.slice(11, 13);
      if (d === today && h === '09') out.todayMax = v;
      else if (d > today && h === '00') out.tomorrowMin = v;
      else if (d > today && h === '09') out.tomorrowMax = v;
    });
    return out;
  });
  return { reportDatetime: r0.reportDatetime, areas, temps: cities };
}
