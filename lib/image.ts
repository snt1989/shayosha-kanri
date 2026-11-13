import { mechanicHeaders } from './utils';
// 画像（データURL）を、保存に適した大きさのJPEGに縮める。
// 保存先（Upstash）は1回のリクエストが約1MBまでなので、既定では約700KB以下にする。
export function compressToJpeg(dataUrl: string, maxEdge = 1600, maxChars = 700_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let edge = maxEdge;
      for (let attempt = 0; attempt < 8; attempt++) {
        const scale = Math.min(1, edge / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas'));
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        for (const q of [0.85, 0.75, 0.65, 0.55]) {
          const out = canvas.toDataURL('image/jpeg', q);
          if (out.length <= maxChars) return resolve(out);
        }
        edge = Math.round(edge * 0.8);
      }
      reject(new Error('too large'));
    };
    img.onerror = () => reject(new Error('load'));
    img.src = dataUrl;
  });
}

// 車検証の画像をサーバーに保存する（管理者・整備士）。成功したら true。
export async function uploadShakenImage(vehicleId: string, dataUrl: string, kind: 'cert' | 'record' = 'cert'): Promise<boolean> {
  try {
    const image = await compressToJpeg(dataUrl);
    const res = await fetch(`/api/vehicles/${encodeURIComponent(vehicleId)}/shaken${kind === 'record' ? '?kind=record' : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...mechanicHeaders() },
      body: JSON.stringify({ image }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// 整備依頼・整備記録に添付する写真用。見えれば十分な大きさ（長辺800px前後）で、1枚およそ40〜60KBまで小さくする。
export function compressPhoto(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let edge = 800;
      for (let attempt = 0; attempt < 6; attempt++) {
        const scale = Math.min(1, edge / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas'));
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        for (const q of [0.6, 0.5, 0.42, 0.34]) {
          const out = canvas.toDataURL('image/jpeg', q);
          if (out.length <= 62_000) return resolve(out);
        }
        edge = Math.round(edge * 0.8);
      }
      reject(new Error('too large'));
    };
    img.onerror = () => reject(new Error('load'));
    img.src = dataUrl;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

// 選んだ写真を最軽量に縮めて保存し、写真のidを返す。失敗したら例外。
export async function uploadPhoto(file: File): Promise<string> {
  const image = await compressPhoto(await readAsDataUrl(file));
  const res = await fetch('/api/photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  if (!res.ok || !json.id) throw new Error('upload');
  return json.id;
}

export const photoUrl = (id: string) => `/api/photos/${id}`;
