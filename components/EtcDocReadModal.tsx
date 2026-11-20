'use client';

import { useEffect, useState } from 'react';
import type { Vehicle } from '@/lib/types';
import { mechanicHeaders } from '@/lib/utils';
import { compressToJpeg } from '@/lib/image';
import { normPlate } from '@/lib/shaken';
import Modal from './Modal';

type Read = { plate?: string; unitNo?: string; typeNo?: string; setupDate?: string; dealer?: string };

// 保存したETC車載器セットアップ証明書の写真を、AIで読み取って、車両のETC情報に登録する。
// 読み取った値は、画面で直してから登録できる（読み違いがあるため、登録前に必ず見てもらう）。
export default function EtcDocReadModal({ vehicle, onClose, onSave }: { vehicle: Vehicle; onClose: () => void; onSave: (v: Vehicle) => Promise<unknown> }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [msg, setMsg] = useState('');
  const [photo, setPhoto] = useState('');
  const [unitNo, setUnitNo] = useState('');
  const [typeNo, setTypeNo] = useState('');
  const [setupDate, setSetupDate] = useState('');
  const [dealer, setDealer] = useState('');
  const [plate, setPlate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const res = await fetch(`/api/vehicles/${encodeURIComponent(vehicle.id)}/shaken?kind=etc`, { cache: 'no-store', headers: mechanicHeaders() });
        if (!res.ok) throw new Error('img');
        const blob = await res.blob();
        const url: string = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => reject(new Error('read'));
          fr.readAsDataURL(blob);
        });
        if (dead) return;
        setPhoto(url);
        const image = await compressToJpeg(url, 2200, 1_200_000);
        const ai = await fetch('/api/shaken-ai', { method: 'POST', headers: { 'Content-Type': 'application/json', ...mechanicHeaders() }, body: JSON.stringify({ image, kind: 'etc' }) });
        const j = await ai.json().catch(() => ({}));
        if (dead) return;
        if (!ai.ok || !j.success) {
          setMsg(j.message || 'AIでの読み取りに失敗しました。下の欄に、写真を見ながら入力してください。');
        } else {
          const f = (j.fields || {}) as Read;
          setUnitNo(f.unitNo || '');
          setTypeNo(f.typeNo || '');
          setSetupDate(f.setupDate || '');
          setDealer(f.dealer || '');
          setPlate(f.plate || '');
          if (!f.unitNo && !f.typeNo && !f.setupDate && !f.dealer) setMsg('AIが、この画像から項目を読み取れませんでした。下の欄に、写真を見ながら入力してください。');
        }
        setState('ready');
      } catch {
        if (!dead) {
          setMsg('保存した証明書の画像を読み込めませんでした。管理者・整備士のログインが切れていないか確認してください。');
          setState('error');
        }
      }
    })();
    return () => {
      dead = true;
    };
  }, [vehicle.id]);

  const plateDiffers = !!plate && !!vehicle.plate && normPlate(plate) !== normPlate(vehicle.plate);

  async function register() {
    setSaving(true);
    try {
      const cur = vehicle.etc || {};
      await onSave({
        ...vehicle,
        etc: {
          ...cur,
          kind: cur.kind && cur.kind !== 'none' ? cur.kind : 'etc',
          ...(unitNo.trim() ? { unitNo: unitNo.trim() } : {}),
          ...(typeNo.trim() ? { typeNo: typeNo.trim() } : {}),
          ...(setupDate ? { installedAt: setupDate } : {}),
          ...(dealer.trim() ? { dealer: dealer.trim() } : {}),
        },
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`証明書から読み取る：${vehicle.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            閉じる
          </button>
          <button className="btn btn-primary" disabled={state !== 'ready' || saving} onClick={register}>
            {saving ? '登録中…' : 'ETCの情報に登録する'}
          </button>
        </>
      }
    >
      {state === 'loading' && <div className="notice-box notice-ok">証明書をAIで読み取っています…（10秒ほど）</div>}
      {state === 'error' && <div className="notice-box">{msg}</div>}
      {state === 'ready' && (
        <>
          {msg && <div className="notice-box">{msg}</div>}
          {plateDiffers && (
            <div className="notice-box" style={{ marginBottom: 10 }}>
              ⚠ 証明書の登録番号「{plate}」は、この車両のナンバー「{vehicle.plate}」と違います。別の車両の証明書ではないか、確かめてください。
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 10 }}>AIが読み取った内容です。読み違いがあることがあるので、写真と見比べて、直してから登録してください。空欄の項目は、いまの登録内容のままにします。</div>
          <div className="field-row row2">
            <div className="field">
              <label>車載器管理番号</label>
              <input value={unitNo} maxLength={40} placeholder="00002-00079518-000920" onChange={(e) => setUnitNo(e.target.value)} />
            </div>
            <div className="field">
              <label>型式登録番号</label>
              <input value={typeNo} maxLength={10} placeholder="0500" onChange={(e) => setTypeNo(e.target.value)} />
            </div>
          </div>
          <div className="field-row row2">
            <div className="field">
              <label>セットアップ完了日</label>
              <input type="date" value={setupDate} onChange={(e) => setSetupDate(e.target.value)} />
            </div>
            <div className="field">
              <label>取扱店</label>
              <input value={dealer} maxLength={40} onChange={(e) => setDealer(e.target.value)} />
            </div>
          </div>
          {photo && <img src={photo} alt="保存した証明書" className="photo-preview" />}
        </>
      )}
    </Modal>
  );
}
