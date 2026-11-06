'use client';

import { useState } from 'react';
import { AppData } from '@/lib/types';
import { downloadCsv, downloadJson, logsToCsv } from '@/lib/csv';
import { formatBytes, todayStr } from '@/lib/utils';

// Upstash Redis 無料プランのデータ容量上限（目安）。実際の契約プランによって異なる場合があります。
const UPSTASH_FREE_LIMIT_BYTES = 256 * 1024 * 1024;

export default function LogsTab({
  data,
  isAdmin,
  adminConfigured,
  onRequestLogin,
  onClearLogs,
}: {
  data: AppData;
  isAdmin: boolean;
  adminConfigured: boolean;
  onRequestLogin: () => void;
  onClearLogs: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);

  if (!isAdmin) {
    return (
      <div className="card">
        <div className="locked-panel">
          <div className="lock-ic">🔒</div>
          <h3>管理者ログインが必要です</h3>
          <p>
            誰がいつ日報・車両・運転者・マスタを登録／編集／削除したかの操作ログと、
            全データのバックアップ機能は管理者のみ利用できます。
          </p>
          <button className="btn btn-primary" onClick={onRequestLogin}>
            🔒 管理者ログイン
          </button>
          {!adminConfigured && (
            <p style={{ marginTop: 14, color: 'var(--amber-600)' }}>
              ※ サーバーに ADMIN_PASSWORD が未設定です。Vercelの環境変数を設定してください。
            </p>
          )}
        </div>
      </div>
    );
  }

  function exportLogsCsv() {
    downloadCsv(`操作ログ_${todayStr()}.csv`, logsToCsv(data.logs).replace(/^﻿/, ''));
  }

  function exportFullBackup() {
    const { persistent, ...backup } = data;
    void persistent;
    downloadJson(`社用車管理_全データバックアップ_${todayStr()}.json`, backup);
  }

  async function handleClear() {
    if (!confirm(`操作ログ ${data.logs.length}件をすべて消去します。よろしいですか？（この操作自体もログに記録されます）`)) return;
    setBusy(true);
    try {
      await onClearLogs();
    } finally {
      setBusy(false);
    }
  }

  const { persistent: _persistent, ...storagePayload } = data;
  void _persistent;
  const dataSizeBytes = new TextEncoder().encode(JSON.stringify(storagePayload)).length;
  const usagePercent = Math.min(100, (dataSizeBytes / UPSTASH_FREE_LIMIT_BYTES) * 100);

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="card-title" style={{ marginBottom: 4 }}>
          💾 サーバー容量・使用状況
        </h3>
        <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 14 }}>
          保存先と、現在保存されているデータの容量（推定）を確認できます。
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span className={`pill ${data.persistent ? 'pill-green' : 'pill-amber'}`}>
            {data.persistent ? '🟢 Upstash Redis 接続中（永続化）' : '🟡 未接続（一時保存のみ）'}
          </span>
        </div>

        {data.persistent && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span>使用容量（推定）</span>
              <span>
                {formatBytes(dataSizeBytes)} / {formatBytes(UPSTASH_FREE_LIMIT_BYTES)}（無料プラン上限の目安）
              </span>
            </div>
            <div style={{ background: 'var(--slate-100)', borderRadius: 999, height: 8, overflow: 'hidden', marginBottom: 6 }}>
              <div
                style={{
                  width: `${usagePercent}%`,
                  height: '100%',
                  background: usagePercent > 80 ? 'var(--red-500, #ef4444)' : 'var(--sky-500, #0ea5e9)',
                }}
              />
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--slate-400)', marginBottom: 14 }}>
              ※ この数値はブラウザ側で計算したデータサイズの概算です。実際のUpstash上の使用量とは若干異なる場合があります。契約プランによって上限も異なります。
            </div>
          </>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
            gap: 8,
            fontSize: 12,
          }}
        >
          <div className="stat-tile">
            <div className="label">日報</div>
            <div className="value">{data.reports.filter((r) => !r.maintOnly).length}件</div>
          </div>
          <div className="stat-tile">
            <div className="label">車両</div>
            <div className="value">{data.vehicles.length}台</div>
          </div>
          <div className="stat-tile">
            <div className="label">運転者</div>
            <div className="value">{data.drivers.length}名</div>
          </div>
          <div className="stat-tile">
            <div className="label">操作ログ</div>
            <div className="value">{data.logs.length}件</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar2">
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}>
              🗂️ 操作ログ・バックアップ
            </h3>
            <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
              日報・車両・運転者・マスタ・管理者ログインの操作履歴を記録しています（最新500件を保持）。
            </div>
          </div>
          <div className="actions">
            <button className="btn btn-sm" onClick={exportLogsCsv}>
              ⬇ ログCSV出力
            </button>
            <button className="btn btn-sm" style={{ background: 'var(--sky-50, #f0f9ff)', borderColor: 'var(--sky-100, #bae6fd)', color: 'var(--sky-700)' }} onClick={exportFullBackup}>
              📦 全データJSONバックアップ
            </button>
            <button className="btn btn-sm btn-danger" onClick={handleClear} disabled={busy || data.logs.length === 0}>
              🗑 ログを消去
            </button>
          </div>
        </div>

        {!data.persistent && (
          <div className="notice-box" style={{ marginBottom: 14 }}>
            現在このアプリのデータは永続化ストレージ（Upstash Redis）に接続されていません。
            サーバー再起動やデプロイでデータが消える可能性があるため、こまめに
            「全データJSONバックアップ」で保存しておくことをおすすめします。
          </div>
        )}

        {data.logs.length === 0 ? (
          <div className="empty-state">操作ログはまだありません</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>日時</th>
                  <th>操作者</th>
                  <th>操作内容</th>
                  <th>対象</th>
                  <th>詳細</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.at).toLocaleString('ja-JP')}</td>
                    <td>
                      <span className={`pill ${l.actor === 'admin' ? 'pill-amber' : 'pill-slate'}`}>
                        {l.actor === 'admin' ? '管理者' : '利用者'}
                      </span>
                    </td>
                    <td>{l.action}</td>
                    <td>{l.target}</td>
                    <td>{l.detail || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
