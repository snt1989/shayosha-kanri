'use client';

import { ReactNode, useEffect, useState } from 'react';

// ダッシュボードの1区画。見出しを押すと、たためる。開け閉めは、この端末に役割（運転者・整備士・管理者）ごとに覚える。
const KEY = 'fleet:dash:sections:v1';
type Saved = Record<string, boolean>;
const read = (): Saved => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
};

export default function DashSection({
  id,
  role,
  title,
  badge,
  defaultOpen,
  children,
}: {
  id: string;
  role: string;
  title: ReactNode;
  badge?: ReactNode;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const k = `${role}:${id}`;
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    const s = read();
    setOpen(k in s ? s[k] : defaultOpen);
  }, [k, defaultOpen]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...read(), [k]: next }));
    } catch {
      // 覚えられなくても動かす
    }
  };
  return (
    <div className={`card dash-sec${open ? '' : ' closed'}`} style={{ marginBottom: 14 }}>
      <h3 className="card-title dash-sec-title">
        <button type="button" className="dash-sec-btn" onClick={toggle} aria-expanded={open}>
          <span className="dash-sec-label">
            {title}
            {badge}
          </span>
          <span className="dash-sec-arrow" aria-hidden="true">
            {open ? '▲ たたむ' : '▼ ひらく'}
          </span>
        </button>
      </h3>
      {open && children}
    </div>
  );
}
