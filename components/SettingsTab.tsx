'use client';

import { useState } from 'react';
import { AppData, Driver, EmpIdRule, Masters, MasterKey } from '@/lib/types';
import { TabKey } from '@/lib/menu';
import MastersTab from './MastersTab';
import LogsTab from './LogsTab';
import DriversTab from './DriversTab';
import LogoTab from './LogoTab';
import CardsAdmin from './CardsAdmin';
import MenuOrderSettings from './MenuOrderSettings';
import AlertSettingsPanel from './AlertSettingsPanel';

type Section = 'menu' | 'alerts' | 'cards' | 'drivers' | 'masters' | 'logs' | 'logo';

// 管理者だけが使えるもの（メニューの並び替えだけは誰でも使える）
const SECTIONS: { key: Section; icon: string; label: string; admin: boolean }[] = [
  { key: 'menu', icon: '↕️', label: 'メニューの並び替え', admin: false },
  { key: 'alerts', icon: '⏰', label: 'アラートの出す時期', admin: true },
  { key: 'cards', icon: '💳', label: 'カードの登録', admin: true },
  { key: 'drivers', icon: '🪪', label: '運転者台帳', admin: true },
  { key: 'masters', icon: '⚙️', label: '各種マスタ設定', admin: true },
  { key: 'logs', icon: '🗂️', label: '操作ログ・バックアップ', admin: true },
  { key: 'logo', icon: '🎨', label: 'ロゴ・アイコン', admin: true },
];

// 「設定」ページ：メニューの並び替え（誰でも・この端末だけ）と、管理者向けの設定（カード・運転者台帳・マスタ・操作ログ・ロゴ）をまとめたもの。
export default function SettingsTab({
  data,
  isAdmin,
  adminConfigured,
  menuOrder,
  onChangeMenuOrder,
  onSaveDriver,
  onDeleteDriver,
  onBulkSaveDrivers,
  onSaveCategory,
  onSaveAll,
  onSaveEmpIdRule,
  onRequestLogin,
  onClearLogs,
  onRefresh,
}: {
  data: AppData;
  isAdmin: boolean;
  adminConfigured: boolean;
  menuOrder: TabKey[];
  onChangeMenuOrder: (o: TabKey[]) => void;
  onSaveDriver: (d: Driver) => Promise<unknown>;
  onDeleteDriver: (id: string) => Promise<unknown>;
  onBulkSaveDrivers: (list: Driver[]) => Promise<unknown>;
  onSaveCategory: (category: MasterKey, items: string[]) => Promise<unknown>;
  onSaveAll: (masters: Masters) => Promise<unknown>;
  onSaveEmpIdRule: (r: EmpIdRule & { assignMissing?: boolean }) => Promise<unknown>;
  onRequestLogin: () => void;
  onClearLogs: () => Promise<unknown>;
  onRefresh: () => Promise<unknown>;
}) {
  const [section, setSection] = useState<Section>('menu');
  const current = SECTIONS.find((s) => s.key === section)!;
  const locked = current.admin && !isAdmin;

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="card-title" style={{ marginBottom: 4 }}>
          ⚙️ 設定
        </h3>
        <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 12 }}>
          メニューの並び替え（この端末だけ）と、アラートの出す時期・カードの登録・運転者台帳・各種マスタ設定・操作ログ／バックアップ・ロゴ／アイコン（管理者のみ）をまとめて管理します。車両の管理は「車両台帳」のページです。
        </div>
        <div className="subtabbar">
          {SECTIONS.map((s) => (
            <button key={s.key} className={`subtab ${section === s.key ? 'active' : ''}`} onClick={() => setSection(s.key)}>
              <span>{s.admin && !isAdmin ? '🔒' : s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {locked ? (
        <div className="card">
          <div className="locked-panel">
            <div className="lock-ic">🔒</div>
            <h3>管理者ログインが必要です</h3>
            <p>カードの登録・運転者台帳・各種マスタ設定・操作ログ／バックアップ・ロゴ／アイコンは、誤操作・改ざん防止のため管理者のみ利用できます。</p>
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
      ) : (
        <>
          {section === 'menu' && <MenuOrderSettings order={menuOrder} onChange={onChangeMenuOrder} />}
          {section === 'alerts' && <AlertSettingsPanel current={data.alertSettings} onSaved={onRefresh} />}
          {section === 'cards' && <CardsAdmin departments={data.masters.departments} isAdmin={isAdmin} onRequestAdminLogin={onRequestLogin} />}
          {section === 'drivers' && <DriversTab data={data} onSave={onSaveDriver} onDelete={onDeleteDriver} onBulkSave={onBulkSaveDrivers} />}
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
            <LogsTab data={data} isAdmin={isAdmin} adminConfigured={adminConfigured} onRequestLogin={onRequestLogin} onClearLogs={onClearLogs} />
          )}
        </>
      )}
    </div>
  );
}
