// 車検証の「項目名」と「値」が、表のマス目のように上下・左右に並んでいるとき、
// 文字の位置（座標）を使って、項目名とその値を組み合わせる。
// 文字を1本につなげただけの文章だと、項目名がずらっと並んだあとに値が並ぶ、といった並びで読み違えるため。
// PDFの文字（pdf.js）とOCRの単語（Tesseract.js）のどちらにも使えるよう、座標つきの文字（Box）を受け取る。
// y は下向きに大きくなる座標。

export type Box = { text: string; x0: number; y0: number; x1: number; y1: number };

const CJK = /[぀-ヿ一-鿿々]/;

// 項目名（これと一致する文字は「値」として使わない）
const KNOWN_LABELS = [
  '自動車登録番号又は車両番号', '登録番号又は車両番号', '車両番号', '登録年月日', '交付年月日', '初度登録年月',
  '自動車の種別', '用途', '自家用・事業用の別', '自家用', '事業用', '車体の形状', '車名', '乗車定員', '最大積載量',
  '車両重量', '車両総重量', '車台番号', '長さ', '幅', '高さ', '前前軸重', '前後軸重', '後前軸重', '後後軸重',
  '型式', '原動機の型式', '総排気量又は定格出力', '総排気量', '燃料の種類', '型式指定番号', '類別区分番号',
  '所有者の氏名又は名称', '所有者の住所', '使用者の氏名又は名称', '使用者の住所', '使用の本拠の位置',
  '有効期間の満了する日', '有効期間', '備考', 'CC', 'cc',
];
const labelKey = (s: string) => s.normalize('NFKC').replace(/\s+/g, '');
const isLabelText = (s: string) => {
  const k = labelKey(s);
  if (!k) return false;
  return KNOWN_LABELS.some((l) => k === l) || /^(?:所有者|使用者|使用の本拠)/.test(k);
};

// 取り出したい項目の、項目名の見分け方と、出力する名前
const TARGETS: { name: string; test: (k: string) => boolean; len: number }[] = [
  { name: '車両番号', test: (k) => /^(?:自動車)?登録番号又は車両番号/.test(k) || k === '車両番号', len: 0 },
  { name: '初度登録年月', test: (k) => k.startsWith('初度登録年月'), len: 0 },
  { name: '車名', test: (k) => k === '車名' || k.startsWith('車名'), len: 0 },
  { name: '乗車定員', test: (k) => k.startsWith('乗車定員'), len: 0 },
  { name: '車両総重量', test: (k) => k.startsWith('車両総重量'), len: 0 },
  { name: '車台番号', test: (k) => k.startsWith('車台番号'), len: 0 },
  { name: '型式', test: (k) => k === '型式' || /^型式(?!指定)/.test(k), len: 0 },
  { name: '総排気量', test: (k) => k.startsWith('総排気量'), len: 0 },
  { name: '燃料の種類', test: (k) => k.startsWith('燃料の種類'), len: 0 },
  { name: '有効期間の満了する日', test: (k) => k.includes('有効期間の満了する日') || k.includes('有効期間の満了'), len: 0 },
];

const joinText = (a: string, b: string) => (CJK.test(a.slice(-1)) && CJK.test(b.slice(0, 1)) ? a + b : `${a} ${b}`);

// 近い文字（同じ行で、すき間が小さいもの）をつなげて、1つのまとまりにする
export function mergeBoxes(boxes: Box[]): Box[] {
  const items = boxes.filter((b) => b.text.trim()).map((b) => ({ ...b, text: b.text.trim() }));
  if (items.length === 0) return [];
  const hs = items.map((b) => b.y1 - b.y0).sort((a, b) => a - b);
  const h = hs[Math.floor(hs.length / 2)] || 10;
  items.sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0);
  // 行ごとに分ける（縦の中心がほぼ同じものを同じ行とみなす）
  const lines: Box[][] = [];
  for (const it of items) {
    const cy = (it.y0 + it.y1) / 2;
    const line = lines.find((l) => Math.abs((l[0].y0 + l[0].y1) / 2 - cy) < h * 0.5);
    if (line) line.push(it);
    else lines.push([it]);
  }
  const out: Box[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x0 - b.x0);
    let cur: Box | null = null;
    for (const it of line) {
      if (cur && it.x0 - cur.x1 < h * 0.8) {
        cur = { text: joinText(cur.text, it.text), x0: cur.x0, y0: Math.min(cur.y0, it.y0), x1: Math.max(cur.x1, it.x1), y1: Math.max(cur.y1, it.y1) };
      } else {
        if (cur) out.push(cur);
        cur = { ...it };
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

// 項目名ごとに、右隣か真下にある値を探して、「項目名 値」の行を作る。値が見つからなかった項目は出さない。
export function pairLabelsAndValues(boxes: Box[]): string {
  const segs = mergeBoxes(boxes);
  if (segs.length === 0) return '';
  const hs = segs.map((b) => b.y1 - b.y0).sort((a, b) => a - b);
  const h = hs[Math.floor(hs.length / 2)] || 10;
  const lines: string[] = [];
  for (const target of TARGETS) {
    const lab = segs.find((s) => target.test(labelKey(s.text)));
    if (!lab) continue;
    // 同じまとまりの中に、項目名のすぐあとに値が続いているとき（「車台番号 S510P-0012345」）
    // 同じまとまりの中に、項目名のすぐあとに値が続いているとき（「車台番号 S510P-0012345」）。いちばん長い項目名から順に取り除く
    const key = labelKey(lab.text);
    const full = [...KNOWN_LABELS].sort((x, y) => y.length - x.length).find((l) => key.startsWith(l));
    let value = '';
    if (full && key.length > full.length) {
      // 空白が入っていても項目名を見つけられるよう、1文字ずつの間に空白を許して探し、その後ろを値とする
      const re = new RegExp(full.split('').map((ch) => ch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('\\s*'));
      const orig = lab.text.normalize('NFKC');
      const hit = orig.match(re);
      const after = hit ? orig.slice((hit.index || 0) + hit[0].length).replace(/^[\s:：]+/, '').trim() : '';
      if (after && !isLabelText(after) && !/^(?:又は|する)/.test(after)) value = after;
    }
    if (!value) {
      const cy = (lab.y0 + lab.y1) / 2;
      // ① 右隣（同じ行）
      const right = segs
        .filter((s) => s !== lab && Math.abs((s.y0 + s.y1) / 2 - cy) < h * 0.6 && s.x0 >= lab.x1 - 2 && !isLabelText(s.text))
        .sort((a, b) => a.x0 - b.x0)[0];
      // ② 真下（横の位置が重なるもの。近いものを優先）
      const below = segs
        .filter(
          (s) =>
            s !== lab &&
            s.y0 >= lab.y1 - h * 0.4 &&
            s.y0 - lab.y1 < h * 3.5 &&
            s.x0 < lab.x1 + h &&
            s.x1 > lab.x0 - h &&
            !isLabelText(s.text),
        )
        .sort((a, b) => a.y0 - b.y0 || Math.abs(a.x0 - lab.x0) - Math.abs(b.x0 - lab.x0))[0];
      // 項目名の下に値を置く表（電子車検証など）では、真下を優先する。右隣が項目名と同じ幅で離れているときだけ右隣
      value = (below?.text || right?.text || '').trim();
      if (right && below && right.x0 - lab.x1 < h * 2 && Math.abs((right.y0 + right.y1) / 2 - cy) < h * 0.3) value = right.text.trim();
    }
    if (value) lines.push(`${target.name} ${value}`);
  }
  return lines.join('\n');
}
