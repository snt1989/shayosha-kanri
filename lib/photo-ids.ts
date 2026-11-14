// 整備依頼・整備記録に添付する写真のid。写真の本体は日報などの本体データとは別（fleet:photo:v1:{id}）に保存する。
export const PHOTO_ID_RE = /^p[0-9a-f]{32}$/;
export const MAX_PHOTOS = 3;
export const MAX_VEHICLE_PHOTOS = 6; // 車両台帳の写真

// 画面から届いた写真idの一覧を、正しい形のものだけ・重複なし・最大枚数までに整える
export function cleanPhotoIds(v: unknown, max = MAX_PHOTOS): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && PHOTO_ID_RE.test(x) && !out.includes(x)) out.push(x);
    if (out.length >= max) break;
  }
  return out;
}
