'use client';

import { AppData, Vehicle } from '@/lib/types';
import VehiclesTab from './VehiclesTab';

// 「車両台帳」ページ：社用車の一覧。誰でも見られる。登録・編集・削除・取込・車検証の読み取りは管理者のみ。
export default function VehicleLedgerTab({
  data,
  isAdmin,
  onSave,
  onDelete,
  onBulkSave,
  onRequestLogin,
}: {
  data: AppData;
  isAdmin: boolean;
  onSave: (v: Vehicle) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onBulkSave: (list: Vehicle[]) => Promise<unknown>;
  onRequestLogin: () => void;
}) {
  return (
    <div>
      {!isAdmin && (
        <div className="notice-box" style={{ marginBottom: 12 }}>
          見るだけの画面です。車両の登録・編集・削除・車検証の読み取りは、管理者ログインが必要です。{' '}
          <button type="button" className="btn btn-sm" onClick={onRequestLogin}>
            🔒 管理者ログイン
          </button>
        </div>
      )}
      <VehiclesTab data={data} onSave={onSave} onDelete={onDelete} onBulkSave={onBulkSave} readOnly={!isAdmin} />
    </div>
  );
}
