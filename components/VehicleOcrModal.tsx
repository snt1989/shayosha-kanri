'use client';

import { useMemo, useRef, useState } from 'react';
import { AppData, Vehicle } from '@/lib/types';
import { genId } from '@/lib/utils';
import { loadTesseract } from '@/lib/ocr';
import { isPdfFile, readPdf } from '@/lib/pdf';
import { uploadShakenImage } from '@/lib/image';
import { extractShakenFields, normPlate } from '@/lib/shaken';
import Modal from './Modal';

// 車検証の写真から、ナンバー・型式・車検満了日を読み取って、車両台帳に登録する。
// 同じナンバーの車両が台帳にあるときは、新しく作らず、その車両の車検満了日・型式を更新する。
// 使い方は3通り：
// - 何も指定しない：ナンバーが同じ車両があれば更新、無ければ新規登録（「車検証で登録・更新」）
// - target：登録済みのこの車両に、車検証の内容を追加する（車両カードの「車検証」）
// - onApply：保存はせず、読み取った内容を編集中の画面に入れるだけ（編集画面の「車検証から読み取る」）
type Extra = Pick<Vehicle, 'maker' | 'chassisNo' | 'firstRegistered' | 'capacity' | 'grossWeight' | 'displacement' | 'fuelType'>;

export default function VehicleOcrModal({
  data,
  onClose,
  onSave,
  target,
  onApply,
  onFileSaved,
}: {
  data: AppData;
  onClose: () => void;
  onSave?: (v: Vehicle) => Promise<unknown>;
  target?: Vehicle;
  onApply?: (patch: Partial<Vehicle>) => void;
  // 車検証の画像を保存し終えたあとに呼ぶ（一覧の最新化用）
  onFileSaved?: () => void;
}) {
  const [photo, setPhoto] = useState('');
  // 読み取った車検証の画像も、あとで見られるよう保存する
  const [saveImage, setSaveImage] = useState(true);
  // PDFに文字が入っていたとき（電子車検証のPDFなど）は、OCRをせず、その文字を使う
  const [pdfText, setPdfText] = useState('');
  const [reading, setReading] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [name, setName] = useState('');
  const [plate, setPlate] = useState(target?.plate || '');
  const [modelType, setModelType] = useState(target?.modelType || '');
  const [shakenDate, setShakenDate] = useState(target?.shakenDate || '');
  const [extra, setExtra] = useState<Extra>({
    maker: target?.maker || '',
    chassisNo: target?.chassisNo || '',
    firstRegistered: target?.firstRegistered || '',
    capacity: target?.capacity || '',
    grossWeight: target?.grossWeight || '',
    displacement: target?.displacement || '',
    fuelType: target?.fuelType || '',
  });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 台帳に同じナンバーの車両があるか
  const matched = useMemo(() => {
    const key = normPlate(plate);
    return key && !onApply ? data.vehicles.find((v) => normPlate(v.plate) === key) || null : null;
  }, [plate, data.vehicles, onApply]);
  // 更新先の車両（車両を指定したときはその車両。指定が無いときは、同じナンバーの車両）
  const existing = target || matched;
  const plateDiffers = !!target && !!plate.trim() && normPlate(plate) !== normPlate(target.plate);

  async function handleFile(file: File | null) {
    if (!file) return;
    setPdfText('');
    setOcrText('');
    if (isPdfFile(file)) {
      setReading(true);
      try {
        const r = await readPdf(file);
        setPhoto(r.image);
        // 文字が十分に入っているPDFは、その文字を使う
        if (r.text.replace(/\s/g, '').length >= 40) {
          setPdfText(r.text);
          applyText(r.text, true);
        }
      } catch {
        alert('PDFを開けませんでした。ファイルをご確認いただくか、写真（画像）でお試しください。');
      } finally {
        setReading(false);
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  }

  // 文字から項目を取り出してフォームに入れる。入れられた項目があれば true
  function applyText(text: string, fromPdf: boolean): boolean {
    const f = extractShakenFields(text);
    if (f.plate) setPlate(f.plate);
    if (f.modelType) setModelType(f.modelType);
    if (f.shakenDate) setShakenDate(f.shakenDate);
    if (f.carName && !name) setName(f.carName);
    setExtra((e) => ({
      maker: f.carName || e.maker,
      chassisNo: f.chassisNo || e.chassisNo,
      firstRegistered: f.firstRegistered || e.firstRegistered,
      capacity: f.capacity || e.capacity,
      grossWeight: f.grossWeight || e.grossWeight,
      displacement: f.displacement || e.displacement,
      fuelType: f.fuelType || e.fuelType,
    }));
    const found = Object.keys(f).length > 0;
    if (!found && !fromPdf) alert('車検証から項目を読み取れませんでした。写真を撮り直すか、手入力してください。');
    return found;
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
      applyText(text, false);
    } catch {
      alert('OCR処理に失敗しました。手入力で登録してください。');
    } finally {
      setRunning(false);
    }
  }

  // 空でない項目だけを、車両に反映する
  function patchFromForm(): Partial<Vehicle> {
    const patch: Partial<Vehicle> = {};
    if (shakenDate) patch.shakenDate = shakenDate;
    if (modelType) patch.modelType = modelType;
    (Object.keys(extra) as (keyof Extra)[]).forEach((k) => {
      if (extra[k]) patch[k] = extra[k];
    });
    return patch;
  }

  async function handleSave() {
    if (onApply) {
      onApply(patchFromForm());
      onClose();
      return;
    }
    if (!existing && !plate.trim()) {
      alert('ナンバープレートは必須です。読み取れなかった場合は手入力してください。');
      return;
    }
    if (!existing && !name.trim()) {
      alert('車両呼称は必須です（例：社用車4号（ハイエース 白））。');
      return;
    }
    if (!onSave) return;
    setSaving(true);
    try {
      let savedId = '';
      if (existing) {
        savedId = existing.id;
        // 登録済みの車両：車検証の項目だけを更新する（走行距離・整備記録・点検日などはそのまま）
        await onSave({ ...existing, ...patchFromForm() });
      } else {
        savedId = genId('v');
        await onSave({
          id: savedId,
          name: name.trim(),
          plate: plate.trim(),
          modelType,
          shakenDate,
          checkDate: '',
          odometer: 0,
          oilKm: 3000,
          tire: data.masters.tireTypes[0] || '',
          maintHistory: [],
          ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)),
        });
      }
      if (saveImage && photo && savedId) {
        const ok = await uploadShakenImage(savedId, photo);
        if (ok) onFileSaved?.();
        else alert('車両は保存しましたが、車検証の画像は保存できませんでした（管理者ログインが切れた、または画像が大きすぎる可能性があります）。車両カードの「車検証」からもう一度保存できます。');
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={target ? `車検証を追加：${target.name}` : onApply ? '車検証から読み取る' : '車検証で登録・更新'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {onApply ? 'この内容を反映する' : saving ? '保存中…' : existing ? 'この内容で更新する' : 'この内容で登録する'}
          </button>
        </>
      }
    >
      <div className="notice-box">
        車検証の写真またはPDFから、ナンバー・型式・車検満了日・車台番号などの自動読み取りを試みます（ブラウザ内で処理し、外部送信なし）。読み取り精度は写真の状態により変わるため、登録前に必ず内容を車検証と見比べて、修正してください。
      </div>

      {!photo ? (
        <div className="photo-drop" onClick={() => fileRef.current?.click()}>
          📷 タップして車検証の写真（またはPDF）を選ぶ
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
      <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" hidden onChange={(e) => handleFile(e.target.files?.[0] || null)} />

      {reading && <div className="notice-box">PDFを読み込み中…</div>}
      {pdfText && (
        <div className="notice-box">
          PDFに入っている文字から、項目を読み取りました（OCRは使っていません）。内容を車検証と見比べて、修正してください。読み取れなかった項目は、下の「🔍 OCRで読み取る」でも試せます。
        </div>
      )}

      {ocrText && (
        <>
          <div className="section-heading">OCR読み取り結果（テキスト）</div>
          <div className="ocr-text-preview">{ocrText.trim() || '(テキストを検出できませんでした)'}</div>
        </>
      )}

      {photo && !onApply && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '4px 0 8px' }}>
          <input type="checkbox" checked={saveImage} onChange={(e) => setSaveImage(e.target.checked)} />
          この車検証の画像も保存して、あとで見られるようにする（管理者だけが見られます）
        </label>
      )}

      <div className="section-heading">登録内容の確認・修正</div>
      {!onApply && existing && !target && (
        <div className="notice-box" style={{ borderColor: 'var(--amber-600)' }}>
          同じナンバーの車両「{existing.name}」が台帳にあります。保存すると、新しく作らずに、この車両の車検証の項目を更新します（走行距離・整備記録などはそのままです）。
        </div>
      )}
      {plateDiffers && (
        <div className="notice-box" style={{ borderColor: 'var(--amber-600)' }}>
          読み取ったナンバー（{plate}）が、この車両の登録（{target?.plate}）と違います。別の車両の車検証ではないか、確認してください。ナンバーは変更されません。
        </div>
      )}
      <div className="field-row">
        <div className="field">
          <label>車両呼称{existing || onApply ? '（変更しません）' : ''}</label>
          <input
            value={existing ? existing.name : onApply ? '' : name}
            disabled={!!existing || !!onApply}
            placeholder="例：社用車4号（ハイエース 白）"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label>ナンバープレート</label>
          <input value={plate} disabled={!!target || !!onApply} placeholder="例：品川 300 あ 12-34" onChange={(e) => setPlate(e.target.value)} />
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
      <div className="field-row">
        <div className="field">
          <label>車台番号</label>
          <input value={extra.chassisNo || ''} placeholder="例：GDH206-1234567" onChange={(e) => setExtra({ ...extra, chassisNo: e.target.value })} />
        </div>
        <div className="field">
          <label>初度登録年月</label>
          <input type="month" value={extra.firstRegistered || ''} onChange={(e) => setExtra({ ...extra, firstRegistered: e.target.value })} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>車名（メーカー）</label>
          <input value={extra.maker || ''} onChange={(e) => setExtra({ ...extra, maker: e.target.value })} />
        </div>
        <div className="field">
          <label>燃料の種類</label>
          <input value={extra.fuelType || ''} placeholder="例：軽油" onChange={(e) => setExtra({ ...extra, fuelType: e.target.value })} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>乗車定員</label>
          <input value={extra.capacity || ''} placeholder="例：5人" onChange={(e) => setExtra({ ...extra, capacity: e.target.value })} />
        </div>
        <div className="field">
          <label>車両総重量</label>
          <input value={extra.grossWeight || ''} placeholder="例：2,610kg" onChange={(e) => setExtra({ ...extra, grossWeight: e.target.value })} />
        </div>
        <div className="field">
          <label>総排気量</label>
          <input value={extra.displacement || ''} placeholder="例：2.76L" onChange={(e) => setExtra({ ...extra, displacement: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}
