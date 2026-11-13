import type { Metadata, Viewport } from 'next';
import './globals.css';
import UpdatePrompt from '@/components/UpdatePrompt';
import RegisterServiceWorker from '@/components/RegisterServiceWorker';
import MobileTableLabels from '@/components/MobileTableLabels';

export const metadata: Metadata = {
  title: '運行管理アプリ（白ナンバー法令対応）',
  description: '運転日報・アルコール点呼・車両台帳・運転者台帳・マスタ設定',
  applicationName: '運行管理',
  // iPhone で「ホーム画面に追加」したときの名前と、全画面での表示
  appleWebApp: { capable: true, title: '運行管理', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
        <RegisterServiceWorker />
        <UpdatePrompt />
        <MobileTableLabels />
      </body>
    </html>
  );
}
