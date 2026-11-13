'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppData, Vehicle } from '@/lib/types';
import { genId, mechanicHeaders } from '@/lib/utils';
import { loadTesseract, preprocessForOcr } from '@/lib/ocr';
import { isPdfFile, readPdf } from '@/lib/pdf';
import { compressToJpeg, uploadShakenImage } from '@/lib/image';
import { extractShakenWithLayout, normPlate, ShakenFields } from '@/lib/shaken';
import { Box, pairLabelsAndValues } from '@/lib/shaken-layout';

// 文字の位置がわかるときは、項目名と値を位置で組み合わせて読む。わからないときは、文章だけで読む
const readFields = (text: string, boxes?: Box[]) => extractShakenWithLayout(text, boxes && boxes.length ? pairLabelsAndValues(boxes) : '');
import Modal from './Modal';

// 車検証の写真から、ナンバー・型式・車検満了日を読み取って、車両台帳に登録する。
// 同じナンバーの車両が台帳にあるときは、新しく作らず、その車両の車検満了日・型式を更新する。
// 使い方は3通り：
// - 何も指定しない：ナンバーが同じ車両があれば更新、無ければ新規登録（「車検証で登録・更新」）
// - target：登録済みのこの車両に、車検証の内容を追加する（車両カードの「車検証」）
// - onApply：保存はせず、読み取った内容を編集中の画面に入れるだけ（編集画面の「車検証から読み取る」）
type Extra = Pick<Vehicle, 'maker' | 'chassisNo' | 'firstRegistered' | 'capacity' | 'grossWeight' | 'displacement' | 'fuelType'>;

type DocKind = 'cert' | 'record';
const DOCS: { kind: DocKind; label: string; short: string }[] = [
  { kind: 'cert', label: '① 車検証（自動車検査証）', short: '車検証' },
  { kind: 'record', label: '② 検査証記録事項', short: '検査証記録事項' },
];

export default function VehicleOcrModal({
  data,
  onClose,
  onSave,
  target,
  onApply,
  onFileSaved,
  preload,
}: {
  data: AppData;
  onClose: () => void;
  onSave?: (v: Vehicle) => Promise<unknown>;
  target?: Vehicle;
  onApply?: (patch: Partial<Vehicle>) => void;
  // 車検証の画像を保存し終えたあとに呼ぶ（一覧の最新化用）
  onFileSaved?: () => void;
  // 開いた直後に、その車両の保存済みの画像（車検証／検査証記録事項）を読み込んでおく
  preload?: DocKind;
}) {
  // 読み込む書類は2種類：車検証（自動車検査証）と、検査証記録事項。どちらか片方でも、両方でも読み込める。
  // 項目は両方から集めて、足りないところを補い合う（有効期間の満了する日は、記録事項にだけ載っていることが多い）
  type DocState = { photo: string; pdfText: string; ocrText: string };
  const emptyDoc: DocState = { photo: '', pdfText: '', ocrText: '' };
  const [docs, setDocs] = useState<Record<DocKind, DocState>>({ cert: emptyDoc, record: emptyDoc });
  const setDoc = (k: DocKind, patch: Partial<DocState>) => setDocs((d) => ({ ...d, [k]: { ...d[k], ...patch } }));
  // 読み取った書類の画像も、あとで見られるよう保存する
  const [saveImage, setSaveImage] = useState(true);
  const [reading, setReading] = useState<DocKind | null>(null);
  const [running, setRunning] = useState<DocKind | null>(null);
  // AI（Claude）での読み取りが使えるか（サーバーにAPIキーが設定されているか）。管理者のみ
  const [aiAvail, setAiAvail] = useState<boolean | null>(null);
  const [aiRunning, setAiRunning] = useState<DocKind | null>(null);
  // 保存済みの画像（車両に登録してある車検証・検査証記録事項）を読み込む。管理者のみ
  async function loadSaved(kind: DocKind) {
    if (!target) return;
    setReading(kind);
    try {
      const res = await fetch(`/api/vehicles/${encodeURIComponent(target.id)}/shaken${kind === 'record' ? '?kind=record' : ''}`, { cache: 'no-store', headers: mechanicHeaders() });
      if (!res.ok) throw new Error('not found');
      const blob = await res.blob();
      const url: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error('read'));
        fr.readAsDataURL(blob);
      });
      setDoc(kind, { photo: url, pdfText: '', ocrText: '' });
    } catch {
      alert('保存済みの画像を読み込めませんでした。管理者ログインが切れていないか、確認してください。');
    } finally {
      setReading(null);
    }
  }
  useEffect(() => {
    if (preload) loadSaved(preload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    fetch('/api/shaken-ai', { cache: 'no-store', headers: mechanicHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setAiAvail(Boolean(j?.configured)))
      .catch(() => setAiAvail(false));
  }, []);
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
  const fileRefs = { cert: useRef<HTMLInputElement>(null), record: useRef<HTMLInputElement>(null) };

  // 台帳に同じナンバーの車両があるか
  const matched = useMemo(() => {
    const key = normPlate(plate);
    return key && !onApply ? data.vehicles.find((v) => normPlate(v.plate) === key) || null : null;
  }, [plate, data.vehicles, onApply]);
  // 更新先の車両（車両を指定したときはその車両。指定が無いときは、同じナンバーの車両）
  const existing = target || matched;
  const plateDiffers = !!target && !!plate.trim() && normPlate(plate) !== normPlate(target.plate);

  async function handleFile(kind: DocKind, file: File | null) {
    if (!file) return;
    setDoc(kind, { pdfText: '', ocrText: '' });
    if (isPdfFile(file)) {
      setReading(kind);
      try {
        const r = await readPdf(file);
        setDoc(kind, { photo: r.image });
        // 文字が十分に入っているPDFは、その文字を使う
        if (r.text.replace(/\s/g, '').length >= 40) {
          setDoc(kind, { pdfText: r.text });
          applyText(r.text, true, r.boxes);
        }
      } catch {
        alert('PDFを開けませんでした。ファイルをご確認いただくか、写真（画像）でお試しください。');
      } finally {
        setReading(null);
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDoc(kind, { photo: String(reader.result) });
    reader.readAsDataURL(file);
  }

  // 文字から項目を取り出してフォームに入れる。入れられた項目があれば true
  function applyText(text: string, fromPdf: boolean, boxes?: Box[]): boolean {
    return applyFields(readFields(text, boxes), fromPdf);
  }

  // 読み取った項目をフォームに入れる（OCR・PDFの文字・AIのどれからでも使う）
  function applyFields(f: ShakenFields, quiet: boolean): boolean {
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
    if (!found && !quiet) alert('書類から項目を読み取れませんでした。写真を撮り直すか、手入力してください。');
    return found;
  }

  async function runAi(kind: DocKind) {
    const photo = docs[kind].photo;
    if (!photo) return;
    setAiRunning(kind);
    try {
      // 送る画像は、約1.2MB以下のJPEGに縮める（文字が読める大きさは残す）
      const image = await compressToJpeg(photo, 2200, 1_200_000);
      const res = await fetch('/api/shaken-ai', { method: 'POST', headers: { 'Content-Type': 'application/json', ...mechanicHeaders() }, body: JSON.stringify({ image }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) {
        alert(j.message || 'AIでの読み取りに失敗しました。OCRで読み取るか、手入力してください。');
        return;
      }
      const f = j.fields as ShakenFields;
      if (!applyFields(f, true)) alert('AIが、この画像から項目を読み取れませんでした。写真を撮り直すか、手入力してください。');
    } catch {
      alert('AIでの読み取りに失敗しました。OCRで読み取るか、手入力してください。');
    } finally {
      setAiRunning(null);
    }
  }

  async function runOcr(kind: DocKind) {
    const photo = docs[kind].photo;
    if (!photo) return;
    setRunning(kind);
    setProgress(0);
    setDoc(kind, { ocrText: '' });
    try {
      const Tesseract = await loadTesseract();
      const img = await preprocessForOcr(photo);
      const logger = (m: { status?: string; progress?: number }) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') setProgress(Math.round(m.progress * 100));
      };
      // 1回目：ページ全体を自動で区切って読む。項目が少ししか取れなければ、2回目に「ひとかたまりの文章」として読み直し、多いほうを使う
      // 単語の位置（Tesseractが返すときだけ）。項目名と値を位置で組み合わせるのに使う
      const boxesOf = (r: any): Box[] =>
        (r?.data?.words || [])
          .filter((w: any) => w?.text && w?.bbox)
          .map((w: any) => ({ text: String(w.text), x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }));
      const first = await Tesseract.recognize(img, 'jpn+eng', { logger });
      let text: string = first?.data?.text || '';
      let boxes = boxesOf(first);
      if (Object.keys(readFields(text, boxes)).length < 4) {
        setProgress(0);
        const second = await Tesseract.recognize(img, 'jpn+eng', { logger, tessedit_pageseg_mode: '6' });
        const t2: string = second?.data?.text || '';
        const b2 = boxesOf(second);
        if (Object.keys(readFields(t2, b2)).length > Object.keys(readFields(text, boxes)).length) {
          text = t2;
          boxes = b2;
        }
      }
      setDoc(kind, { ocrText: text });
      applyText(text, false, boxes);
    } catch {
      alert('OCR処理に失敗しました。手入力で登録してください。');
    } finally {
      setRunning(null);
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
      if (saveImage && savedId) {
        const failed: string[] = [];
        let any = false;
        for (const d of DOCS) {
          if (!docs[d.kind].photo) continue;
          const ok = await uploadShakenImage(savedId, docs[d.kind].photo, d.kind);
          if (ok) any = true;
          else failed.push(d.short);
        }
        if (any) onFileSaved?.();
        if (failed.length > 0) alert(`車両は保存しましたが、${failed.join('・')}の画像は保存できませんでした（管理者ログインが切れた、または画像が大きすぎる可能性があります）。車両カードの「車検証」からもう一度保存できます。`);
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
        「車検証（自動車検査証）」と「検査証記録事項」のどちらでも、写真またはPDFから、ナンバー・型式・車検満了日・車台番号などの自動読み取りを試みます（OCRとPDFの読み取りは、ブラウザ内で処理し、外部送信なし）。両方読み込むと、足りない項目を補い合います（車検満了日は、記録事項にだけ載っていることが多いです）。読み取り精度は写真の状態により変わるため、登録前に必ず内容を書類と見比べて、修正してください。
      </div>

      {aiAvail && (
        <div className="notice-box">
          「🤖 AIで読み取る」は、写真をAI（Anthropic社のClaude）に送って読み取ります。OCRより正確ですが、写真が社外に送られます（所有者・使用者の氏名や住所は取り出しません）。外に出したくないときは、「🔍 OCRで読み取る」を使ってください。
        </div>
      )}
      {aiAvail === false && (
        <div className="notice-box" style={{ fontSize: 12 }}>
          ※ AIでの読み取りは、まだ設定されていません（管理者が、サーバーに ANTHROPIC_API_KEY を設定すると使えます）。
        </div>
      )}
      {DOCS.map((d) => {
        const doc = docs[d.kind];
        return (
          <div key={d.kind} style={{ marginBottom: 14 }}>
            <div className="section-heading" style={{ marginTop: 4 }}>{d.label}</div>
            {!doc.photo ? (
              <>
                <div className="photo-drop" onClick={() => fileRefs[d.kind].current?.click()}>
                  📷 タップして{d.short}の写真（またはPDF）を選ぶ
                </div>
                {target && (d.kind === 'record' ? target.recordFileAt : target.shakenFileAt) && (
                  <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => loadSaved(d.kind)} disabled={reading !== null}>
                    📎 登録済みの{d.short}の画像から読み込む
                  </button>
                )}
              </>
            ) : (
              <div>
                <img src={doc.photo} alt={`${d.short}のプレビュー`} className="photo-preview" />
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button className="btn btn-sm" onClick={() => fileRefs[d.kind].current?.click()}>
                    写真を変更
                  </button>
                  {target && (d.kind === 'record' ? target.recordFileAt : target.shakenFileAt) && (
                    <button className="btn btn-sm" onClick={() => loadSaved(d.kind)} disabled={reading !== null}>
                      📎 登録済みの画像
                    </button>
                  )}
                  {aiAvail && (
                    <button className="btn btn-sm btn-primary" onClick={() => runAi(d.kind)} disabled={aiRunning !== null || running !== null}>
                      {aiRunning === d.kind ? 'AIで読み取り中…' : '🤖 AIで読み取る（おすすめ）'}
                    </button>
                  )}
                  <button className={`btn btn-sm ${aiAvail ? '' : 'btn-primary'}`} onClick={() => runOcr(d.kind)} disabled={running !== null || aiRunning !== null}>
                    {running === d.kind ? `解析中…${progress}%` : '🔍 OCRで読み取る'}
                  </button>
                </div>
              </div>
            )}
            <input
              ref={fileRefs[d.kind]}
              type="file"
              accept="image/*,application/pdf,.pdf"
              hidden
              onChange={(e) => {
                handleFile(d.kind, e.target.files?.[0] || null);
                e.target.value = '';
              }}
            />
            {reading === d.kind && <div className="notice-box">PDFを読み込み中…</div>}
            {doc.pdfText && (
              <div className="notice-box">
                PDFに入っている文字から、項目を読み取りました（OCRは使っていません）。内容を{d.short}と見比べて、修正してください。読み取れなかった項目は、「🔍 OCRで読み取る」でも試せます。
                <details style={{ marginTop: 6 }}>
                  <summary style={{ cursor: 'pointer' }}>PDFから取り出した文字を見る</summary>
                  <div className="ocr-text-preview" style={{ marginTop: 6 }}>{doc.pdfText.trim()}</div>
                </details>
              </div>
            )}
            {doc.ocrText && (
              <>
                <div className="section-heading">OCR読み取り結果（テキスト）</div>
                <div className="ocr-text-preview">{doc.ocrText.trim() || '(テキストを検出できませんでした)'}</div>
              </>
            )}
          </div>
        );
      })}

      {(docs.cert.photo || docs.record.photo) && !onApply && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '4px 0 8px' }}>
          <input type="checkbox" checked={saveImage} onChange={(e) => setSaveImage(e.target.checked)} />
          読み込んだ書類の画像も保存して、あとで見られるようにする（管理者だけが見られます）
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
