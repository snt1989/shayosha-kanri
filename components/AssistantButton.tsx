'use client';

import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';

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
      <button type="button" className="bell-btn" onClick={() => setOpen(true)} title="AIアシスタント" aria-label="AIアシスタントを開く">
        <span aria-hidden className="bell-icon">🤖</span>
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
