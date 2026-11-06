'use client';

import { BAR_COUNT, DEFAULT_ORDER, TAB_META, TabKey } from '@/lib/menu';
import CardsAdmin from './CardsAdmin';

// 「設定」ページ：メニューの並び替え。この端末だけに保存される（他の人・他の端末の並びは変わらない）。
export default function SettingsTab({
  order,
  onChange,
  isAdmin,
  onRequestAdminLogin,
}: {
  order: TabKey[];
  onChange: (o: TabKey[]) => void;
  isAdmin: boolean;
  onRequestAdminLogin: () => void;
}) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const isDefault = order.join() === DEFAULT_ORDER.join();

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="card-title" style={{ marginBottom: 4 }}>
          ⚙️ 設定
        </h3>
        <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>メニューの並びは、この端末の表示だけが変わります（他の人や、他の端末は変わりません）。カードの登録は管理者だけができ、全員に反映されます。</div>
      </div>

      <div className="card">
        <div className="toolbar2">
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}>
              ↕️ メニューの並び替え
            </h3>
            <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
              「↑」「↓」で順番を変えます。上から順に、パソコンでは上のタブに、スマホでは下のバーの左から並びます。スマホの下のバーに出るのは、上から{BAR_COUNT}つです。残りは「☰ メニュー」に入ります。
            </div>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => onChange([...DEFAULT_ORDER])} disabled={isDefault}>
              標準の並びに戻す
            </button>
          </div>
        </div>

        <div className="menu-order-list">
          {order.map((k, i) => (
            <div key={k}>
              {i === BAR_COUNT && <div className="menu-order-divider">▼ ここから下は、スマホでは「☰ メニュー」の中です</div>}
              <div className={`menu-order-row ${i < BAR_COUNT ? 'in-bar' : ''}`}>
                <span className="menu-order-no">{i + 1}</span>
                <span className="menu-order-ic">{TAB_META[k].icon}</span>
                <span className="menu-order-label">
                  {TAB_META[k].label}
                  {TAB_META[k].admin && <span className="adminbadge" style={{ marginLeft: 6 }}>ADMIN</span>}
                </span>
                {i < BAR_COUNT && <span className="pill pill-sky">下のバー</span>}
                <button className="btn btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${TAB_META[k].label}を上へ`}>
                  ↑
                </button>
                <button className="btn btn-sm" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`${TAB_META[k].label}を下へ`}>
                  ↓
                </button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--slate-500)', marginTop: 10 }}>「⚙️ 設定」は、いちばん最後に固定です。</div>
      </div>

      <CardsAdmin isAdmin={isAdmin} onRequestAdminLogin={onRequestAdminLogin} />
    </div>
  );
}
