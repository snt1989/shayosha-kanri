import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { createApi, ServerConfig } from './src/api';
import { AppProvider, useApp } from './src/AppContext';
import { clearServer, loadServer } from './src/session';
import { C } from './src/theme';
import { Spinner } from './src/ui';
import DashboardScreen from './src/screens/DashboardScreen';
import FuelScreen from './src/screens/FuelScreen';
import LoginModal from './src/screens/LoginModal';
import MoreScreen from './src/screens/MoreScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import SetupScreen from './src/screens/SetupScreen';

type Tab = 'home' | 'reports' | 'fuel' | 'more';
const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'home', icon: '🏠', label: 'ホーム' },
  { key: 'reports', icon: '📝', label: '運転日報' },
  { key: 'fuel', icon: '⛽', label: '給油台帳' },
  { key: 'more', icon: '⚙️', label: 'その他' },
];

export default function App() {
  // undefined: 保存済みの設定を読み込み中 / null: 未設定（初回）
  const [server, setServer] = useState<ServerConfig | null | undefined>(undefined);
  useEffect(() => {
    loadServer().then(setServer);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {server === undefined ? (
        <Spinner />
      ) : server === null ? (
        <SetupScreen onDone={setServer} />
      ) : (
        <Connected
          key={server.baseUrl}
          server={server}
          onReset={async () => {
            await clearServer();
            setServer(null);
          }}
        />
      )}
    </SafeAreaProvider>
  );
}

function Connected({ server, onReset }: { server: ServerConfig; onReset: () => void }) {
  // 設定が変わらない限り、同じ接続を使い回す
  const [api] = useState(() => createApi(server));
  return (
    <AppProvider api={api} onResetServer={onReset}>
      <Main />
    </AppProvider>
  );
}

function Main() {
  const [tab, setTab] = useState<Tab>('home');
  const { loginOpen } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: C.slate100 }}>
      <View style={{ flex: 1 }}>
        {tab === 'home' && <DashboardScreen />}
        {tab === 'reports' && <ReportsScreen />}
        {tab === 'fuel' && <FuelScreen />}
        {tab === 'more' && <MoreScreen />}
      </View>
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.slate200 }}>
        <View style={{ flexDirection: 'row' }}>
          {TABS.map((t) => (
            <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} onPress={() => setTab(t.key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 }}>
              <Text style={{ fontSize: 20 }}>{t.icon}</Text>
              <Text style={{ fontSize: 11, fontWeight: tab === t.key ? '800' : '500', color: tab === t.key ? C.sky700 : C.slate500 }}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
      {loginOpen ? <LoginModal /> : null}
    </View>
  );
}
