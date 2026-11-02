// 車検証（自動車検査証）の写真をOCRした文字から、車両台帳に入れる項目を取り出す。
// OCRは読み違いが多いので、取り出せたものだけを返し、最後は必ず人が確認・修正する前提。

export type ShakenFields = {
  plate?: string; // 例: 品川 300 あ 12-34
  modelType?: string; // 型式
  shakenDate?: string; // 有効期間の満了する日 YYYY-MM-DD
  carName?: string; // 車名（トヨタ など）
  chassisNo?: string; // 車台番号
  firstRegistered?: string; // 初度登録年月 YYYY-MM
  capacity?: string; // 乗車定員
  grossWeight?: string; // 車両総重量
  displacement?: string; // 総排気量
  fuelType?: string; // 燃料の種類
};

const ERA_BASE: Record<string, number> = { 令和: 2018, 平成: 1988, 昭和: 1925 };

const pad = (n: number | string) => String(n).padStart(2, '0');

// 令和8年11月22日 → 2026-11-22（和暦・西暦どちらも）。読めなければ null。
export function parseJpDate(s: string): string | null {
  const t = s.normalize('NFKC').replace(/\s+/g, '');
  const era = t.match(/(令和|平成|昭和)(元|\d{1,2})年(\d{1,2})月(\d{1,2})日/);
  if (era) {
    const y = (era[2] === '元' ? 1 : Number(era[2])) + ERA_BASE[era[1]];
    return valid(y, Number(era[3]), Number(era[4]));
  }
  const west = t.match(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})/);
  if (west) return valid(Number(west[1]), Number(west[2]), Number(west[3]));
  return null;
}

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// ナンバーの比較用（空白・ハイフン・全角半角の違いを無視する）
export const normPlate = (s: string) => s.normalize('NFKC').replace(/[\s　\-ー‐−・]/g, '');

export function extractShakenFields(text: string): ShakenFields {
  const out: ShakenFields = {};
  const t = text.normalize('NFKC');
  const flat = t.replace(/[ \t　]+/g, ' ');

  // 登録番号／車両番号：地名 + 分類番号(3桁) + ひらがな + 一連番号
  const plate = flat.match(/([一-龠]{2,4}) ?(\d{3}) ?([ぁ-んヲ-ン]) ?[・.\-]? ?(\d{1,4})(?: ?[-ー・] ?(\d{1,2}))?/);
  if (plate) {
    let serial = plate[4];
    if (plate[5]) serial = `${plate[4]}-${plate[5]}`;
    else if (serial.length === 4) serial = `${serial.slice(0, 2)}-${serial.slice(2)}`;
    out.plate = `${plate[1]} ${plate[2]} ${plate[3]} ${serial}`;
  }

  // 型式（例: 3BF-GDH206K、DBA-ZVW30）
  const model = flat.match(/型式[ :：]*([A-Z0-9][A-Z0-9-]{2,14})/);
  if (model) out.modelType = model[1];

  // 車名（トヨタ、日産 など）
  const name = flat.match(/車名[ :：]*([一-龠ぁ-んァ-ヶー]{2,10})/);
  if (name) out.carName = name[1];

  // 車台番号（例: GDH206-1234567）
  const chassis = flat.match(/車台番号[ :：]*([A-Z0-9]{2,8}) ?-? ?(\d{4,8})/);
  if (chassis) out.chassisNo = `${chassis[1]}-${chassis[2]}`;

  // 初度登録年月（令和5年11月 → 2023-11）
  const first = flat.match(/初度登録年月[ :：]*(令和|平成|昭和) ?(元|\d{1,2}) ?年 ?(\d{1,2}) ?月/);
  if (first) {
    const y = (first[2] === '元' ? 1 : Number(first[2])) + ERA_BASE[first[1]];
    const m = Number(first[3]);
    if (m >= 1 && m <= 12) out.firstRegistered = `${y}-${pad(m)}`;
  }

  const cap = flat.match(/乗車定員[ :：]*(\d{1,2}) ?人/);
  if (cap) out.capacity = `${cap[1]}人`;

  const gw = flat.match(/車両総重量[ :：]*(\d{1,2}),?(\d{3}) ?kg/i);
  if (gw) out.grossWeight = `${gw[1]},${gw[2]}kg`;
  else {
    const gw2 = flat.match(/車両総重量[ :：]*(\d{3,5}) ?kg/i);
    if (gw2) out.grossWeight = `${Number(gw2[1]).toLocaleString('en-US')}kg`;
  }

  const disp = flat.match(/総排気量[^\d\n]{0,14}(\d+(?:\.\d+)?) ?(L|ℓ|cc|CC)?/);
  if (disp) out.displacement = `${disp[1]}${(disp[2] || 'L').replace('ℓ', 'L')}`;

  const fuel = flat.match(/燃料の種類[ :：]*(ガソリン|軽油|ディーゼル|電気|ハイブリッド|LPG|CNG|水素)/);
  if (fuel) out.fuelType = fuel[1];

  // 有効期間の満了する日：「有効期間」「満了」の近くの日付を優先し、無ければ全体でいちばん遅い日付
  const dateRe = /(令和|平成|昭和)\s*(?:元|\d{1,2})\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/g;
  const near = flat.match(/(?:有効期間|満了)[^]{0,40}?((?:令和|平成|昭和) ?(?:元|\d{1,2}) ?年 ?\d{1,2} ?月 ?\d{1,2} ?日)/);
  const nearDate = near ? parseJpDate(near[1]) : null;
  if (nearDate) out.shakenDate = nearDate;
  else {
    const all = [...flat.matchAll(dateRe)].map((m) => parseJpDate(m[0])).filter((x): x is string => !!x);
    if (all.length > 0) out.shakenDate = all.sort()[all.length - 1];
  }
  return out;
}
