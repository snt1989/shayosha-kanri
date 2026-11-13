'use client';

import { useState } from 'react';
import { AppData, Driver, MAINT_URGENCIES, Report } from '@/lib/types';
import { splitMaintTypes } from '@/lib/utils';
import Modal from './Modal';
import PhotoField from './PhotoField';

export type MaintRequestInput = { vehicleId: string; type: string; urgency: string; note: string; driverId: string; photos: string[] };

// ダッシュボードから直接出す整備依頼の入力画面。
// 帰着登録のときに出す依頼と同じく、整備台帳で対応済にするまで「対応待ち」に表示される。
export default function MaintRequestModal({
  data,
  driver,
  editing,
  initialVehicleId,
  initialType,
  initialNote,
  onClose,
  onSubmit,
}: {
  data: AppData;
  driver?: Driver | null; // 新しく出すときの依頼者（編集のときは不要）
  editing?: Report; // 渡すと、その依頼を編集する画面になる
  initialVehicleId?: string;
  initialType?: string; // アラートから開いたときの整備の種類（マスタにあるものだけ使う）
  initialNote?: string; // アラートから開いたときの、あらかじめ入れておく内容
  onClose: () => void;
  onSubmit: (r: MaintRequestInput) => Promise<unknown>;
}) {
  const [vehicleId, setVehicleId] = useState(editing?.vehicleId || initialVehicleId || data.vehicles[0]?.id || '');
  // 整備の種類は複数選べる（保存は「、」でつないだ文字列）
  const [types, setTypes] = useState<string[]>(
    editing
      ? splitMaintTypes(editing.maintRequestType)
      : initialType && data.masters.maintTypes.includes(initialType)
        ? [initialType]
        : data.masters.maintTypes[0]
          ? [data.masters.maintTypes[0]]
          : []
  );
  const typeOptions = [...types.filter((t) => !data.masters.maintTypes.includes(t)), ...data.masters.maintTypes];
  const [urgency, setUrgency] = useState<string>(editing?.maintRequestUrgency || MAINT_URGENCIES[0]);
  const [note, setNote] = useState(editing?.maintRequestNote ?? initialNote ?? '');
  const [photos, setPhotos] = useState<string[]>(editing?.maintRequestPhotos || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!vehicleId) return setError('車両を選んでください。');
    if (!types.length) return setError('整備の種類を1つ以上選んでください。');
    setSaving(true);
    setError('');
    try {
      await onSubmit({ vehicleId, type: types.join('、'), urgency, note: note.trim(), driverId: driver?.id || '', photos });
      onClose();
    } catch {
      setError('送信できませんでした。通信を確認して、もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? '✏️ 整備依頼を編集する' : '🔧 整備を依頼する'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? '送信中…' : editing ? '保存する' : '依頼を出す'}
          </button>
        </>
      }
    >
      <div className="notice-box">
        {editing
          ? `依頼者：${editing.driver}（${editing.date}）。種類・緊急度・内容を直せます。${editing.maintOnly ? '' : '車両は、依頼を出した日報の車両なので変更できません。'}`
          : `車の不具合や整備してほしいことを、日報を書かなくても依頼できます。出した依頼は、整備台帳に「対応待ち」で表示されます。依頼者：${driver?.lastName ?? ''} ${driver?.firstName ?? ''}`}
      </div>
      <div className="field">
        <label>車両</label>
        <select value={vehicleId} disabled={!!editing && !editing.maintOnly} onChange={(e) => setVehicleId(e.target.value)}>
          {data.vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}（{v.plate}）
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <div className="field">
          <label>整備の種類（複数選べます）</label>
          <div className="type-chips">
            {typeOptions.map((t) => {
              const on = types.includes(t);
              return (
                <button key={t} type="button" className={`btn btn-sm ${on ? 'btn-primary' : ''}`} aria-pressed={on} onClick={() => setTypes(on ? types.filter((x) => x !== t) : [...types, t])}>
                  {on ? '✓ ' : ''}
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div className="field">
          <label>緊急度</label>
          <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
            {MAINT_URGENCIES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>依頼の内容（任意・500文字まで）</label>
        <textarea rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：ブレーキを踏むとキーキー音がする／左後ろのタイヤの空気圧が低い" />
      </div>
      <PhotoField ids={photos} onChange={setPhotos} label="写真（任意・故障箇所や警告灯など）" />
      {urgency === MAINT_URGENCIES[2] && (
        <div className="notice-box" style={{ borderColor: 'var(--red-600, #dc2626)' }}>
          「至急（使用不可）」は、その車を使わないでほしいときに選びます。必要なら、管理者にも直接連絡してください。
        </div>
      )}
      {error && (
        <div role="alert" className="notice-box" style={{ borderColor: 'var(--red-600, #dc2626)' }}>
          {error}
        </div>
      )}
    </Modal>
  );
}
