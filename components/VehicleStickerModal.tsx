'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { AppData, Vehicle } from '@/lib/types';
import { vehicleLandingUrl } from '@/lib/vehicle-qr';
import Modal from './Modal';

type Size = 'm' | 's';
const SIZES: { key: Size; label: string; note: string }[] = [
  { key: 'm', label: '標準（90×55mm）', note: '名刺より少し大きい。ダッシュボードやサンバイザー向き' },
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
            <button className="btn btn-primary" disabled={!ready} onClick={() => window.print()}>
              🖨 印刷する（{chosen.length}枚）
            </button>
          </>
        }
      >
        <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 10 }}>
          QRコードを読み取ると、その車両の画面が開き、出発登録・帰着登録・整備依頼・事故連絡ができます。印刷したら、切り抜いて車内（運転席から見える場所）に貼ってください。印刷の画面で「PDFに保存」を選ぶと、PDFにもできます。
        </div>
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
              chosen.map((v) => (svgs[v.id] ? <Sticker key={v.id} v={v} svg={svgs[v.id]} size={size} tow={tow} /> : null))
            )}
          </div>
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
