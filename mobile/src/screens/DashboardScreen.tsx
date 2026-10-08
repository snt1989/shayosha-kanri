import React, { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { MAINT_URGENCIES, Report } from '../../../lib/types';
import { computeAlerts } from '../../../lib/alerts';
import { openMaintRequests, todayStr } from '../../../lib/utils';
import { useApp } from '../AppContext';
import { comma, driverName, newDeparture, startReturn } from '../logic';
import { C } from '../theme';
import { Button, Card, Empty, ErrorBox, Heading, Muted, Pill, Screen, Spinner } from '../ui';
import { DepartureModal, ReturnModal } from './ReportForms';

export default function DashboardScreen() {
  const { data, loading, refreshing, error, refresh, currentDriver, requireDriver, openLogin, logoutDriver } = useApp();
  const [dep, setDep] = useState<Report | null>(null);
  const [ret, setRet] = useState<Report | null>(null);

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

  const today = todayStr();
  const todayReports = data.reports.filter((r) => r.date === today);
  const open = data.reports.filter((r) => !r.postDone).sort((a, b) => (a.date + a.preTime).localeCompare(b.date + b.preTime));
  const maint = openMaintRequests(data.reports);
  const alerts = computeAlerts(data);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {error ? <ErrorBox message={error} onRetry={refresh} /> : null}

        <Card>
          {currentDriver ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Muted>ログイン中</Muted>
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.slate800 }}>{driverName(currentDriver)} さん</Text>
              </View>
              <Button title="切り替え" small onPress={logoutDriver} />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Muted>出発・帰着・給油の記録には、運転者としてのログインが必要です。</Muted>
              <Button title="運転者としてログイン" onPress={openLogin} />
            </View>
          )}
        </Card>

        <View style={{ marginBottom: 12 }}>
          <Button title="＋ 出発登録（運転前）" variant="primary" onPress={() => requireDriver((d) => setDep(newDeparture(data, d)))} />
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Tile label="本日の日報" value={`${todayReports.length}件`} sub={`運行中 ${todayReports.filter((r) => !r.postDone).length}件`} />
          <Tile label="アラート" value={`${alerts.total}件`} tone={alerts.total > 0 ? 'warn' : undefined} />
          <Tile label="整備依頼" value={`${maint.length}件`} tone={maint.length > 0 ? 'warn' : undefined} />
        </View>

        <Card>
          <Heading>帰着登録が済んでいない日報{open.length > 0 ? `（${open.length}件）` : ''}</Heading>
          {open.length === 0 ? (
            <Empty text="帰着未登録の日報はありません" />
          ) : (
            open.map((r) => {
              const overdue = r.date < today;
              return (
                <View key={r.id} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.slate200, gap: 6 }}>
                  <Text style={{ color: C.slate800, fontWeight: '700' }}>
                    {r.date}　{r.driver}
                    {overdue ? '（日付超過）' : ''}
                  </Text>
                  <Muted>
                    {r.vehicleName}　{r.destination}
                    {r.purpose ? ` / ${r.purpose}` : ''}　出発 {r.preTime}
                  </Muted>
                  <Button title="帰着登録する" small variant={overdue ? 'danger' : 'primary'} onPress={() => requireDriver(() => setRet(startReturn(r, data)))} />
                </View>
              );
            })
          )}
        </Card>

        <Card>
          <Heading>整備依頼（対応待ち）{maint.length > 0 ? `（${maint.length}件）` : ''}</Heading>
          {maint.length === 0 ? (
            <Empty text="対応待ちの整備依頼はありません" />
          ) : (
            maint.map((r) => (
              <View key={r.id} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.slate200, gap: 4 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text style={{ fontWeight: '700', color: C.slate800 }}>{r.vehicleName}</Text>
                  {r.maintRequestUrgency && r.maintRequestUrgency !== MAINT_URGENCIES[0] ? (
                    <Pill tone={r.maintRequestUrgency === MAINT_URGENCIES[2] ? 'red' : 'amber'}>{r.maintRequestUrgency}</Pill>
                  ) : null}
                </View>
                <Muted>
                  {r.maintRequestType || '整備'}：{r.maintRequestNote}（依頼 {r.date} {r.driver}）
                </Muted>
              </View>
            ))
          )}
          <Muted>整備士の対応は、いまはWeb版の整備台帳で行います。</Muted>
        </Card>

        <Card tone={alerts.total > 0 ? 'warn' : undefined}>
          <Heading>アラート</Heading>
          {alerts.total === 0 ? <Empty text="現在、対応が必要なアラートはありません" /> : null}
          {alerts.shaken.map(({ v, days }) => (
            <AlertRow key={'s' + v.id} icon="🚗" danger={days < 0} text={`${v.name}：車検満了日 ${v.shakenDate}${days < 0 ? `（${-days}日超過）` : `（あと${days}日）`}`} />
          ))}
          {alerts.oil.map((v) => (
            <AlertRow key={'o' + v.id} icon="🛢️" text={`${v.name}：オイル交換の目安まで あと${comma(Math.max(0, v.oilKm - v.odometer))}km（現在 ${comma(v.odometer)}km）`} />
          ))}
          {alerts.license.map(({ d, days }) => (
            <AlertRow key={'l' + d.id} icon="🪪" danger={days < 0} text={`${driverName(d)}：免許の更新期日 ${d.licenseExpiry}${days < 0 ? `（${-days}日超過）` : `（あと${days}日）`}`} />
          ))}
          {alerts.ngAlcohol.slice(0, 5).map((r) => (
            <AlertRow key={'a' + r.id} icon="🍺" danger text={`${r.date} ${r.driver}：アルコール検知（出発前 ${r.preAlcohol}mg/L${r.postDone ? ` / 帰着後 ${r.postAlcohol}mg/L` : ''}）`} />
          ))}
        </Card>
      </ScrollView>

      {dep ? <DepartureModal initial={dep} onClose={() => setDep(null)} /> : null}
      {ret ? <ReturnModal initial={ret} onClose={() => setRet(null)} /> : null}
    </Screen>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <View style={{ flex: 1, backgroundColor: tone === 'warn' ? C.amber100 : C.white, borderRadius: 12, borderWidth: 1, borderColor: tone === 'warn' ? C.amber100 : C.slate200, padding: 10 }}>
      <Text style={{ fontSize: 11, color: C.slate500 }}>{label}</Text>
      <Text style={{ fontSize: 20, fontWeight: '800', color: tone === 'warn' ? C.amber600 : C.slate800, marginTop: 2 }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 11, color: C.slate500, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );
}

function AlertRow({ icon, text, danger }: { icon: string; text: string; danger?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.slate200 }}>
      <Text>{icon}</Text>
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: danger ? C.red600 : C.slate800 }}>{text}</Text>
    </View>
  );
}
