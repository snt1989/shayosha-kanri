'use client';

import { useState } from 'react';
import { AppData, Driver, EmpIdRule, Masters, MasterKey } from '@/lib/types';
import MastersTab from './MastersTab';
import LogsTab from './LogsTab';
import DriversTab from './DriversTab';
import LogoTab from './LogoTab';

type AdminSection = 'drivers' | 'masters' | 'logs' | 'logo';

export default function AdminTab({
  data,
  isAdmin,
  adminConfigured,
  onSaveDriver,
  onDeleteDriver,
  onBulkSaveDrivers,
  onSaveCategory,
  onSaveAll,
  onSaveEmpIdRule,
  onRequestLogin,
  onClearLogs,
}: {
  data: AppData;
  isAdmin: boolean;
  adminConfigured: boolean;
  onSaveDriver: (d: Driver) => Promise<unknown>;
  onDeleteDriver: (id: string) => Promise<unknown>;
  onBulkSaveDrivers: (list: Driver[]) => Promise<unknown>;
  onSaveCategory: (category: MasterKey, items: string[]) => Promise<unknown>;
  onSaveAll: (masters: Masters) => Promise<unknown>;
  onSaveEmpIdRule: (r: EmpIdRule & { assignMissing?: boolean }) => Promise<unknown>;
  onRequestLogin: () => void;
  onClearLogs: () => Promise<unknown>;
}) {
  const [section, setSection] = useState<AdminSection>('drivers');

  if (!isAdmin) {
    return (
      <div className="card">
        <div className="locked-panel">
          <div className="lock-ic">🔒</div>
          <h3>管理者ログインが必要です</h3>
          <p>運転者台帳・各種マスタ設定・操作ログ／バックアップ・ロゴ・アイコンは、誤操作・改ざん防止のため管理者のみ利用できます。</p>
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

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="card-title" style={{ marginBottom: 4 }}>
          🛠️ 管理画面
        </h3>
        <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 12 }}>
          運転者台帳・各種マスタ設定と、操作ログ・バックアップ・ロゴ・アイコンをまとめて管理します。車両の管理は「車両台帳」のページに移しました。
        </div>
        <div className="subtabbar">
          <button className={`subtab ${section === 'drivers' ? 'active' : ''}`} onClick={() => setSection('drivers')}>
            <span>🪪</span>運転者台帳
          </button>
          <button className={`subtab ${section === 'masters' ? 'active' : ''}`} onClick={() => setSection('masters')}>
            <span>⚙️</span>各種マスタ設定
          </button>
          <button className={`subtab ${section === 'logs' ? 'active' : ''}`} onClick={() => setSection('logs')}>
            <span>🗂️</span>操作ログ・バックアップ
          </button>
          <button className={`subtab ${section === 'logo' ? 'active' : ''}`} onClick={() => setSection('logo')}>
            <span>🎨</span>ロゴ・アイコン
          </button>
        </div>
      </div>

      {section === 'drivers' && (
        <DriversTab data={data} onSave={onSaveDriver} onDelete={onDeleteDriver} onBulkSave={onBulkSaveDrivers} />
      )}
      {section === 'masters' && (
        <MastersTab
          masters={data.masters}
          empIdRule={data.empIdRule}
          drivers={data.drivers}
          onSaveEmpIdRule={onSaveEmpIdRule}
          isAdmin={isAdmin}
          adminConfigured={adminConfigured}
          onSaveCategory={onSaveCategory}
          onSaveAll={onSaveAll}
          onRequestLogin={onRequestLogin}
        />
      )}
      {section === 'logo' && <LogoTab />}
      {section === 'logs' && (
        <LogsTab
          data={data}
          isAdmin={isAdmin}
          adminConfigured={adminConfigured}
          onRequestLogin={onRequestLogin}
          onClearLogs={onClearLogs}
        />
      )}
    </div>
  );
}
