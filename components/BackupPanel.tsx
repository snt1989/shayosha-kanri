'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadJson } from '@/lib/csv';
import { todayStr } from '@/lib/utils';

type Snap = { id: string; createdAt: string; reports: number; vehicles: number; drivers: number; bytes: number };
type Pending = { label: string; body: Record<string, unknown>; summary: string };

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '不明' : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

// 設定「操作ログ・バックアップ」の中の、バックアップと復元（管理者のみ）。
// 全種類のバックアップのダウンロード、毎晩の自動の控え（7日分）の一覧、控え・ファイルからの復元。
export default function BackupPanel() {
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const j = await (await fetch('/api/backup/list', { cache: 'no-store' })).json();
      if (j.success) setSnaps(j.snapshots);
    } catch {
      setSnaps([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function download(id?: string) {
    setBusy(id || 'now');
    setMsg(null);
    try {
      const res = await fetch(`/api/backup${id ? `?id=${encodeURIComponent(id)}` : ''}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || 'バックアップを取得できませんでした。');
      downloadJson(`運行管理_完全バックアップ_${id || todayStr()}.json`, j);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'バックアップを取得できませんでした。' });
    } finally {
      setBusy('');
    }
  }

  async function snapNow() {
    setBusy('snap');
    setMsg(null);
    try {
      const j = await (await fetch('/api/backup/list', { method: 'POST' })).json();
      if (!j.success) throw new Error(j.message || '控えを作れませんでした。');
      setSnaps(j.snapshots);
      setMsg({ ok: true, text: '今日の控えを作りました。' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '控えを作れませんでした。' });
    } finally {
      setBusy('');
    }
  }

  async function pickFile(file: File | null) {
    if (!file) return;
    setMsg(null);
    try {
      const raw = JSON.parse(await file.text());
      const d = raw?.format === 'fleet-backup' ? raw.data : raw;
      if (!d || !Array.isArray(d.reports) || !Array.isArray(d.vehicles) || !Array.isArray(d.drivers)) throw new Error('形がちがう');
      setPending({
        label: `ファイル「${file.name}」`,
        body: { backup: raw },
        summary: `${raw?.createdAt ? `作成：${fmt(raw.createdAt)}　` : ''}日報${d.reports.length}件・車両${d.vehicles.length}台・運転者${d.drivers.length}名${raw?.format === 'fleet-backup' ? '' : '（以前の形式：日報・車両・運転者などの本体だけを戻します）'}`,
      });
      setConfirmText('');
    } catch {
      setMsg({ ok: false, text: 'このファイルは、このアプリのバックアップとして読めませんでした。' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function restore() {
    if (!pending) return;
    setBusy('restore');
    setMsg(null);
    try {
      const res = await fetch('/api/backup/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pending.body, confirm: confirmText }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.message || '復元できませんでした。');
      setMsg({ ok: true, text: `復元しました（日報${j.reports}件・車両${j.vehicles}台・運転者${j.drivers}名）。画面を読み込み直します…` });
      setPending(null);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '復元できませんでした。' });
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3 className="card-title">📦 バックアップと復元</h3>
      <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 10 }}>
        日報・車両・運転者・マスタ・操作ログに加えて、お知らせ・事故報告・緊急連絡先・保険情報・カード・アラート設定なども、すべて入ります（写真と車検証の画像は入りません）。毎晩2時ごろ、自動で控えを取り、7日分を残します。
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button className="btn btn-primary btn-sm" disabled={busy !== ''} onClick={() => download()}>
          {busy === 'now' ? '作成中…' : '⬇ いまの完全バックアップをダウンロード'}
        </button>
        <button className="btn btn-sm" disabled={busy !== ''} onClick={snapNow}>
          {busy === 'snap' ? '作成中…' : '📌 いますぐ控えを作る'}
        </button>
        <button className="btn btn-sm" disabled={busy !== ''} onClick={() => fileRef.current?.click()}>
          ⬆ ファイルから復元…
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => pickFile(e.target.files?.[0] || null)} />
      </div>

      <div className="ins-group-title">毎晩の自動の控え</div>
      {snaps === null ? (
        <div className="empty-state">読み込み中…</div>
      ) : snaps.length === 0 ? (
        <div className="empty-state">まだ控えがありません（今夜から自動で作られます）</div>
      ) : (
        <div className="backup-list">
          {snaps.map((s) => (
            <div key={s.id} className="backup-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{s.id === 'pre-restore' ? '復元する直前の状態' : s.id}</strong>
                <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
                  {fmt(s.createdAt)}　日報{s.reports}件・車両{s.vehicles}台・運転者{s.drivers}名　{kb(s.bytes)}
                </div>
              </div>
              <button className="btn btn-sm" disabled={busy !== ''} onClick={() => download(s.id)}>
                ⬇
              </button>
              <button
                className="btn btn-sm btn-danger"
                disabled={busy !== ''}
                onClick={() => {
                  setPending({ label: s.id === 'pre-restore' ? '復元する直前の状態' : `${s.id} の控え`, body: { id: s.id }, summary: `作成：${fmt(s.createdAt)}　日報${s.reports}件・車両${s.vehicles}台・運転者${s.drivers}名` });
                  setConfirmText('');
                }}
              >
                この状態に戻す
              </button>
            </div>
          ))}
        </div>
      )}

      {pending && (
        <div className="notice-box backup-confirm" role="alertdialog" aria-label="復元の確認">
          <strong>⚠ {pending.label} に戻します</strong>
          <div style={{ margin: '6px 0' }}>{pending.summary}</div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            いまのデータは、すべてこの内容に置き換わります（それより後に入力した日報なども消えます）。いまの状態は「復元する直前の状態」として1つ残るので、まちがえたときは、そこから戻せます。続けるには、下に「復元」と入力してください。
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="復元" aria-label="確認の文字" style={{ width: 120 }} />
            <button className="btn btn-danger" disabled={confirmText !== '復元' || busy !== ''} onClick={restore}>
              {busy === 'restore' ? '復元中…' : '復元する'}
            </button>
            <button className="btn" disabled={busy !== ''} onClick={() => setPending(null)}>
              やめる
            </button>
          </div>
        </div>
      )}
      {msg && (
        <div role="status" className="notice-box" style={{ marginTop: 10, borderColor: msg.ok ? 'var(--green-600, #16a34a)' : undefined }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
