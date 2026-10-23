'use client';

import { useEffect, useState } from 'react';
import { detectEnv, Env, usePush } from './usePush';

// 「ホーム画面に追加」していない端末、通知をオンにしていない端末に、画面の上でご案内する。
// 「あとで」を押すと、この端末では7日間表示しない。

const DISMISS_KEY = 'fleet:nudge:dismissed';
const DISMISS_DAYS = 7;

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
// Android の Chrome は、アプリとして追加できる状態になると、ページの読み込み中に合図を出す。取りこぼさないよう、最初に受け取っておく。
let installEvent: InstallEvent | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as InstallEvent;
    installListeners.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    installListeners.forEach((f) => f());
  });
}

const dismissedNow = () => {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return t > 0 && Date.now() - t < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
};

export default function SetupNudge() {
  const [env, setEnv] = useState<Env | null>(null);
  const [hidden, setHidden] = useState(true); // 判定が終わるまで出さない（一瞬ちらつくのを防ぐ）
  const [canInstall, setCanInstall] = useState(false);
  const [steps, setSteps] = useState(false);
  const [msg, setMsg] = useState('');
  const { state, busy, enable } = usePush(setMsg);

  useEffect(() => {
    setEnv(detectEnv());
    setHidden(dismissedNow());
    const sync = () => setCanInstall(installEvent !== null);
    sync();
    installListeners.add(sync);
    return () => {
      installListeners.delete(sync);
    };
  }, []);

  function later() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // 保存できないときは、画面を開き直すまで非表示
    }
    setHidden(true);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice.catch(() => undefined);
    installEvent = null;
    setCanInstall(false);
  }

  if (hidden || !env || state === 'loading') return null;

  const mobile = env.ios || env.android;
  let body: React.ReactNode = null;

  if (mobile && !env.standalone) {
    // ホーム画面に追加していない（スマホ）
    if (env.ios) {
      body = (
        <>
          <div className="nudge-text">
            📲 <strong>ホーム画面に追加</strong>すると、アプリとして開け、通知も届きます。
          </div>
          <div className="nudge-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setSteps(!steps)}>
              {steps ? '手順を閉じる' : '追加の手順を見る'}
            </button>
          </div>
          {steps && (
            <ol className="nudge-steps">
              <li>Safari で、このページを開きます。</li>
              <li>画面下の共有ボタン（四角から上向きの矢印のマーク）を押します。</li>
              <li>「ホーム画面に追加」を押し、「追加」を押します。</li>
              <li>ホーム画面にできたアイコンから開き直します。</li>
            </ol>
          )}
        </>
      );
    } else if (canInstall) {
      body = (
        <>
          <div className="nudge-text">
            📲 <strong>アプリとして追加</strong>すると、ホーム画面から開けて、通知も届きます。
          </div>
          <div className="nudge-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={install}>
              アプリとして追加
            </button>
          </div>
        </>
      );
    } else {
      body = (
        <>
          <div className="nudge-text">
            📲 <strong>ホーム画面に追加</strong>すると、アプリとして開け、通知も届きます。
          </div>
          <div className="nudge-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setSteps(!steps)}>
              {steps ? '手順を閉じる' : '追加の手順を見る'}
            </button>
          </div>
          {steps && (
            <ol className="nudge-steps">
              <li>Chrome で、このページを開きます。</li>
              <li>右上のメニュー（縦に3つ並んだ点）を押します。</li>
              <li>「アプリをインストール」（無いときは「ホーム画面に追加」）を押します。</li>
            </ol>
          )}
        </>
      );
    }
  } else if (state === 'off') {
    body = (
      <>
        <div className="nudge-text">
          🔔 <strong>通知をオン</strong>にすると、管理者の連絡事項や毎朝のまとめが、アプリを閉じていても届きます。
        </div>
        <div className="nudge-actions">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={enable}>
            通知をオンにする
          </button>
        </div>
      </>
    );
  } else if (state === 'denied') {
    body = (
      <div className="nudge-text">
        🔕 この端末では通知がブロックされています。通知を受け取るには、端末（ブラウザ）の設定で、このサイトの通知を許可してください。
      </div>
    );
  }

  if (!body) return null;

  return (
    <div className="nudge-wrap">
      <div className="nudge" role="region" aria-label="ご案内">
        <div className="nudge-main">{body}</div>
        {msg && <div className="nudge-msg">{msg}</div>}
        <button type="button" className="nudge-later" onClick={later}>
          あとで
        </button>
      </div>
    </div>
  );
}
