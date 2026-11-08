// PDF（車検証のPDFなど）を、文字と画像に変える共通ヘルパー（pdf.js, CDN読み込み）。
// 電子車検証のPDFのように文字が入っているものは、その文字をそのまま使う（OCR不要で正確）。
// スキャンしただけのPDFは文字が無いので、1ページ目を画像にして、OCRにかける。

import type { Box } from './shaken-layout';

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

const PDFJS_VERSION = '3.11.174';
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`;

export function loadPdfJs(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('window is not available'));
      return;
    }
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
    const src = `${PDFJS_BASE}/pdf.min.js`;
    const done = () => {
      if (!window.pdfjsLib) return reject(new Error('pdf.js not found'));
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
      resolve(window.pdfjsLib);
    };
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', done);
      existing.addEventListener('error', () => reject(new Error('load failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = done;
    script.onerror = () => reject(new Error('load failed'));
    document.head.appendChild(script);
  });
}

export const isPdfFile = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/**
 * PDFの1〜3ページ目の文字を集め、1ページ目を画像（PNGのdata URL）にして返す。
 * text は文字が入っていないPDF（スキャン）だと空に近くなる。
 */
export async function readPdf(file: File): Promise<{ text: string; image: string; pages: number; boxes: Box[] }> {
  const pdfjs = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: number = doc.numPages;

  let text = '';
  const boxes: Box[] = [];
  for (let i = 1; i <= Math.min(pages, 3); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: { str?: string }) => it.str || '').join(' ') + '\n';
    // 文字の位置（項目名と値を、位置で組み合わせるため）。PDFの座標は上向きなので、下向きに直す。ページごとに十分離す
    for (const it of content.items as { str?: string; transform?: number[]; width?: number; height?: number }[]) {
      if (!it.str || !it.str.trim() || !it.transform) continue;
      const h = it.height || Math.abs(it.transform[3]) || 10;
      const x = it.transform[4];
      const y = it.transform[5];
      boxes.push({ text: it.str, x0: x, x1: x + (it.width || it.str.length * h), y0: -(y + h) + (i - 1) * 100000, y1: -y + (i - 1) * 100000 });
    }
  }

  // 1ページ目を画像にする（プレビューと、文字が無いときのOCR用）
  const page1 = await doc.getPage(1);
  const viewport = page1.getViewport({ scale: 2.5 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page1.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return { text, image: canvas.toDataURL('image/png'), pages, boxes };
}
