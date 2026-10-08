import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Report } from '../../../lib/types';
import { useApp } from '../AppContext';
import { comma, newDeparture, startReturn } from '../logic';
import { C } from '../theme';
import { Button, Card, Empty, ErrorBox, Muted, Pill, Screen, Spinner, TextField } from '../ui';
import { DepartureModal, ReturnModal } from './ReportForms';

const PAGE = 50;

export default function ReportsScreen() {
  const { data, loading, refreshing, error, refresh, requireDriver } = useApp();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [dep, setDep] = useState<Report | null>(null);
  const [ret, setRet] = useState<Report | null>(null);

  const q = query.trim();
  const rows = useMemo(() => {
    const all = data?.reports ?? [];
    if (!q) return all;
    return all.filter((r) => r.driver.includes(q) || r.vehicleName.includes(q) || r.destination.includes(q) || r.date.includes(q));
  }, [data?.reports, q]);

  if (loading && !data) return <Screen><Spinner /></Screen>;
  if (!data) {
    return (
      <Screen>
        <View style={{ padding: 16 }}>
          <ErrorBox message={error || 'データを読み込めませんでした。'} onRetry={refresh} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={rows.slice(0, limit)}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          <View>
            {error ? <ErrorBox message={error} onRetry={refresh} /> : null}
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.slate800, marginBottom: 4 }}>運転日報</Text>
            <Muted>運転前後のアルコールチェックと走行距離の記録です。出庫中の行を押すと、帰着登録ができます。</Muted>
            <View style={{ height: 12 }} />
            <Button title="＋ 出発登録（運転前）" variant="primary" onPress={() => requireDriver((d) => setDep(newDeparture(data, d)))} />
            <View style={{ height: 12 }} />
            <TextField label="検索" value={query} onChangeText={(t) => { setQuery(t); setLimit(PAGE); }} placeholder="運転者・車両・行先・日付" />
          </View>
        }
        ListEmptyComponent={<Empty text={q ? '該当する日報がありません' : '日報データがありません'} />}
        ListFooterComponent={rows.length > limit ? <Button title={`さらに表示（残り ${rows.length - limit}件）`} onPress={() => setLimit(limit + PAGE)} /> : null}
        renderItem={({ item: r }) => <ReportRow r={r} onReturn={() => requireDriver(() => setRet(startReturn(r, data)))} />}
      />
      {dep ? <DepartureModal initial={dep} onClose={() => setDep(null)} /> : null}
      {ret ? <ReturnModal initial={ret} onClose={() => setRet(null)} /> : null}
    </Screen>
  );
}

function ReportRow({ r, onReturn }: { r: Report; onReturn: () => void }) {
  const preNg = parseFloat(r.preAlcohol || '0') > 0;
  const postNg = r.postDone && parseFloat(r.postAlcohol || '0') > 0;
  const body = (
    <Card tone={preNg || postNg ? 'danger' : undefined}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontWeight: '700', color: C.slate800 }}>
          {r.date}　{r.driver}
        </Text>
        {r.postDone ? <Pill tone="green">帰着済</Pill> : <Pill tone="amber">出庫中</Pill>}
      </View>
      <Text style={{ color: C.slate600, marginTop: 4 }}>{r.vehicleName}</Text>
      <Text style={{ color: C.slate600 }}>
        {r.destination}
        {r.purpose ? ` / ${r.purpose}` : ''}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        <Pill tone={preNg ? 'red' : 'slate'}>{r.alcoholSkipped ? '出発前ALC 免除' : `出発前ALC ${r.preAlcohol}`}</Pill>
        {r.postDone ? <Pill tone={postNg ? 'red' : 'slate'}>{`帰着後ALC ${r.postAlcohol}`}</Pill> : null}
        <Pill tone="slate">{r.postDone ? `${comma(r.startKm)} → ${comma(r.endKm)}km（${comma(r.tripKm)}km）` : `出発 ${comma(r.startKm)}km`}</Pill>
        {r.maintRequest ? <Pill tone={r.maintRequestDone ? 'green' : 'red'}>{r.maintRequestDone ? '整備依頼 対応済' : '整備依頼 対応待ち'}</Pill> : null}
      </View>
      {!r.postDone ? <Text style={{ color: C.sky700, fontSize: 12, fontWeight: '700', marginTop: 8 }}>押すと帰着登録ができます</Text> : null}
    </Card>
  );
  return r.postDone ? body : (
    <Pressable accessibilityRole="button" onPress={onReturn} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}
