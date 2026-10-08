import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useApp } from '../AppContext';
import { driverName } from '../logic';
import { C } from '../theme';
import { Button, Card, Heading, Muted, Pill, Screen } from '../ui';

export default function MoreScreen() {
  const { api, data, currentDriver, openLogin, logoutDriver, refresh, refreshing, resetServer } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.slate800, marginBottom: 12 }}>その他</Text>

        <Card>
          <Heading>運転者ログイン</Heading>
          {currentDriver ? (
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.slate800 }}>{driverName(currentDriver)} さん</Text>
              <Muted>
                {currentDriver.dept}
                {currentDriver.empId ? `（${currentDriver.empId}）` : ''}
              </Muted>
              <Muted>共用の端末で使うときは、使い終わったらログインを解除してください。</Muted>
              <Button title="ログインを解除する" onPress={logoutDriver} />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Muted>ログインしていません。台帳から名前を選ぶだけで、パスワードは要りません。</Muted>
              <Button title="運転者としてログイン" variant="primary" onPress={openLogin} />
            </View>
          )}
        </Card>

        <Card>
          <Heading>データ</Heading>
          <View style={{ gap: 10 }}>
            {data ? (
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <Pill>{`日報 ${data.reports.length}件`}</Pill>
                <Pill>{`車両 ${data.vehicles.length}台`}</Pill>
                <Pill>{`運転者 ${data.drivers.length}名`}</Pill>
                <Pill tone={data.persistent ? 'green' : 'amber'}>{data.persistent ? '永続保存' : '一時保存'}</Pill>
              </View>
            ) : null}
            <Muted>他の人が入力した内容は、画面を下に引っ張るか、ここで読み込み直すと表示されます。</Muted>
            <Button title="最新のデータを読み込む" onPress={refresh} loading={refreshing} />
          </View>
        </Card>

        <Card>
          <Heading>接続先のサーバー</Heading>
          <View style={{ gap: 10 }}>
            <Text style={{ color: C.slate800 }}>{api.baseUrl}</Text>
            {confirmReset ? (
              <View style={{ gap: 8 }}>
                <Muted>接続先とログインを消して、最初の画面に戻ります。よろしいですか？</Muted>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button title="やめる" onPress={() => setConfirmReset(false)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="変更する" variant="danger" onPress={resetServer} />
                  </View>
                </View>
              </View>
            ) : (
              <Button title="接続先を変更する" onPress={() => setConfirmReset(true)} />
            )}
          </View>
        </Card>

        <Card>
          <Heading>このアプリでできること</Heading>
          <Muted>
            ダッシュボード、運転日報（出発・帰着・整備依頼）、給油台帳の記録に対応しています。レンタカー、車両の予約、整備台帳、管理画面（記録の修正・削除、マスタ、台帳の管理）は、いまはWeb版で行います。
          </Muted>
        </Card>
      </ScrollView>
    </Screen>
  );
}
