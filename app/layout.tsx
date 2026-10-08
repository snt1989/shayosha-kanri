import type { Metadata, Viewport } from 'next';
import './globals.css';
import RegisterServiceWorker from '@/components/RegisterServiceWorker';

export const metadata: Metadata = {
  title: '社用車管理クラウド（白ナンバー法令対応）',
  description: '運転日報・アルコール点呼・車両台帳・運転者台帳・マスタ設定',
  applicationName: '社用車管理',
  // iPhone で「ホーム画面に追加」したときの名前と、全画面での表示
  appleWebApp: { capable: true, title: '社用車管理', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#032553',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
