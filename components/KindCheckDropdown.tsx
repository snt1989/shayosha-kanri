'use client';

import { useEffect, useRef } from 'react';
import { CARD_KINDS, CardKind } from '@/lib/types';

// 種類をドロップダウンのリストで選び、チェックを入れる（複数可。最低1つは必要）。
export default function KindCheckDropdown({ value, onChange }: { value: CardKind[]; onChange: (v: CardKind[]) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);

  // 外側を押したら閉じる
  useEffect(() => {
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, []);

  const label = CARD_KINDS.filter((k) => value.includes(k.key))
    .map((k) => `${k.icon} ${k.label}`)
    .join('、');

  return (
    <details ref={ref} className="check-dropdown">
      <summary className="check-dropdown-summary">{label || '種類を選んでください'}</summary>
      <div className="check-dropdown-list" role="group" aria-label="種類">
        {CARD_KINDS.map((k) => {
          const checked = value.includes(k.key);
          return (
            <label key={k.key} className="check-dropdown-item">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const next = checked ? value.filter((x) => x !== k.key) : [...value, k.key];
                  if (next.length === 0) return; // 最低1つは残す
                  onChange(CARD_KINDS.map((x) => x.key).filter((x) => next.includes(x)));
                }}
              />
              <span>
                {k.icon} {k.label}
              </span>
            </label>
          );
        })}
      </div>
    </details>
  );
}
