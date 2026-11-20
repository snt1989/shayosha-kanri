'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { AppData, Vehicle } from '@/lib/types';
import { vehicleLandingUrl } from '@/lib/vehicle-qr';
import { downloadCsv } from '@/lib/csv';
import { todayStr } from '@/lib/utils';
import Modal from './Modal';
import { downloadCanvas, stickerCanvas, stickerFileName } from '@/lib/sticker-image';

type Size = 'm' | 's';
const SIZES: { key: Size; label: string; note: string }[] = [
  { key: 'm', label: '名刺サイズ（91×55mm）', note: '日本の名刺サイズ。名刺用のラベルシート（10面）にそのまま合います' },
  { key: 's', label: '小（60×38mm）', note: '小さな場所向き。QRは読み取りやすい大きさを保ちます' },
];

type Contact = { label: string; phone: string };

// 1枚のステッカー。画面のプレビューと印刷で同じものを使う（大きさは mm 指定）。
function Sticker({ v, svg, size, tow }: { v: Vehicle; svg: string; size: Size; tow: Contact | null }) {
  return (
    <div className={`sticker sticker-${size}`}>
      <div className="sticker-top">🚙 運行管理アプリ</div>
      <div className="sticker-body">
        <div className="sticker-qr" dangerouslySetInnerHTML={{ __html: svg }} aria-label={`${v.name}のQRコード`} />
        <div className="sticker-info">
          <div className="sticker-name">{v.name.split(/[（(]/)[0].trim() || v.name}</div>
          <div className="sticker-plate">{v.plate}</div>
          <div className="sticker-how">
            📷 QRを読み取ると
            <br />
            出発・帰着・整備依頼・事故連絡
          </div>
        </div>
      </div>
      <div className="sticker-foot">
        <strong>🆘 事故・故障</strong>
        {tow ? <span> 🚛 {tow.phone}</span> : <span> 警察110 救急119</span>}
      </div>
    </div>
  );
}

// 車両に貼る「QRコードつきステッカー」。車両を選び、大きさを選んで、そのまま印刷（またはPDFに保存）できる。
export default function VehicleStickerModal({ data, initialIds, onClose }: { data: AppData; initialIds: string[]; onClose: () => void }) {
  const [ids, setIds] = useState<string[]>(initialIds.length ? initialIds : data.vehicles.map((v) => v.id));
  const [size, setSize] = useState<Size>('m');
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  const [tow, setTow] = useState<Contact | null>(null);
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    // レッカー・ロードサービスの番号があれば、ステッカーにも載せる
    fetch('/api/incident-contacts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setTow((j.contacts || []).find((c: Contact) => /レッカー|ロード/.test(c.label)) || null))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const v of data.vehicles) {
        // 誤り訂正は中程度（M）。汚れや小さな傷があっても読み取れるようにする
        out[v.id] = await QRCode.toString(vehicleLandingUrl(origin, v.id), { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } });
      }
      if (alive) setSvgs(out);
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [data.vehicles, origin]);

  const chosen = useMemo(() => data.vehicles.filter((v) => ids.includes(v.id)), [data.vehicles, ids]);
  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const ready = chosen.length > 0 && chosen.every((v) => svgs[v.id]);

  // ラベル屋さん（A-one）などの差し込み印刷用のデータ。1行が1枚。QRコード用URLの列を、QRコード（バーコード）の差し込み項目に使う。
  const csvCell = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  function downloadLabelCsv() {
    const head = ['車両名', '車両名（全体）', 'ナンバー', 'QRコード用URL', '事故連絡', 'アプリ名', '説明', '車両ID'];
    const rows = chosen.map((v) => [
      v.name.split(/[（(]/)[0].trim() || v.name,
      v.name,
      v.plate,
      vehicleLandingUrl(origin, v.id),
      tow ? `事故・故障：レッカー ${tow.phone}` : '事故・故障：警察110 救急119',
      '運行管理アプリ',
      'QRを読み取ると 出発・帰着・整備依頼・事故連絡',
      v.id,
    ]);
    downloadCsv(`ラベル屋さん用_車両ステッカー_${todayStr()}.csv`, [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n'));
  }
  // QR画像（PNG）を1台ずつ保存する。ラベル屋さんに「画像」として貼り付けるときに使う
  async function downloadQrPngs() {
    for (const v of chosen) {
      const url = await QRCode.toDataURL(vehicleLandingUrl(origin, v.id), { width: 600, margin: 2, errorCorrectionLevel: 'M' });
      const a = document.createElement('a');
      a.href = url;
      a.download = `QR_${v.plate.replace(/[\\/:*?"<>|\s]/g, '')}_${v.name.split(/[（(]/)[0].trim()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  const shortName = (v: Vehicle) => v.name.split(/[（(]/)[0].trim() || v.name;
  // ステッカーを、1枚ずつ画像（PNG）で保存する
  async function saveOne(v: Vehicle) {
    const c = await stickerCanvas({ name: shortName(v), plate: v.plate, url: vehicleLandingUrl(origin, v.id), size, towPhone: tow?.phone });
    await downloadCanvas(c, stickerFileName(shortName(v), v.plate));
  }
  async function saveStickers(list: Vehicle[]) {
    setSaveErr('');
    try {
      for (const v of list) {
        setSaving(v.id);
        await saveOne(v);
        if (list.length > 1) await new Promise((r) => setTimeout(r, 400)); // 続けて保存すると、ブラウザが止めることがあるため、少し間をあける
      }
    } catch {
      setSaveErr('画像を保存できませんでした。もう一度お試しください。');
    } finally {
      setSaving('');
    }
  }

  return (
    <>
      <Modal
        title="🏷 車両に貼るQRコードのステッカー"
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={onClose}>
              閉じる
            </button>
            <button className="btn" disabled={!ready || saving !== ''} onClick={() => void saveStickers(chosen)}>
              {saving ? '保存中…' : `⬇ 画像で保存（${chosen.length}枚・1枚ずつ）`}
            </button>
            <button className="btn btn-primary" disabled={!ready} onClick={() => window.print()}>
              🖨 印刷する（{chosen.length}枚）
            </button>
          </>
        }
      >
        <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 10 }}>
          QRコードを読み取ると、その車両の画面が開き、出発登録・帰着登録・整備依頼・事故連絡ができます。印刷したら、切り抜いて車内（運転席から見える場所）に貼ってください。印刷の画面で「PDFに保存」を選ぶと、PDFにもできます。「画像で保存」を押すと、1枚ずつ画像（PNG）でダウンロードできます。
        </div>
        <details className="sticker-label-box">
          <summary>🏷 ラベル屋さん（A-one）で作るとき</summary>
          <div className="sticker-label-body">
            <p>名刺サイズ（91×55mm）の市販のラベルシート（例：A-one 名刺用 10面）に、「ラベル屋さん」で印刷できます。</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <button type="button" className="btn btn-sm btn-primary" disabled={!ready} onClick={downloadLabelCsv}>
                ⬇ ラベル屋さん用データ（CSV）
              </button>
              <button type="button" className="btn btn-sm" disabled={!ready} onClick={() => void downloadQrPngs()}>
                ⬇ QR画像（PNG）を保存
              </button>
            </div>
            <ol>
              <li>ラベル屋さんで、お使いのラベルシートの品番（名刺サイズ 91×55mm）を選びます。</li>
              <li>「差し込み印刷」で、上のCSVを読み込みます（文字化けするときは、Excelで開いて「CSV（Shift_JIS）」で保存し直します）。</li>
              <li>「車両名」「ナンバー」「事故連絡」を、文字の差し込み項目に入れます。</li>
              <li>QRコードは、ラベル屋さんのQRコード（バーコード）の機能で、データに「QRコード用URL」を差し込みます。うまく作れないときは、保存したQR画像（PNG）を貼り付けてください。</li>
            </ol>
          </div>
        </details>
        <div className="field">
          <label>大きさ</label>
          <div className="type-chips">
            {SIZES.map((s) => (
              <button key={s.key} type="button" className={`btn btn-sm ${size === s.key ? 'btn-primary' : ''}`} aria-pressed={size === s.key} onClick={() => setSize(s.key)}>
                {size === s.key ? '✓ ' : ''}
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 4 }}>{SIZES.find((s) => s.key === size)?.note}</div>
        </div>
        <div className="field">
          <label>
            印刷する車両（{chosen.length}/{data.vehicles.length}台）
          </label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <button type="button" className="btn btn-sm" onClick={() => setIds(data.vehicles.map((v) => v.id))}>
              すべて選ぶ
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setIds([])}>
              すべて外す
            </button>
          </div>
          <div className="sticker-pick">
            {data.vehicles.map((v) => (
              <label key={v.id} className="checkbox-field">
                <input type="checkbox" checked={ids.includes(v.id)} onChange={() => toggle(v.id)} /> {v.name}（{v.plate}）
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label>プレビュー</label>
          <div className="sticker-preview">
            {chosen.length === 0 ? (
              <div className="empty-state">車両を選んでください</div>
            ) : (
              chosen.map((v) =>
                svgs[v.id] ? (
                  <div key={v.id} className="sticker-item">
                    <Sticker v={v} svg={svgs[v.id]} size={size} tow={tow} />
                    <button type="button" className="btn btn-sm" disabled={saving !== ''} onClick={() => void saveStickers([v])}>
                      {saving === v.id ? '保存中…' : '⬇ この1枚を画像で保存'}
                    </button>
                  </div>
                ) : null
              )
            )}
          </div>
          {saveErr && (
            <div className="notice-box" role="alert" style={{ marginTop: 8 }}>
              {saveErr}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 4 }}>画像（PNG）は、選んだ大きさのステッカー1枚ぶんです。印刷を頼むときや、ほかのソフトに貼るときに使えます。</div>
        </div>
      </Modal>
      {/* 印刷用（画面には出ない。印刷のときだけ、これだけを出す） */}
      {mounted &&
        createPortal(
          <div className="sticker-print-sheet">
            {chosen.map((v) => (svgs[v.id] ? <Sticker key={v.id} v={v} svg={svgs[v.id]} size={size} tow={tow} /> : null))}
          </div>,
          document.body
        )}
    </>
  );
}
