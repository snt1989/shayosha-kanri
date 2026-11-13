'use client';

import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';

// AIロボのキャラクター（現場管理アプリと同じ）
function AiKun({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 64 70" width={size} height={(size * 70) / 64} aria-hidden="true" style={{ overflow: 'visible' }}>
      <ellipse cx="32" cy="67" rx="16" ry="2.6" fill="rgba(0,0,0,.18)" />
      <line x1="32" y1="9" x2="32" y2="15" stroke="#5a6b66" strokeWidth="2.6" strokeLinecap="round" />
      <circle className="ai-ant" cx="32" cy="6.5" r="4.6" fill="#ffc93c" stroke="#fff" strokeWidth="1.6" />
      <g className="ai-arm-l">
        <ellipse cx="7.5" cy="40" rx="5" ry="7" fill="#9fe3cd" stroke="#fff" strokeWidth="1.6" transform="rotate(18 7.5 40)" />
      </g>
      <g className="ai-arm-r">
        <ellipse cx="56.5" cy="38" rx="5" ry="7" fill="#9fe3cd" stroke="#fff" strokeWidth="1.6" transform="rotate(-28 56.5 38)" />
      </g>
      <rect x="20" y="56" width="9" height="8" rx="4" fill="#7fcfb6" stroke="#fff" strokeWidth="1.4" />
      <rect x="35" y="56" width="9" height="8" rx="4" fill="#7fcfb6" stroke="#fff" strokeWidth="1.4" />
      <rect x="9" y="14" width="46" height="45" rx="22" fill="#d8f6ea" stroke="#fff" strokeWidth="2.4" />
      <rect x="14" y="21" width="36" height="25" rx="12.5" fill="#23413a" />
      <g className="ai-eyes">
        <ellipse cx="24.5" cy="32.5" rx="4.2" ry="5.2" fill="#8ff7d2" />
        <ellipse cx="39.5" cy="32.5" rx="4.2" ry="5.2" fill="#8ff7d2" />
        <circle cx="26" cy="30.5" r="1.5" fill="#fff" />
        <circle cx="41" cy="30.5" r="1.5" fill="#fff" />
      </g>
      <path d="M28 40.5q4 3.6 8 0" stroke="#8ff7d2" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="17" cy="42" rx="3.2" ry="2" fill="#ff9db4" opacity=".85" />
      <ellipse cx="47" cy="42" rx="3.2" ry="2" fill="#ff9db4" opacity=".85" />
      <text x="32" y="55.5" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#2a8f6d" fontFamily="sans-serif">
        AI
      </text>
    </svg>
  );
}

const FAB_KEY = 'fleet:ai-fab';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  '30日以内に車検が切れる車は？',
  '先月の給油費用の合計は？',
  '対応待ちの整備依頼を教えて',
  '免許の更新が近い人は？',
  'まだ帰着登録していない日報は？',
  '整備依頼の出し方を教えて',
];

// 管理者向けのAIアシスタント。記録について質問できる（変更はできない）。
export default function AssistantButton() {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; on: boolean } | null>(null);
  const moved = useRef(false);

  // ボタンが邪魔なときは、長押ししてそのまま動かすと、好きな場所に移せる（位置は端末に記憶する）
  const place = (x: number, y: number) => {
    const el = fabRef.current;
    if (!el) return [x, y];
    const w = el.offsetWidth || 44;
    const h = el.offsetHeight || 44;
    const nx = Math.max(4, Math.min(window.innerWidth - w - 4, x));
    const ny = Math.max(4, Math.min(window.innerHeight - h - 4, y));
    el.style.left = `${nx}px`;
    el.style.top = `${ny}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.animation = 'none';
    return [nx, ny];
  };
  useEffect(() => {
    try {
      const sp = JSON.parse(localStorage.getItem(FAB_KEY) || 'null');
      if (sp && typeof sp.x === 'number' && typeof sp.y === 'number') place(sp.x, sp.y);
    } catch {
      // 保存された位置が読めなければ、初めの位置のまま
    }
    const onResize = () => {
      const el = fabRef.current;
      if (el && el.style.left) {
        const r = el.getBoundingClientRect();
        place(r.left, r.top);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const onFabDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, on: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // マウスでも、指が外れても追いかけられるように
    } catch {
      // 取れなくても動かせる
    }
  };
  const onFabMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.on && Math.abs(dx) + Math.abs(dy) > 8) {
      d.on = true;
      moved.current = true;
    }
    if (d.on) place(d.ox + dx, d.oy + dy);
  };
  const onFabEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d?.on) {
      const r = e.currentTarget.getBoundingClientRect();
      try {
        localStorage.setItem(FAB_KEY, JSON.stringify({ x: r.left, y: r.top }));
      } catch {
        // 保存できなくても、そのまま使える
      }
      setTimeout(() => (moved.current = false), 50);
    }
  };
  const onFabClick = () => {
    if (moved.current) {
      moved.current = false;
      return;
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open || configured !== null) return;
    fetch('/api/assistant')
      .then((r) => r.json())
      .then((j) => setConfigured(Boolean(j?.configured)))
      .catch(() => setConfigured(false));
  }, [open, configured]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy, open]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const j = (await res.json().catch(() => ({}))) as { reply?: string; message?: string };
      if (!res.ok || !j.reply) throw new Error(j.message || 'AIの回答を取得できませんでした。');
      setMessages([...next, { role: 'assistant', content: j.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AIの回答を取得できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className={`ai-fab ${open ? 'is-open' : ''}`}
        title="AIアシスタント"
        aria-label="AIアシスタントを開く"
        onClick={onFabClick}
        onPointerDown={onFabDown}
        onPointerMove={onFabMove}
        onPointerUp={onFabEnd}
        onPointerCancel={onFabEnd}
      >
        <AiKun size={58} />
        <span className="ai-tag">AIロボ</span>
      </button>
      {open && (
        <Modal
          title="🤖 AIアシスタント"
          onClose={() => setOpen(false)}
          wide
          footer={
            <form
              className="assistant-form"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <textarea
                rows={2}
                value={input}
                maxLength={2000}
                placeholder="質問を入力"
                disabled={configured === false}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // パソコンでは Ctrl/⌘ + Enter で送信（Enterは改行）
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    send(input);
                  }
                }}
              />
              <button type="submit" className="btn btn-primary" disabled={busy || !input.trim() || configured === false}>
                {busy ? '考え中…' : '送信'}
              </button>
            </form>
          }
        >
          {configured === false && (
            <div className="notice-box" role="alert">
              AIアシスタントは、まだ設定されていません。Vercel の環境変数に ANTHROPIC_API_KEY を入れると使えます（車検証のAI読み取りと同じキーです）。
            </div>
          )}
          <div className="assistant-note">
            車両・運転者・日報・給油・整備・レンタカーなどの記録を見て答えます（電話番号・免許証番号・写真は送りません）。質問のたびに、記録がAI（Anthropic）に送られます。AIは間違えることがあるので、大事な数字は台帳で確認してください。記録の変更はできません。
          </div>
          <div className="assistant-log" aria-live="polite">
            {messages.length === 0 && (
              <div className="assistant-suggest">
                <div style={{ fontSize: 13, color: 'var(--slate-500)', marginBottom: 6 }}>たとえば、こんな質問ができます</div>
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="btn btn-sm" disabled={configured === false || busy} onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`assistant-msg ${m.role}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className="assistant-msg assistant">考え中…</div>}
            {error && (
              <div role="alert" className="assistant-msg error">
                {error}
              </div>
            )}
            <div ref={endRef} />
          </div>
          {messages.length > 0 && (
            <div style={{ textAlign: 'right', marginTop: 6 }}>
              <button type="button" className="btn btn-sm" onClick={() => { setMessages([]); setError(''); }}>
                会話をクリア
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
