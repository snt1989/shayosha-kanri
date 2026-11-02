'use client';

import { useMemo, useRef, useState } from 'react';
import { AppData, Vehicle } from '@/lib/types';
import { genId } from '@/lib/utils';
import { loadTesseract } from '@/lib/ocr';
import { extractShakenFields, normPlate } from '@/lib/shaken';
import Modal from './Modal';

// 車検証の写真から、ナンバー・型式・車検満了日を読み取って、車両台帳に登録する。
// 同じナンバーの車両が台帳にあるときは、新しく作らず、その車両の車検満了日・型式を更新する。
export default function VehicleOcrModal({
  data,
  onClose,
  onSave,
}: {
  data: AppData;
  onClose: () => void;
  onSave: (v: Vehicle) => Promise<unknown>;
}) {
  const [photo, setPhoto] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [modelType, setModelType] = useState('');
  const [shakenDate, setShakenDate] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 台帳に同じナンバーの車両があるか
  const existing = useMemo(() => {
    const key = normPlate(plate);
    return key ? data.vehicles.find((v) => normPlate(v.plate) === key) || null : null;
  }, [plate, data.vehicles]);

  function handleFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function runOcr() {
    if (!photo) return;
    setRunning(true);
    setProgress(0);
    setOcrText('');
    try {
      const Tesseract = await loadTesseract();
      const res = await Tesseract.recognize(photo, 'jpn+eng', {
        logger: (m: { status?: string; progress?: number }) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') setProgress(Math.round(m.progress * 100));
        },
      });
      const text: string = res?.data?.text || '';
      setOcrText(text);
      const f = extractShakenFields(text);
      if (f.plate) setPlate(f.plate);
      if (f.modelType) setModelType(f.modelType);
      if (f.shakenDate) setShakenDate(f.shakenDate);
      if (f.carName && !name) setName(f.carName);
      if (!f.plate && !f.modelType && !f.shakenDate) alert('車検証から項目を読み取れませんでした。写真を撮り直すか、手入力してください。');
    } catch {
      alert('OCR処理に失敗しました。手入力で登録してください。');
    } finally {
      setRunning(false);
    }
  }

  async function handleSave() {
    if (!plate.trim()) {
      alert('ナンバープレートは必須です。読み取れなかった場合は手入力してください。');
      return;
    }
    if (!existing && !name.trim()) {
      alert('車両呼称は必須です（例：社用車4号（ハイエース 白））。');
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        // 同じナンバーの車両：車検満了日と型式だけを更新する（走行距離・整備記録などはそのまま）
        await onSave({
          ...existing,
          shakenDate: shakenDate || existing.shakenDate,
          modelType: modelType || existing.modelType,
        });
      } else {
        await onSave({
          id: genId('v'),
          name: name.trim(),
          plate: plate.trim(),
          modelType,
          shakenDate,
          checkDate: '',
          odometer: 0,
          oilKm: 3000,
          tire: data.masters.tireTypes[0] || '',
          maintHistory: [],
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="車検証で登録・更新"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : existing ? 'この内容で更新する' : 'この内容で登録する'}
          </button>
        </>
      }
    >
      <div className="notice-box">
        車検証の写真から、ナンバー・型式・車検満了日の自動読み取りを試みます（ブラウザ内でOCR処理、外部送信なし）。読み取り精度は写真の状態により変わるため、登録前に必ず内容を車検証と見比べて、修正してください。
      </div>

      {!photo ? (
        <div className="photo-drop" onClick={() => fileRef.current?.click()}>
          📷 タップして車検証の写真をアップロード
        </div>
      ) : (
        <div>
          <img src={photo} alt="車検証プレビュー" className="photo-preview" />
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
              写真を変更
            </button>
            <button className="btn btn-sm btn-primary" onClick={runOcr} disabled={running}>
              {running ? `解析中…${progress}%` : '🔍 OCRで読み取る'}
            </button>
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFile(e.target.files?.[0] || null)} />

      {ocrText && (
        <>
          <div className="section-heading">OCR読み取り結果（テキスト）</div>
          <div className="ocr-text-preview">{ocrText.trim() || '(テキストを検出できませんでした)'}</div>
        </>
      )}

      <div className="section-heading">登録内容の確認・修正</div>
      {existing && (
        <div className="notice-box" style={{ borderColor: 'var(--amber-600)' }}>
          同じナンバーの車両「{existing.name}」が台帳にあります。保存すると、新しく作らずに、この車両の車検満了日と型式を更新します（走行距離・整備記録などはそのままです）。
        </div>
      )}
      <div className="field-row">
        <div className="field">
          <label>車両呼称{existing ? '（既存のまま）' : ''}</label>
          <input
            value={existing ? existing.name : name}
            disabled={!!existing}
            placeholder="例：社用車4号（ハイエース 白）"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label>ナンバープレート</label>
          <input value={plate} placeholder="例：品川 300 あ 12-34" onChange={(e) => setPlate(e.target.value)} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>型式</label>
          <input value={modelType} onChange={(e) => setModelType(e.target.value)} />
        </div>
        <div className="field">
          <label>車検満了日（有効期間の満了する日）</label>
          <input type="date" value={shakenDate} onChange={(e) => setShakenDate(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
