'use client';

import { useState } from 'react';
import { AppData, Vehicle } from '@/lib/types';
import VehiclesTab from './VehiclesTab';
import VehicleListTab from './VehicleListTab';

// 「車両台帳」ページ：車両の一覧。誰でも見られる。登録・編集・削除・取込・車検証の読み取りは管理者と整備士。
export default function VehicleLedgerTab({
  data,
  isAdmin,
  isMechanic = false,
  onSave,
  onDelete,
  onBulkSave,
  onRequestLogin,
  onRefresh,
}: {
  data: AppData;
  isAdmin: boolean;
  isMechanic?: boolean;
  onSave: (v: Vehicle) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onBulkSave: (list: Vehicle[]) => Promise<unknown>;
  onRequestLogin: () => void;
  onRefresh?: () => unknown;
}) {
  // 一覧表（全車両を見比べる）／カード（登録・編集・車検証・整備記録）の切り替え
  const [view, setView] = useState<'list' | 'cards'>('list');
  return (
    <div>
      <div className="type-chips" style={{ marginBottom: 12 }}>
        <button type="button" className={`btn btn-sm ${view === 'list' ? 'btn-primary' : ''}`} aria-pressed={view === 'list'} onClick={() => setView('list')}>
          📋 一覧表
        </button>
        <button type="button" className={`btn btn-sm ${view === 'cards' ? 'btn-primary' : ''}`} aria-pressed={view === 'cards'} onClick={() => setView('cards')}>
          🗂 カード（登録・編集）
        </button>
      </div>
      {!isAdmin && !isMechanic && (
        <div className="notice-box" style={{ marginBottom: 12 }}>
          見るだけの画面です。車両の登録・編集・削除・車検証の読み取りは、管理者か整備士のログインが必要です。{' '}
          <button type="button" className="btn btn-sm" onClick={onRequestLogin}>
            🔒 ログイン
          </button>
        </div>
      )}
      {view === 'list' ? (
        <VehicleListTab data={data} onOpenLedger={() => setView('cards')} />
      ) : (
      <VehiclesTab data={data} onSave={onSave} onDelete={onDelete} onBulkSave={onBulkSave} readOnly={!(isAdmin || isMechanic)} onRefresh={onRefresh} />
      )}
    </div>
  );
}
