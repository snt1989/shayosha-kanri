'use client';

type Tab = 'dashboard' | 'reports' | 'maintenance' | 'fuel' | 'rental' | 'help' | 'admin';
type SyncStatus = 'idle' | 'saving' | 'error';

const TABS: { key: Tab; label: string; icon: string; admin?: boolean }[] = [
  { key: 'dashboard', label: 'ダッシュボード', icon: '📊' },
  { key: 'reports', label: '運転日報', icon: '📝' },
  { key: 'fuel', label: '給油台帳', icon: '⛽' },
  { key: 'rental', label: 'レンタカー', icon: '🚗' },
  { key: 'maintenance', label: '整備台帳', icon: '🔧' },
  { key: 'help', label: '使い方', icon: '❓' },
  { key: 'admin', label: '管理画面', icon: '🛠️', admin: true },
];

export default function Header({
  tab,
  onTabChange,
  syncStatus,
  isAdmin,
  onOpenAdminLogin,
  onLogoutAdmin,
  onQuickReport,
  currentDriverName,
  onOpenDriverLogin,
  onDriverLogout,
  mechanicName,
  onOpenMechanicLogin,
  onMechanicLogout,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  syncStatus: SyncStatus;
  isAdmin: boolean;
  onOpenAdminLogin: () => void;
  onLogoutAdmin: () => void;
  onQuickReport: () => void;
  currentDriverName?: string | null;
  onOpenDriverLogin: () => void;
  onDriverLogout: () => void;
  mechanicName?: string | null;
  onOpenMechanicLogin: () => void;
  onMechanicLogout: () => void;
}) {
  const syncLabel = syncStatus === 'saving' ? '同期中…' : syncStatus === 'error' ? '同期エラー' : '同期完了';
  const syncCls = syncStatus === 'saving' ? 'saving' : syncStatus === 'error' ? 'error' : 'ok';

  return (
    <header className="appbar2">
      <div className="appbar2-row">
        <div className="brand2">
          <div className="logo2">🚙</div>
          <div className="titles2">
            <h1>
              社用車管理クラウド
              <span className="badge2">白ナンバー法令対応</span>
            </h1>
            <div className="sub2">運転日報・点呼記録・給油台帳・レンタカー・整備台帳・車両台帳・運転者台帳・各種マスタ一括管理</div>
          </div>
        </div>

        <nav className="tabs2">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`tab2 ${tab === t.key ? 'active' : ''}`}
              onClick={() => onTabChange(t.key)}
            >
              <span>{t.icon}</span>
              {t.label}
              {t.admin && <span className="adminbadge">ADMIN</span>}
            </button>
          ))}
        </nav>

        <div className="headerbtns">
          <span className={`sync-chip ${syncCls}`}>
            <span className="dot" />
            {syncLabel}
          </span>
          {currentDriverName ? (
            <button
              className="btn btn-sm"
              onClick={() => {
                if (confirm(`${currentDriverName} さんのログインを解除しますか？`)) onDriverLogout();
              }}
              title="別の運転者に切り替える／ログアウト"
            >
              🪪 {currentDriverName} さん
            </button>
          ) : (
            <button className="btn btn-sm" onClick={onOpenDriverLogin}>
              🪪 運転者としてログイン
            </button>
          )}
          {mechanicName ? (
            <button
              className="btn btn-sm"
              onClick={() => {
                if (confirm(`${mechanicName} さんの整備士ログインを解除しますか？`)) onMechanicLogout();
              }}
              title="別の整備士に切り替える／ログアウト"
            >
              🔧 {mechanicName}
            </button>
          ) : (
            <button className="btn btn-sm" onClick={onOpenMechanicLogin}>
              🔧 整備士としてログイン
            </button>
          )}
          {isAdmin ? (
            <button className="btn btn-sm" onClick={onLogoutAdmin}>
              🔓 管理者ログアウト
            </button>
          ) : (
            <button className="btn btn-sm" onClick={onOpenAdminLogin}>
              🔒 管理者ログイン
            </button>
          )}
        </div>
      </div>

      <div className="quickbar" style={{ marginTop: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={onQuickReport}>
          ＋ 出発登録（運転前）
        </button>
      </div>
    </header>
  );
}
