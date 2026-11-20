// 取締り・オービス情報（交通安全のための情報）。
// このアプリは、オービスの位置や取締りの予定のデータを持っていない。出すのは、
//  (1) 公式・公開の情報を開くためのリンク（都道府県警の公開取締り情報の検索、地図での検索、道路交通情報）
//  (2) 社内で登録して共有する「注意地点」（オービス・取締りの多い場所・事故の多い場所など）
export const TRAFFIC_SPOTS_KEY = 'fleet:traffic-spots:v1';
export const TRAFFIC_SPOTS_MAX = 300;

export const SPOT_KINDS = [
  { key: 'orbis', icon: '📸', label: 'オービス（固定式）' },
  { key: 'mobile', icon: '🚓', label: '取締りの多い場所（移動式・ネズミ捕りなど）' },
  { key: 'stop', icon: '🛑', label: '一時停止・信号の取締り' },
  { key: 'accident', icon: '⚠️', label: '事故の多い場所・危ない場所' },
  { key: 'other', icon: '📍', label: 'その他' },
] as const;
export type SpotKind = (typeof SPOT_KINDS)[number]['key'];
export const spotKind = (k: string) => SPOT_KINDS.find((x) => x.key === k) || SPOT_KINDS[SPOT_KINDS.length - 1];

export type TrafficSpot = {
  id: string;
  kind: SpotKind;
  name: string; // 場所の名前（例：国道16号 ○○交差点の手前）
  road?: string; // 道路・方向（例：国道16号 上り）
  limit?: string; // 制限速度（例：60km/h）
  note?: string;
  lat?: number;
  lng?: number;
  by: string; // 登録した人
  byId?: string; // 登録した運転者のid（本人が消せるように）
  createdAt: string;
};

export const PREFECTURES = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];
// 都道府県の警察の呼び名（東京都＝警視庁、北海道＝北海道警察、ほかは「○○県警察」）
export const policeName = (pref: string) => (pref === '東京都' ? '警視庁' : pref === '北海道' ? '北海道警察' : `${pref}警察`);

const g = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
const m = (q: string) => `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
// 公式・公開の情報へのリンク（検索の形にして、行き先のURLを決め打ちしない）
export const trafficLinks = (pref: string) => [
  { icon: '🚓', label: `${policeName(pref)}の公開取締り情報`, note: '警察が公表している、取締りの日・場所の予定', url: g(`${policeName(pref)} 公開交通取締り 取締り情報`) },
  { icon: '📸', label: `${policeName(pref)}の速度違反自動取締装置（オービス）の案内`, note: '警察の案内ページを探します', url: g(`${policeName(pref)} 速度違反自動取締装置 設置`) },
  { icon: '🗺', label: '近くのオービスを地図で探す', note: 'Googleマップで「オービス」を検索します（登録されているものだけ）', url: m('オービス') },
  { icon: '🚧', label: '渋滞・通行止め・規制（道路交通情報）', note: '日本道路交通情報センター（JARTIC）', url: 'https://www.jartic.or.jp/' },
];
export const spotMapUrl = (s: Pick<TrafficSpot, 'name' | 'road' | 'lat' | 'lng'>) =>
  typeof s.lat === 'number' && typeof s.lng === 'number' ? `https://www.google.com/maps?q=${s.lat},${s.lng}` : m([s.road, s.name].filter(Boolean).join(' '));

export function cleanSpot(b: Record<string, unknown>): Omit<TrafficSpot, 'id' | 'by' | 'byId' | 'createdAt'> | null {
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const name = s(b.name, 80);
  if (!name) return null;
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  const hasPos = b.lat !== undefined && b.lat !== null && b.lat !== '' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const kind = SPOT_KINDS.some((k) => k.key === b.kind) ? (b.kind as SpotKind) : 'other';
  const road = s(b.road, 60);
  const limit = s(b.limit, 20);
  const note = s(b.note, 300);
  return { kind, name, ...(road ? { road } : {}), ...(limit ? { limit } : {}), ...(note ? { note } : {}), ...(hasPos ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 } : {}) };
}
