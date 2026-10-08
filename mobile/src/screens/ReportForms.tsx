import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { MAINT_URGENCIES, Report } from '../../../lib/types';
import { errorMessage, useApp } from '../AppContext';
import { buildDeparture, buildReturn, comma, selectVehicle, validateDeparture, validateReturn } from '../logic';
import { C } from '../theme';
import { Button, Card, ErrorBox, FormModal, NumberField, SectionTitle, SelectField, SwitchRow, TextField, toOptions } from '../ui';

// 出発登録（運転前）
export function DepartureModal({ initial, onClose }: { initial: Report; onClose: () => void }) {
  const { data, saveReport } = useApp();
  const [rec, setRec] = useState<Report>(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  if (!data) return null;
  const set = <K extends keyof Report>(k: K, v: Report[K]) => setRec((cur) => ({ ...cur, [k]: v }));

  async function submit() {
    const problem = validateDeparture(rec);
    if (problem) return setError(problem);
    setSaving(true);
    setError('');
    try {
      await saveReport(buildDeparture(rec));
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title="出発登録（運転前）"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}>
            <Button title="キャンセル" onPress={onClose} />
          </View>
          <View style={{ flex: 2 }}>
            <Button title="出発を登録する" variant="primary" onPress={submit} loading={saving} />
          </View>
        </>
      }
    >
      {error ? <ErrorBox message={error} /> : null}
      <Text style={{ fontSize: 13, color: C.slate600, marginBottom: 12 }}>運転者：{rec.driver}</Text>
      <TextField label="利用日" value={rec.date} onChangeText={(v) => set('date', v)} placeholder="2026-10-08" keyboardType="numbers-and-punctuation" />
      <SelectField label="事業部" value={rec.dept} options={toOptions(data.masters.departments)} onChange={(v) => set('dept', v)} />
      <SelectField
        label="使用車両"
        value={rec.vehicleId}
        options={data.vehicles.map((v) => ({ value: v.id, label: v.name }))}
        onChange={(id) => setRec((cur) => selectVehicle(cur, data, id))}
      />
      <TextField label="行先（必須）" value={rec.destination} onChangeText={(v) => set('destination', v)} autoCapitalize="sentences" />
      <TextField label="用件" value={rec.purpose} onChangeText={(v) => set('purpose', v)} autoCapitalize="sentences" />

      <SectionTitle>運転前のアルコールチェックと簡易点検</SectionTitle>
      <TextField label="出発時刻" value={rec.preTime} onChangeText={(v) => set('preTime', v)} placeholder="09:00" keyboardType="numbers-and-punctuation" />
      <SwitchRow label="アルコールチェックをパス（免除）" value={!!rec.alcoholSkipped} onValueChange={(v) => set('alcoholSkipped', v)} />
      <TextField label="検知器の測定値（mg/L）" value={rec.preAlcohol} onChangeText={(v) => set('preAlcohol', v)} keyboardType="decimal-pad" editable={!rec.alcoholSkipped} />
      <SelectField label="確認方法" value={rec.preMethod || ''} options={toOptions(data.masters.checkMethods)} onChange={(v) => set('preMethod', v)} />
      <SelectField label="確認者" value={rec.preChecker} options={toOptions(data.masters.checkers)} onChange={(v) => set('preChecker', v)} />
      <SwitchRow label="タイヤ空気圧・外観キズ異常なし" value={rec.tireOk} onValueChange={(v) => set('tireOk', v)} />
      <SwitchRow label="ブレーキ・ランプ点灯良好" value={rec.brakeOk} onValueChange={(v) => set('brakeOk', v)} />
      <NumberField label="出発時メーター（km）" value={rec.startKm} onChange={(n) => set('startKm', n)} />
      <TextField label="特記事項" value={rec.notes} onChangeText={(v) => set('notes', v)} multiline autoCapitalize="sentences" />
    </FormModal>
  );
}

// 帰着登録（出庫中の日報に、帰着の情報を入れる）
export function ReturnModal({ initial, onClose }: { initial: Report; onClose: () => void }) {
  const { data, saveReport } = useApp();
  const [rec, setRec] = useState<Report>(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  if (!data) return null;
  const set = <K extends keyof Report>(k: K, v: Report[K]) => setRec((cur) => ({ ...cur, [k]: v }));

  async function submit() {
    const problem = validateReturn(rec);
    if (problem) return setError(problem);
    setSaving(true);
    setError('');
    try {
      await saveReport(buildReturn(rec));
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title="帰着登録"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}>
            <Button title="キャンセル" onPress={onClose} />
          </View>
          <View style={{ flex: 2 }}>
            <Button title="帰着を登録する" variant="primary" onPress={submit} loading={saving} />
          </View>
        </>
      }
    >
      {error ? <ErrorBox message={error} /> : null}
      <Card>
        <Text style={{ fontWeight: '700', color: C.slate800 }}>
          {rec.date}　{rec.driver}
        </Text>
        <Text style={{ color: C.slate600, marginTop: 4 }}>{rec.vehicleName}</Text>
        <Text style={{ color: C.slate600 }}>
          {rec.destination}
          {rec.purpose ? ` / ${rec.purpose}` : ''}
        </Text>
        <Text style={{ color: C.slate500, fontSize: 12, marginTop: 4 }}>
          出発 {rec.preTime}　{comma(rec.startKm)}km
        </Text>
      </Card>

      <SectionTitle>帰着後点呼</SectionTitle>
      <TextField label="帰着時刻" value={rec.postTime} onChangeText={(v) => set('postTime', v)} placeholder="17:30" keyboardType="numbers-and-punctuation" />
      <TextField label="アルコール濃度（mg/L）" value={rec.postAlcohol} onChangeText={(v) => set('postAlcohol', v)} keyboardType="decimal-pad" />
      <SelectField label="確認方法" value={rec.postMethod || ''} options={toOptions(data.masters.checkMethods)} onChange={(v) => set('postMethod', v)} />
      <SelectField label="確認者" value={rec.postChecker} options={toOptions(data.masters.checkers)} onChange={(v) => set('postChecker', v)} />
      <NumberField label="帰着時の走行距離（km）" value={rec.endKm} onChange={(n) => set('endKm', n)} hint={`出発時は ${comma(rec.startKm)}km でした。メーターの数字を入力してください。`} />

      <SectionTitle>整備依頼</SectionTitle>
      <SwitchRow
        label="この車両の整備を依頼する（不具合・点検・消耗品交換など）"
        value={!!rec.maintRequest}
        onValueChange={(v) =>
          setRec((cur) => ({
            ...cur,
            maintRequest: v,
            maintRequestType: cur.maintRequestType || data.masters.maintTypes[0] || '',
            maintRequestUrgency: cur.maintRequestUrgency || MAINT_URGENCIES[0],
          }))
        }
      />
      {rec.maintRequest ? (
        <>
          <SelectField label="整備種別" value={rec.maintRequestType || ''} options={toOptions(data.masters.maintTypes)} onChange={(v) => set('maintRequestType', v)} />
          <SelectField label="緊急度" value={rec.maintRequestUrgency || MAINT_URGENCIES[0]} options={toOptions(MAINT_URGENCIES)} onChange={(v) => set('maintRequestUrgency', v)} />
          <TextField label="依頼内容・症状（必須）" value={rec.maintRequestNote || ''} onChangeText={(v) => set('maintRequestNote', v)} multiline placeholder="例：ブレーキから異音がする" autoCapitalize="sentences" />
        </>
      ) : null}

      <TextField label="特記事項" value={rec.notes} onChangeText={(v) => set('notes', v)} multiline autoCapitalize="sentences" />
    </FormModal>
  );
}
