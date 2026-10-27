'use client';

// 管理画面の「ロゴ・アイコン」：アプリのロゴ・アイコンの一覧と、画像データのダウンロード。
// 画像は public/logo/ に置いてある（アプリが実際に使っているアイコンと同じ絵）。
type Asset = {
  file: string;
  name: string;
  use: string;
  size: string;
  dark?: boolean;
};

const ASSETS: Asset[] = [
  { file: 'shayosha-logo-512.png', name: 'ロゴ（大）', use: '資料・名刺・ポスターなどに使う、いちばん大きい画像', size: '512×512 PNG' },
  { file: 'shayosha-logo-192.png', name: 'ロゴ（中）', use: 'ホーム画面に追加したときのアイコン（Android）', size: '192×192 PNG' },
  { file: 'shayosha-logo-maskable-512.png', name: 'ロゴ（丸く切り抜き用）', use: 'Android で丸や角丸に切り抜かれるアイコン。ふちに余白あり', size: '512×512 PNG' },
  { file: 'shayosha-apple-touch-icon-180.png', name: 'iPhone 用アイコン', use: 'iPhone・iPad のホーム画面に追加したときのアイコン', size: '180×180 PNG' },
  { file: 'shayosha-favicon.ico', name: 'ブラウザのタブのアイコン', use: 'パソコンのブラウザのタブに出る小さいアイコン', size: '32・48px ICO' },
];

export default function LogoTab() {
  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: 4 }}>
        🎨 ロゴ・アイコン
      </h3>
      <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 14 }}>
        このアプリのロゴとアイコンです。使い道に合わせて、画像データをダウンロードできます。
      </div>

      <div className="logo-grid">
        {ASSETS.map((a) => (
          <div className="logo-card" key={a.file}>
            <div className="logo-preview">
              {a.file.endsWith('.ico') ? (
                <span className="logo-ico-note">ICO</span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/logo/${a.file}`} alt={a.name} width={96} height={96} />
              )}
            </div>
            <div className="logo-info">
              <div className="logo-name">{a.name}</div>
              <div className="logo-size">{a.size}</div>
              <div className="logo-use">{a.use}</div>
              <a className="btn btn-primary btn-sm" href={`/logo/${a.file}`} download={a.file}>
                ⬇ ダウンロード
              </a>
            </div>
          </div>
        ))}
      </div>

      <div className="logo-all">
        <a className="btn btn-sm" href="/logo/shayosha-logo-all.zip" download="shayosha-logo-all.zip">
          ⬇ 全部まとめてダウンロード（ZIP）
        </a>
      </div>
      <div style={{ fontSize: 12, color: 'var(--slate-500)', marginTop: 10, lineHeight: 1.7 }}>
        ※ 画面左上のロゴは、青い四角の中に 🚙 を置いたものです（画像データではありません）。
        <br />※ ロゴの絵そのものを変えるときは、画像を用意して開発側で差し替えが必要です。
      </div>
    </div>
  );
}
