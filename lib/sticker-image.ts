import QRCode from 'qrcode';

// QRステッカー1枚を、画像（PNG）にする。画面・印刷のステッカー（.sticker）と同じ並びを、キャンバスに描く。
// 大きさは mm で決め、1mm を PX_PER_MM ドットにする（名刺サイズで 1092×660。印刷しても粗くならない大きさ）。
export type StickerSize = 'm' | 's';
const PX_PER_MM = 12;
const DIM = {
  m: { w: 91, h: 55, top: 3.4, qr: 33, name: 6, plate: 3.4, how: 2.8, foot: 3.4, padX: 3, gap: 3, bandPad: 1 },
  s: { w: 60, h: 38, top: 2.6, qr: 24, name: 4.2, plate: 2.6, how: 2.1, foot: 2.5, padX: 2, gap: 2, bandPad: 0.7 },
} as const;
const FONT = '"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", Meiryo, "Noto Sans JP", "Noto Sans CJK JP", sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
// 幅に入るように、文字の途中で折り返す（最大 maxLines 行。入りきらないときは「…」）
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of [...text]) {
    if (ctx.measureText(cur + ch).width > maxW && cur) {
      lines.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    let last = cut[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    cut[maxLines - 1] = last + '…';
    return cut;
  }
  return lines;
}

export async function stickerCanvas(opt: { name: string; plate: string; url: string; size: StickerSize; towPhone?: string }): Promise<HTMLCanvasElement> {
  const d = DIM[opt.size];
  const mm = (n: number) => Math.round(n * PX_PER_MM);
  const W = mm(d.w);
  const H = mm(d.h);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像を作れませんでした。');
  const border = mm(0.4);
  const radius = mm(3);

  // 台紙（白）と、角の丸い枠の中だけに描く
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  roundRect(ctx, border / 2, border / 2, W - border, H - border, radius);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 上の帯
  const topH = mm(d.top * 1.25 + d.bandPad * 2);
  ctx.fillStyle = '#0369a1';
  ctx.fillRect(0, 0, W, topH);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${mm(d.top)}px ${FONT}`;
  ctx.fillText('🚙 運行管理アプリ', W / 2, topH / 2);

  // 下の帯
  const footH = mm(d.foot * 1.25 + d.bandPad * 2);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, H - footH, W, footH);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${mm(d.foot)}px ${FONT}`;
  ctx.fillText(`🆘 事故・故障 ${opt.towPhone ? `🚛 ${opt.towPhone}` : '警察110 救急119'}`, W / 2, H - footH / 2, W - mm(4));

  // QRコード
  const bodyTop = topH;
  const bodyH = H - topH - footH;
  const qr = mm(d.qr);
  const qrX = mm(d.padX);
  const qrY = bodyTop + (bodyH - qr) / 2;
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, opt.url, { width: qr * 2, margin: 0, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, qrX, qrY, qr, qr);
  ctx.imageSmoothingEnabled = true;

  // 車両名・ナンバー・説明
  const tx = qrX + qr + mm(d.gap);
  const tw = W - tx - mm(d.padX);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 ${mm(d.name)}px ${FONT}`;
  const nameLines = wrap(ctx, opt.name, tw, 2);
  const lh = 1.25;
  const blockH = nameLines.length * mm(d.name) * lh + mm(d.plate) * lh + mm(1.5) + 2 * mm(d.how) * lh;
  let y = bodyTop + (bodyH - blockH) / 2;
  ctx.fillStyle = '#111827';
  for (const line of nameLines) {
    ctx.fillText(line, tx, y);
    y += mm(d.name) * lh;
  }
  ctx.fillStyle = '#374151';
  ctx.font = `400 ${mm(d.plate)}px ${FONT}`;
  ctx.fillText(opt.plate, tx, y, tw);
  y += mm(d.plate) * lh + mm(1.5);
  ctx.font = `400 ${mm(d.how)}px ${FONT}`;
  ctx.fillText('📷 QRを読み取ると', tx, y, tw);
  y += mm(d.how) * lh;
  ctx.fillText('出発・帰着・整備依頼・事故連絡', tx, y, tw);
  ctx.restore();

  // 枠
  ctx.lineWidth = border;
  ctx.strokeStyle = '#111827';
  roundRect(ctx, border / 2, border / 2, W - border, H - border, radius);
  ctx.stroke();
  return canvas;
}

export const stickerFileName = (name: string, plate: string) => `QRステッカー_${`${plate}_${name}`.replace(/[\\/:*?"<>|\s]/g, '')}.png`;

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('画像を作れませんでした。'));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      resolve();
    }, 'image/png');
  });
}
