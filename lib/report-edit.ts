import type { Report, ReportEdit } from '@/lib/types';

// 帰着済み（確定済み）の日報を直したときに残す、修正の履歴。アルコールチェックの記録を、あとから書き換えたことが分かるようにする。
const FIELDS: { key: keyof Report; label: string }[] = [
  { key: 'date', label: '日付' },
  { key: 'driver', label: '運転者' },
  { key: 'vehicleName', label: '車両' },
  { key: 'destination', label: '行先' },
  { key: 'purpose', label: '用件' },
  { key: 'preTime', label: '運転前の時刻' },
  { key: 'preAlcohol', label: '運転前のアルコール' },
  { key: 'preChecker', label: '運転前の確認者' },
  { key: 'preMethod', label: '運転前の確認方法' },
  { key: 'postTime', label: '運転後の時刻' },
  { key: 'postAlcohol', label: '運転後のアルコール' },
  { key: 'postChecker', label: '運転後の確認者' },
  { key: 'postMethod', label: '運転後の確認方法' },
  { key: 'alcoholSkipped', label: 'アルコールチェックのパス' },
  { key: 'startKm', label: '出発時のメーター' },
  { key: 'endKm', label: '帰着時のメーター' },
  { key: 'notes', label: '特記事項' },
];
const text = (v: unknown) => (v === true ? 'あり' : v === false || v === undefined || v === null ? '' : String(v));

export function diffReport(before: Report, after: Report): ReportEdit['changes'] {
  const out: ReportEdit['changes'] = [];
  for (const f of FIELDS) {
    const a = text(before[f.key]);
    const b = text(after[f.key]);
    if (a !== b) out.push({ label: f.label, from: a.slice(0, 120), to: b.slice(0, 120) });
  }
  return out;
}

export const EDIT_LOG_MAX = 20;
export function appendEdit(before: Report, after: Report, by: string, at = new Date().toISOString()): ReportEdit[] | undefined {
  const prev = before.editLog || [];
  const changes = diffReport(before, after);
  if (changes.length === 0) return prev.length ? prev : undefined;
  return [...prev, { at, by, changes }].slice(-EDIT_LOG_MAX);
}

export const editSummary = (e: ReportEdit) => `${new Date(e.at).toLocaleString('ja-JP')} ${e.by}：${e.changes.map((c) => `${c.label}「${c.from || '（空）'}」→「${c.to || '（空）'}」`).join('、')}`;
