import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { FuelLog } from '../../../lib/types';
import { computeEfficiency } from '../../../lib/fuel';
import { errorMessage, useApp } from '../AppContext';
import { changeFuelVehicle, comma, newFuelLog, oneDecimal, sortFuel, validateFuel, yen } from '../logic';
import { C } from '../theme';
import { Button, Card, Empty, ErrorBox, FormModal, Muted, NumberField, Pill, Screen, SelectField, Spinner, SwitchRow, TextField, toOptions } from '../ui';

const PAGE = 50;

export default function FuelScreen() {
  const { data, loading, refreshing, error, refresh, requireDriver } = useApp();
  const [vehicleId, setVehicleId] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [rec, setRec] = useState<FuelLog | null>(null);

  const efficiency = useMemo(() => computeEfficiency(data?.fuelLogs ?? []), [data?.fuelLogs]);
  const all = useMemo(() => sortFuel(data?.fuelLogs ?? []), [data?.fuelLogs]);
  const rows = useMemo(() => all.filter((f) => !vehicleId || f.vehicleId === vehicleId), [all, vehicleId]);

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

  const totalLiters = rows.reduce((n, f) => n + f.liters, 0);
  const totalAmount = rows.reduce((n, f) => n + f.amount, 0);
  const effs = rows.map((f) => efficiency.get(f.id)).filter((v): v is number => typeof v === 'number');
  const avgEff = effs.length ? effs.reduce((a, b) => a + b, 0) / effs.length : null;

  return (
    <Screen>
      <FlatList
        data={rows.slice(0, limit)}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          <View>
            {error ? <ErrorBox message={error} onRetry={refresh} /> : null}
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.slate800, marginBottom: 4 }}>給油台帳</Text>
            <Muted>給油量・金額・メーターを記録し、燃費（満タン法）と費用を確認できます。記録の修正と削除は、Web版で管理者が行います。</Muted>
            <View style={{ height: 12 }} />
            <Button title="＋ 給油を記録" variant="primary" onPress={() => requireDriver((d) => setRec(newFuelLog(data, d, vehicleId || undefined)))} disabled={data.vehicles.length === 0} />
            <View style={{ height: 12 }} />
            <SelectField
              label="車両で絞り込み"
              value={vehicleId}
              options={[{ value: '', label: 'すべての車両' }, ...data.vehicles.map((v) => ({ value: v.id, label: v.name }))]}
              onChange={(v) => { setVehicleId(v); setLimit(PAGE); }}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              <Pill>{`${rows.length}件`}</Pill>
              <Pill>{`給油量 ${oneDecimal(totalLiters)} L`}</Pill>
              <Pill tone="green">{`費用合計 ${yen(totalAmount)}`}</Pill>
              {totalLiters > 0 ? <Pill>{`平均単価 ${oneDecimal(totalAmount / totalLiters)} 円/L`}</Pill> : null}
              {avgEff !== null ? <Pill tone="amber">{`平均燃費 ${oneDecimal(avgEff)} km/L`}</Pill> : null}
            </View>
          </View>
        }
        ListEmptyComponent={<Empty text="給油の記録がありません" />}
        ListFooterComponent={
          <View>
            {rows.length > limit ? <Button title={`さらに表示（残り ${rows.length - limit}件）`} onPress={() => setLimit(limit + PAGE)} /> : null}
            {rows.length > 0 ? <Muted>燃費は「満タン給油」を基準に、前回の満タン給油からの走行距離 ÷ その間の給油量で計算します（最初の満タン給油は基準のため「-」）。</Muted> : null}
          </View>
        }
        renderItem={({ item: f }) => {
          const eff = efficiency.get(f.id);
          return (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontWeight: '700', color: C.slate800 }}>{f.date}</Text>
                {f.full ? <Pill tone="green">満タン</Pill> : null}
              </View>
              <Text style={{ color: C.slate600, marginTop: 4 }}>{f.vehicleName}</Text>
              <Text style={{ color: C.slate800, marginTop: 4, fontSize: 15 }}>
                {oneDecimal(f.liters)} L　{yen(f.amount)}
                {f.liters > 0 && f.amount > 0 ? `（${oneDecimal(f.amount / f.liters)} 円/L）` : ''}
              </Text>
              <Muted>
                {f.fuelType}　{f.payMethod}　メーター {comma(f.km)}km
              </Muted>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>
                <Pill tone={typeof eff === 'number' ? 'amber' : 'slate'}>{typeof eff === 'number' ? `燃費 ${oneDecimal(eff)} km/L` : '燃費 -'}</Pill>
                <Muted>{f.driver}</Muted>
              </View>
              {f.note ? <Muted>{f.note}</Muted> : null}
            </Card>
          );
        }}
      />
      {rec ? <FuelFormModal initial={rec} onClose={() => setRec(null)} /> : null}
    </Screen>
  );
}

function FuelFormModal({ initial, onClose }: { initial: FuelLog; onClose: () => void }) {
  const { data, saveFuelLog } = useApp();
  const [rec, setRec] = useState<FuelLog>(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  if (!data) return null;
  const set = <K extends keyof FuelLog>(k: K, v: FuelLog[K]) => setRec((cur) => ({ ...cur, [k]: v }));
  const unit = rec.liters > 0 && rec.amount > 0 ? rec.amount / rec.liters : null;

  async function submit() {
    const problem = validateFuel(rec, data!.fuelLogs);
    if (problem) return setError(problem);
    setSaving(true);
    setError('');
    try {
      await saveFuelLog({ ...rec, amount: Math.round(rec.amount) });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title="給油を記録"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}>
            <Button title="キャンセル" onPress={onClose} />
          </View>
          <View style={{ flex: 2 }}>
            <Button title="登録する" variant="primary" onPress={submit} loading={saving} />
          </View>
        </>
      }
    >
      {error ? <ErrorBox message={error} /> : null}
      <Text style={{ fontSize: 13, color: C.slate600, marginBottom: 12 }}>給油した人：{rec.driver}</Text>
      <SelectField label="車両" value={rec.vehicleId} options={data.vehicles.map((v) => ({ value: v.id, label: v.name }))} onChange={(id) => setRec((cur) => changeFuelVehicle(cur, data, id))} />
      <TextField label="給油日" value={rec.date} onChangeText={(v) => set('date', v)} placeholder="2026-10-08" keyboardType="numbers-and-punctuation" />
      <SelectField label="燃料" value={rec.fuelType} options={toOptions(data.masters.fuelTypes)} onChange={(v) => set('fuelType', v)} />
      <SelectField label="支払方法" value={rec.payMethod} options={toOptions(data.masters.payMethods)} onChange={(v) => set('payMethod', v)} />
      <NumberField label="給油量（L）" value={rec.liters} onChange={(n) => set('liters', n)} decimal />
      <NumberField label="金額（円）" value={rec.amount} onChange={(n) => set('amount', n)} hint={unit !== null ? `単価 ${oneDecimal(unit)} 円/L` : undefined} />
      <NumberField label="給油時のメーター（km）" value={rec.km} onChange={(n) => set('km', n)} />
      <SwitchRow label="満タンまで給油した（燃費の計算に使います）" value={rec.full} onValueChange={(v) => set('full', v)} />
      <TextField label="備考" value={rec.note} onChangeText={(v) => set('note', v)} autoCapitalize="sentences" />
    </FormModal>
  );
}
