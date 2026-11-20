import { kvDel, kvGet, kvSet } from '@/lib/kv';

// 写真（整備依頼・整備記録・車両・事故報告に付けるもの）の保存先。
// - BLOB_READ_WRITE_TOKEN があるとき：写真の本体を Vercel Blob に置き、Redis には「どこに置いたか」だけを残す（Redis の容量を使わない）。
// - 無いとき：これまでどおり、Redis（fleet:photo:v1:{id}）に本体を入れる。
// 以前の写真（Redis に本体があるもの）は、表示したときに、順に Blob へ移す。Blob に保存できなかったときは、Redis に入れる（写真が付けられない、を防ぐ）。
// 写真の URL は外に出さない。見るときは、これまでどおり /api/photos/{id}（推測できない id を知っている場合だけ）。
// ※ 車検証・検査証記録事項の画像（fleet:shaken:v1:…）は、対象外（Redis のまま）。
const PREFIX = 'data:image/jpeg;base64,';
const key = (id: string) => `fleet:photo:v1:${id}`;
const pathOf = (id: string) => `photos/${id}.jpg`;
type Stored = { image?: string; blob?: string; savedAt?: string };
type Access = 'private' | 'public';

export const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
// 保存先のストアの種類（作るときに選んだもの）。指定が無ければ private（URL を知っていても、外からは見られない）
const access = (): Access => (process.env.BLOB_ACCESS === 'public' ? 'public' : 'private');

async function putBlob(id: string, bytes: Buffer): Promise<string> {
  const { put } = await import('@vercel/blob');
  const r = await put(pathOf(id), bytes, { access: access(), contentType: 'image/jpeg', addRandomSuffix: false, allowOverwrite: true });
  return r.pathname;
}

export async function savePhoto(id: string, dataUrl: string): Promise<'blob' | 'kv'> {
  const savedAt = new Date().toISOString();
  if (blobEnabled()) {
    try {
      const pathname = await putBlob(id, Buffer.from(dataUrl.slice(PREFIX.length), 'base64'));
      await kvSet(key(id), { blob: pathname, savedAt } satisfies Stored);
      return 'blob';
    } catch (e) {
      console.error('[photo-store] Blob に保存できなかったため、Redis に保存します', e);
    }
  }
  await kvSet(key(id), { image: dataUrl, savedAt } satisfies Stored);
  return 'kv';
}

export async function loadPhoto(id: string): Promise<Buffer | null> {
  const s = await kvGet<Stored | null>(key(id), null);
  if (!s) return null;
  if (s.blob) {
    const { get } = await import('@vercel/blob');
    const r = await get(s.blob, { access: access() });
    if (!r || r.statusCode !== 200) return null;
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  }
  if (!s.image?.startsWith(PREFIX)) return null;
  const bytes = Buffer.from(s.image.slice(PREFIX.length), 'base64');
  if (blobEnabled()) {
    // 以前の写真を、Blob へ移す（失敗しても、表示はそのまま続ける）
    try {
      const pathname = await putBlob(id, bytes);
      await kvSet(key(id), { blob: pathname, savedAt: s.savedAt || new Date().toISOString() } satisfies Stored);
    } catch (e) {
      console.error('[photo-store] 以前の写真を Blob へ移せませんでした', e);
    }
  }
  return bytes;
}

export async function deletePhoto(id: string): Promise<void> {
  const s = await kvGet<Stored | null>(key(id), null);
  if (s?.blob) {
    try {
      const { del } = await import('@vercel/blob');
      await del(s.blob);
    } catch (e) {
      console.error('[photo-store] Blob の写真を消せませんでした', e);
    }
  }
  await kvDel(key(id));
}
