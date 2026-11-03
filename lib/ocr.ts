// ブラウザ内OCR（Tesseract.js, CDN読み込み）の共通ヘルパー。
// 免許証OCR（DriverOcrModal）とメーターOCR（ReportsTab）の両方から利用する。

declare global {
  interface Window {
    Tesseract?: any;
  }
}

const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

export function loadTesseract(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('window is not available'));
      return;
    }
    if (window.Tesseract) {
      resolve(window.Tesseract);
      return;
    }
    const existing = document.querySelector(`script[src="${TESSERACT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Tesseract));
      existing.addEventListener('error', () => reject(new Error('load failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = TESSERACT_SRC;
    script.async = true;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error('load failed'));
    document.head.appendChild(script);
  });
}

/**
 * OCRで読み取ったテキストから、走行距離メーター（オドメーター）らしき数値を抽出する。
 * 数字の誤認識（O→0, l/I→1 等）を軽くフィックスした上で、最も桁数の多い
 * 数字の並び（通常5〜6桁）を採用する簡易ヒューリスティック。
 */
export function extractOdometerReading(text: string): number | null {
  const cleaned = text
    .replace(/[oO]/g, '0')
    .replace(/[lI]/g, '1')
    .replace(/[^\d.\n]/g, ' ');
  const matches = cleaned.match(/\d{3,7}(?:\.\d)?/g);
  if (!matches || matches.length === 0) return null;
  const best = matches.reduce((a, b) => (b.replace('.', '').length > a.replace('.', '').length ? b : a));
  const n = Math.round(parseFloat(best));
  return isNaN(n) ? null : n;
}

/**
 * OCR前の画像補正：長辺を約2600pxにそろえ（小さい写真は拡大、大きすぎるものは縮小）、
 * グレースケール化して明るさとコントラストを引き伸ばす。車検証のように細かい文字が並ぶ書類は、
 * 暗い・小さい・斜めの影が入った写真だと読み違いが増えるため。
 */
export function preprocessForOcr(dataUrl: string, targetEdge = 2600): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = targetEdge / Math.max(img.width, img.height);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(dataUrl);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const im = ctx.getImageData(0, 0, w, h);
        const d = im.data;
        const hist = new Array(256).fill(0);
        for (let i = 0; i < d.length; i += 4) {
          const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
          d[i] = d[i + 1] = d[i + 2] = g;
          hist[g]++;
        }
        // 暗い側1%・明るい側1%を切り捨てて、その間を0〜255に引き伸ばす
        const total = w * h;
        let lo = 0;
        let hi = 255;
        for (let acc = 0; lo < 255 && (acc += hist[lo]) < total * 0.01; lo++);
        for (let acc = 0; hi > 0 && (acc += hist[hi]) < total * 0.01; hi--);
        if (hi - lo > 30) {
          const k = 255 / (hi - lo);
          for (let i = 0; i < d.length; i += 4) {
            const v = Math.max(0, Math.min(255, Math.round((d[i] - lo) * k)));
            d[i] = d[i + 1] = d[i + 2] = v;
          }
        }
        ctx.putImageData(im, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
