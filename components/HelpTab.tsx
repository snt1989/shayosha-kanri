'use client';

import { useMemo, useState } from 'react';
import { HELP_SECTIONS, HelpBlock, HelpTarget } from '@/lib/help';

const SCREEN_NAMES: Record<HelpTarget, string> = {
  dashboard: 'ダッシュボード',
  reports: '運転日報',
  fuel: '給油台帳',
  rental: 'レンタカー',
  maintenance: '整備台帳',
  admin: '管理画面',
};

const blockText = (b: HelpBlock): string => (typeof b === 'string' ? b : 'steps' in b ? b.steps.join(' ') : b.list.join(' '));
const norm = (s: string) => s.toLowerCase();

function AnswerBlock({ b }: { b: HelpBlock }) {
  if (typeof b === 'string') return <p>{b}</p>;
  if ('steps' in b) {
    return (
      <ol>
        {b.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    );
  }
  return (
    <ul>
      {b.list.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}

export default function HelpTab({ onNavigate }: { onNavigate: (tab: HelpTarget) => void }) {
  const [query, setQuery] = useState('');
  const [sectionId, setSectionId] = useState('');
  const q = norm(query.trim());

  const sections = useMemo(
    () =>
      HELP_SECTIONS.filter((s) => !sectionId || s.id === sectionId)
        .map((s) => ({
          ...s,
          items: q ? s.items.filter((it) => norm(it.q).includes(q) || it.a.some((b) => norm(blockText(b)).includes(q))) : s.items,
        }))
        .filter((s) => s.items.length > 0),
    [q, sectionId]
  );
  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="toolbar2">
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}>
              ❓ 使い方（よくある質問）
            </h3>
            <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
              操作のしかたや、困ったときの対処をまとめています。質問を押すと答えが開きます。
            </div>
          </div>
          <div className="actions">
            <input
              id="help-search"
              type="search"
              className="help-search"
              aria-label="質問を検索"
              placeholder="キーワードで探す（例：返却）"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="help-chips" role="group" aria-label="分類で絞り込み">
          <button type="button" className={`help-chip ${sectionId === '' ? 'active' : ''}`} aria-pressed={sectionId === ''} onClick={() => setSectionId('')}>
            すべて
          </button>
          {HELP_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`help-chip ${sectionId === s.id ? 'active' : ''}`}
              aria-pressed={sectionId === s.id}
              onClick={() => setSectionId(sectionId === s.id ? '' : s.id)}
            >
              {s.icon} {s.title}
            </button>
          ))}
        </div>
        {q && (
          <div style={{ fontSize: 12, color: 'var(--slate-500)', marginTop: 10 }} role="status">
            「{query.trim()}」に当てはまる質問：{total}件
          </div>
        )}
      </div>

      {sections.length === 0 ? (
        <div className="card">
          <div className="empty-state">当てはまる質問がありません。別のキーワードで探すか、分類を「すべて」にしてください。</div>
        </div>
      ) : (
        sections.map((s) => (
          <div className="card" key={s.id} style={{ marginBottom: 14 }}>
            <div className="help-section-head">
              <h3 className="card-title" style={{ margin: 0 }}>
                {s.icon} {s.title}
                <span className="pill pill-slate" style={{ marginLeft: 8 }}>
                  {s.items.length}件
                </span>
              </h3>
              {s.go && (
                <button type="button" className="btn btn-sm" onClick={() => onNavigate(s.go as HelpTarget)}>
                  {SCREEN_NAMES[s.go as HelpTarget]}を開く →
                </button>
              )}
            </div>
            <div className="help-list">
              {s.items.map((it) => (
                <details className="help-item" key={it.q} open={q ? true : undefined}>
                  <summary>{it.q}</summary>
                  <div className="help-answer">
                    {it.a.map((b, i) => (
                      <AnswerBlock key={i} b={b} />
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
