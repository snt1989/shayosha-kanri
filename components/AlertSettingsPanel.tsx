'use client';

import { useEffect, useState } from 'react';
import { ALERT_LIMITS, AlertSettings, DEFAULT_ALERT_SETTINGS, normalizeAlertSettings } from '@/lib/alert-settings';

type Draft = { shakenDays: string; licenseDays: string; oilKm: string };
const toDraft = (s: AlertSettings): Draft => ({ shakenDays: String(s.shakenDays), licenseDays: String(s.licenseDays), oilKm: String(s.oilKm) });

// 設定画面の「アラートの出す時期」。車検・免許・オイル交換のアラートを、いつから出すかを変える（管理者のみ）。
export default function AlertSettingsPanel({ current, onSaved }: { current?: AlertSettings; onSaved: () => Promise<unknown> | void }) {
  const saved = normalizeAlertSettings(current);
  const [draft, setDraft] = useState<Draft>(toDraft(saved));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // 保存済みの値が変わったとき（読み込み直し・保存後）に入力欄へ反映する
  useEffect(() => {
    setDraft(toDraft(normalizeAlertSettings(current)));
  }, [current?.shakenDays, current?.licenseDays, current?.oilKm]); // eslint-disable-line react-hooks/exhaustive-deps

  const L = ALERT_LIMITS;
  const fields: { key: keyof Draft; label: string; unit: string; hint: string; min: number; max: number; step?: number }[] = [
    { key: 'shakenDays', label: '車検の満了日', unit: '日前から', hint: '例：30 なら、満了日の30日前から「車検・点検アラート」に出ます（過ぎたものも出ます）。', ...L.shakenDays },
    { key: 'licenseDays', label: '免許の更新期日', unit: '日前から', hint: '例：30 なら、更新期日の30日前から「免許更新アラート」に出ます（過ぎたものも出ます）。', ...L.licenseDays },
    { key: 'oilKm', label: 'オイル交換', unit: 'km 手前から', hint: '例：1000 なら、次回交換の目安まで残り1,000km以内の車が「オイル交換アラート」に出ます。', step: 100, ...L.oilKm },
  ];

  const parsed = normalizeAlertSettings({ shakenDays: draft.shakenDays, licenseDays: draft.licenseDays, oilKm: draft.oilKm });
  const invalid = fields.some((f) => {
    const n = Number(draft[f.key]);
    return !Number.isInteger(n) || n < f.min || n > f.max;
  });
  const changed = !invalid && (parsed.shakenDays !== saved.shakenDays || parsed.licenseDays !== saved.licenseDays || parsed.oilKm !== saved.oilKm);

  async function save(values: AlertSettings) {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/alert-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.message || '保存できませんでした。');
      setMsg('保存しました。ダッシュボードのアラートや通知にも反映されます。');
      await onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3 className="card-title">⏰ アラートの出す時期</h3>
      <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 12 }}>
        車検・免許・オイル交換のアラートを、いつから出すかを決めます。ダッシュボードの数字とアラート、🔔お知らせ、毎朝の通知、一覧の「あと◯日」の色づけに使われます。
      </div>
      <div className="alert-settings">
        {fields.map((f) => (
          <div className="field" key={f.key}>
            <label>{f.label}</label>
            <div className="alert-setting-row">
              <input
                type="number"
                inputMode="numeric"
                min={f.min}
                max={f.max}
                step={f.step || 1}
                value={draft[f.key]}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              />
              <span>{f.unit}</span>
              <span className="alert-setting-default">（初期値 {DEFAULT_ALERT_SETTINGS[f.key].toLocaleString()}）</span>
            </div>
            <div className="alert-setting-hint">
              {f.hint} <span>{f.min.toLocaleString()}〜{f.max.toLocaleString()} の整数で入力できます。</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-primary" disabled={busy || !changed} onClick={() => save(parsed)}>
          保存する
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => save(DEFAULT_ALERT_SETTINGS)}>
          初期値に戻す
        </button>
        {invalid && <span style={{ color: 'var(--red-600)', fontSize: 12 }}>入力できる範囲を確認してください。</span>}
        {msg && <span style={{ fontSize: 12, color: 'var(--slate-600)' }}>{msg}</span>}
      </div>
    </div>
  );
}
