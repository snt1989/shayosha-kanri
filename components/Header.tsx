'use client';

import { useState, type ReactNode } from 'react';

import { BAR_COUNT, MECHANIC_TABS, TAB_META, TabKey } from '@/lib/menu';

type Tab = TabKey | 'settings';
type SyncStatus = 'idle' | 'saving' | 'error';

export default function Header({
  order,
  onChangeOrder,
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
  bell,
  mechanicOnly = false,
}: {
  // メニューの並び順（「設定」で変えられる）。スマホの下のバーには、上から4つが出る
  order: TabKey[];
  onChangeOrder?: (o: TabKey[]) => void;
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
  bell?: ReactNode;
  mechanicOnly?: boolean;
}) {
  const syncLabel = syncStatus === 'saving' ? '同期中…' : syncStatus === 'error' ? '同期エラー' : '同期完了';
  const syncCls = syncStatus === 'saving' ? 'saving' : syncStatus === 'error' ? 'error' : 'ok';
  // 整備士だけでログインしているときは、整備に関係のあるページだけを出す
  const shownOrder = mechanicOnly ? order.filter((k) => MECHANIC_TABS.includes(k)) : order;
  const TABS: { key: Tab; label: string; icon: string; admin?: boolean }[] = [
    ...shownOrder.map((k) => ({ key: k as Tab, ...TAB_META[k] })),
    ...(mechanicOnly ? [] : [{ key: 'settings' as Tab, label: '設定', icon: '⚙️' }]),
  ];
  const MAIN_TABS: Tab[] = shownOrder.slice(0, BAR_COUNT);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  // メニューの中で、その場で並び替える（この端末だけに保存。整備士だけのときも使える）
  const [reorder, setReorder] = useState(false);
  const moveTab = (key: TabKey, d: number) => {
    if (!onChangeOrder) return;
    const j = shownOrder.indexOf(key) + d;
    if (j < 0 || j >= shownOrder.length) return;
    const other = shownOrder[j];
    const next = [...order];
    const a = next.indexOf(key);
    const b = next.indexOf(other);
    [next[a], next[b]] = [next[b], next[a]];
    onChangeOrder(next);
  };
  const inMenu = !MAIN_TABS.includes(tab);
  const goTab = (t: Tab) => {
    setMenuOpen(false);
    onTabChange(t);
  };
  const closeThen = (fn: () => void) => () => {
    setMenuOpen(false);
    setLoginOpen(false);
    fn();
  };

  return (
    <header className="appbar2">
      <div className="appbar2-row">
        <div className="brandrow">
          <div className="brand2">
            <div className="logo2">🚙</div>
            <div className="titles2">
              <h1>
                運行管理アプリ
                <span className="badge2">白ナンバー法令対応</span>
              </h1>
              <div className="sub2">運転日報・点呼記録・給油台帳・レンタカー・整備台帳・車両台帳・運転者台帳・各種マスタ一括管理</div>
            </div>
          </div>
          {bell}
        </div>

        <nav className="tabs2">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`tab2 ${MAIN_TABS.includes(t.key) ? '' : 'tab2-more'} ${tab === t.key ? 'active' : ''}`}
              onClick={() => onTabChange(t.key)}
            >
              <span>{t.icon}</span>
              {t.label}
              {t.admin && <span className="adminbadge">ADMIN</span>}
            </button>
          ))}
          <button className={`tab2 tab2-menu ${inMenu ? 'active' : ''}`} onClick={() => setMenuOpen(true)} aria-haspopup="dialog">
            <span>☰</span>
            メニュー
          </button>
        </nav>

        {/* スマホ：ログイン状態を1行で見せる（押すとメニューが開く） */}
        <div className="mobile-status">
          <span className={`sync-chip ${syncCls}`}>
            <span className="dot" />
            {syncLabel}
          </span>
          <button className="btn btn-sm mobile-status-btn" onClick={() => setLoginOpen(true)}>
            🪪 {currentDriverName ? `${currentDriverName} さん` : '未ログイン'}
            {mechanicName ? ` ／ 🔧 ${mechanicName}` : ''}
            {isAdmin ? ' ／ 🔓 管理者' : ''} ▾
          </button>
        </div>

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

      {loginOpen && (
        <div className="menu-sheet-wrap login-wrap" onMouseDown={(e) => e.target === e.currentTarget && setLoginOpen(false)}>
          <div className="login-sheet" role="dialog" aria-label="ログイン">
            <div className="login-sheet-head">
              <strong>ログイン</strong>
              <button className="modal-close" onClick={() => setLoginOpen(false)} aria-label="閉じる">
                ×
              </button>
            </div>
            <button
              className="menu-row"
              onClick={closeThen(() => {
                if (!currentDriverName) return onOpenDriverLogin();
                if (confirm(`${currentDriverName} さんのログインを解除しますか？`)) onDriverLogout();
              })}
            >
              <span className="menu-row-ic">🪪</span>
              <span className="menu-row-label">{currentDriverName ? `${currentDriverName} さん（運転者）` : '運転者としてログイン'}</span>
              <span className="menu-row-go">{currentDriverName ? '解除' : '›'}</span>
            </button>
            <button
              className="menu-row"
              onClick={closeThen(() => {
                if (!mechanicName) return onOpenMechanicLogin();
                if (confirm(`${mechanicName} さんの整備士ログインを解除しますか？`)) onMechanicLogout();
              })}
            >
              <span className="menu-row-ic">🔧</span>
              <span className="menu-row-label">{mechanicName ? `${mechanicName}（整備士）` : '整備士としてログイン'}</span>
              <span className="menu-row-go">{mechanicName ? '解除' : '›'}</span>
            </button>
            <button className="menu-row" onClick={closeThen(isAdmin ? onLogoutAdmin : onOpenAdminLogin)}>
              <span className="menu-row-ic">{isAdmin ? '🔓' : '🔒'}</span>
              <span className="menu-row-label">{isAdmin ? '管理者ログアウト' : '管理者ログイン'}</span>
              <span className="menu-row-go">{isAdmin ? '解除' : '›'}</span>
            </button>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="menu-sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && setMenuOpen(false)}>
          <aside className="menu-sheet" role="dialog" aria-label="メニュー">
            <div className="drawer-brand">
              <div className="logo2">🚙</div>
              <div className="drawer-name">運行管理アプリ</div>
              <button className="drawer-x" onClick={() => setMenuOpen(false)} aria-label="閉じる">
                ×
              </button>
            </div>
            <nav className="drawer-nav">
            <div className="menu-sheet-section" style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{reorder ? '画面（↑↓で並び替え）' : '画面'}</span>
              {onChangeOrder && (
                <button type="button" className="drawer-reorder-btn" onClick={() => setReorder(!reorder)}>
                  {reorder ? '✓ 完了' : '↕ 並び替え'}
                </button>
              )}
            </div>
            {TABS.map((t) => {
              const idx = shownOrder.indexOf(t.key as TabKey);
              if (reorder) {
                if (idx < 0) return null; // 「設定」は最後に固定
                return (
                  <div key={t.key} className={`menu-row reorder-row ${idx < BAR_COUNT ? 'in-bar' : ''}`}>
                    <span className="menu-row-ic">{t.icon}</span>
                    <span className="menu-row-label">
                      {t.label}
                      {idx < BAR_COUNT && <span className="pill pill-sky" style={{ marginLeft: 6 }}>下のバー</span>}
                    </span>
                    <button type="button" className="reorder-arrow" onClick={() => moveTab(t.key as TabKey, -1)} disabled={idx === 0} aria-label={`${t.label}を上へ`}>
                      ↑
                    </button>
                    <button type="button" className="reorder-arrow" onClick={() => moveTab(t.key as TabKey, 1)} disabled={idx === shownOrder.length - 1} aria-label={`${t.label}を下へ`}>
                      ↓
                    </button>
                  </div>
                );
              }
              return (
                <button key={t.key} className={`menu-row ${tab === t.key ? 'active' : ''}`} onClick={() => goTab(t.key)}>
                  <span className="menu-row-ic">{t.icon}</span>
                  <span className="menu-row-label">{t.label}</span>
                  {t.admin && <span className="adminbadge">ADMIN</span>}
                  <span className="menu-row-go">{tab === t.key ? '表示中' : '›'}</span>
                </button>
              );
            })}
            {reorder && <div className="drawer-reorder-hint">上から{BAR_COUNT}つが、スマホの下のバーに出ます。この端末だけに保存されます。</div>}
            </nav>
            <div className="drawer-foot">
              <button className="drawer-close" onClick={() => setMenuOpen(false)}>
                ‹ 閉じる
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="quickbar" style={{ marginTop: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={onQuickReport}>
          ＋ 出発登録（運転前）
        </button>
      </div>
    </header>
  );
}
