'use client';

import { useState } from 'react';
import { AppData, Driver, MAINT_URGENCIES } from '@/lib/types';
import Modal from './Modal';

export type MaintRequestInput = { vehicleId: string; type: string; urgency: string; note: string; driverId: string };

// ダッシュボードから直接出す整備依頼の入力画面。
// 帰着登録のときに出す依頼と同じく、整備台帳で対応済にするまで「対応待ち」に表示される。
export default function MaintRequestModal({
  data,
  driver,
  initialVehicleId,
  initialType,
  initialNote,
  onClose,
  onSubmit,
}: {
  data: AppData;
  driver: Driver;
  initialVehicleId?: string;
  initialType?: string; // アラートから開いたときの整備の種類（マスタにあるものだけ使う）
  initialNote?: string; // アラートから開いたときの、あらかじめ入れておく内容
  onClose: () => void;
  onSubmit: (r: MaintRequestInput) => Promise<unknown>;
}) {
  const [vehicleId, setVehicleId] = useState(initialVehicleId || data.vehicles[0]?.id || '');
  const [type, setType] = useState(initialType && data.masters.maintTypes.includes(initialType) ? initialType : data.masters.maintTypes[0] || '');
  const [urgency, setUrgency] = useState<string>(MAINT_URGENCIES[0]);
  const [note, setNote] = useState(initialNote || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!vehicleId) return setError('車両を選んでください。');
    if (!note.trim()) return setError('依頼の内容（どこがどう悪いか）を入れてください。');
    setSaving(true);
    setError('');
    try {
      await onSubmit({ vehicleId, type, urgency, note: note.trim(), driverId: driver.id });
      onClose();
    } catch {
      setError('送信できませんでした。通信を確認して、もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="🔧 整備を依頼する"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? '送信中…' : '依頼を出す'}
          </button>
        </>
      }
    >
      <div className="notice-box">
        車の不具合や整備してほしいことを、日報を書かなくても依頼できます。出した依頼は、整備台帳に「対応待ち」で表示されます。依頼者：{driver.lastName} {driver.firstName}
      </div>
      <div className="field">
        <label>車両</label>
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          {data.vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}（{v.plate}）
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <div className="field">
          <label>整備の種類</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {data.masters.maintTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
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
        <label>依頼の内容（必須・500文字まで）</label>
        <textarea rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：ブレーキを踏むとキーキー音がする／左後ろのタイヤの空気圧が低い" />
      </div>
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
