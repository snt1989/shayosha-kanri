import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, createApi, normalizeBaseUrl, ServerConfig } from '../api';
import { saveServer } from '../session';
import { C } from '../theme';
import { Button, Card, ErrorBox, Muted, TextField } from '../ui';

// 初回の起動で、Web版のサーバーのURLを入力する。接続できたら端末に保存する。
export default function SetupScreen({ initial, onDone }: { initial?: ServerConfig | null; onDone: (cfg: ServerConfig) => void }) {
  const [url, setUrl] = useState(initial?.baseUrl ?? '');
  const [user, setUser] = useState(initial?.basicUser ?? '');
  const [pass, setPass] = useState(initial?.basicPass ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function connect() {
    const base = normalizeBaseUrl(url);
    if (!base) return setError('サーバーのURLを入力してください（例：https://○○.vercel.app）。');
    const cfg: ServerConfig = { baseUrl: base, basicUser: user.trim() || undefined, basicPass: user.trim() ? pass : undefined };
    setBusy(true);
    setError('');
    try {
      await createApi(cfg).loadData();
      await saveServer(cfg);
      onDone(cfg);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '接続できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.slate100 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 32 }} keyboardShouldPersistTaps="handled">
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: C.navy }}>社用車管理</Text>
            <Text style={{ fontSize: 13, color: C.slate600, marginTop: 4 }}>はじめに、Web版のサーバーに接続します。</Text>
          </View>
          <Card>
            {error ? <ErrorBox message={error} /> : null}
            <TextField label="サーバーのURL" value={url} onChangeText={setUrl} placeholder="https://○○.vercel.app" keyboardType="url" hint="ブラウザでWeb版を開くときのURLです。分からないときは管理者に聞いてください。" />
            <Muted>サーバーでBasic認証を設定している場合だけ、次の2つも入力します。</Muted>
            <View style={{ height: 10 }} />
            <TextField label="Basic認証のユーザー名（任意）" value={user} onChangeText={setUser} />
            <TextField label="Basic認証のパスワード（任意）" value={pass} onChangeText={setPass} secureTextEntry />
            <Button title="接続して始める" variant="primary" onPress={connect} loading={busy} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
