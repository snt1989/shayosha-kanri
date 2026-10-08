import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '../AppContext';
import { driverName } from '../logic';
import { C } from '../theme';
import { Card, Empty, FormModal, Muted, TextField } from '../ui';

// 運転者としてログイン（台帳から名前を選ぶ。パスワードなし）
export default function LoginModal() {
  const { data, closeLogin, selectDriver } = useApp();
  const [query, setQuery] = useState('');
  const q = query.trim();
  const list = (data?.drivers ?? []).filter((d) => !q || `${d.lastName}${d.firstName}`.includes(q) || d.dept.includes(q) || d.empId.includes(q));

  return (
    <FormModal title="運転者としてログイン" onClose={closeLogin}>
      <Muted>運転者台帳から、自分の名前を選んでください。パスワードは要りません。名前が無い場合は、管理者に台帳への登録を頼むか、Web版の「免許証写真で自動登録」で登録してください。</Muted>
      <View style={{ height: 12 }} />
      <TextField label="氏名・部署・社員番号で検索" value={query} onChangeText={setQuery} placeholder="例：山田" autoCapitalize="none" />
      <Card>
        {list.length === 0 ? (
          <Empty text={(data?.drivers.length ?? 0) === 0 ? '運転者が登録されていません。' : '該当する運転者がいません。'} />
        ) : (
          list.map((d, i) => (
            <Pressable
              key={d.id}
              accessibilityRole="button"
              onPress={() => selectDriver(d)}
              style={({ pressed }) => ({
                paddingVertical: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: C.slate200,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.slate800 }}>{driverName(d)}</Text>
              <Text style={{ fontSize: 12, color: C.slate500, marginTop: 2 }}>
                {d.dept}
                {d.empId ? `（${d.empId}）` : ''}
              </Text>
            </Pressable>
          ))
        )}
      </Card>
    </FormModal>
  );
}
