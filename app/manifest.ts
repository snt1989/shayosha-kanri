import type { MetadataRoute } from 'next';

// ホーム画面に追加したときのアプリ名・アイコン・起動時の見た目（PWA）。
// 色はアイコンの背景色に合わせている（起動時の画面とアイコンが続いて見える）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '社用車管理クラウド',
    short_name: '社用車管理',
    description: '運転日報・点呼記録・給油台帳・レンタカー・整備台帳をまとめて管理',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'ja',
    background_color: '#032553',
    theme_color: '#032553',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
