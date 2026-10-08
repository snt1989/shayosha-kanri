'use client';

import { useEffect } from 'react';

// スマホでは表をカード表示にする（CSS側）。そのとき各セルに見出しを出すため、
// 表の見出し行（th）の文字を、各セルの data-label に写す。画面の描画が変わるたびに付け直す。
export default function MobileTableLabels() {
  useEffect(() => {
    let frame = 0;
    const apply = () => {
      frame = 0;
      document.querySelectorAll('table.data-table').forEach((table) => {
        const heads = Array.from(table.querySelectorAll('thead th')).map((th) => (th.textContent || '').trim());
        if (heads.length === 0) return;
        table.querySelectorAll('tbody tr').forEach((tr) => {
          Array.from(tr.children).forEach((td, i) => {
            const label = heads[i] ?? '';
            if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label);
            // 値が空（「-」など）の欄は、カードでは出さない（行を短くして見やすくする）
            const text = (td.textContent || '').trim();
            const empty = label !== '' && (text === '' || text === '-' || text === '－' || text === '—');
            if (td.hasAttribute('data-empty') !== empty) {
              if (empty) td.setAttribute('data-empty', '');
              else td.removeAttribute('data-empty');
            }
          });
        });
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
