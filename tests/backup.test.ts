import { ROOT } from './setup';
import { afterAll, describe, expect, test } from 'bun:test';

const backup = await import(`${ROOT}/lib/backup`);
const store = await import(`${ROOT}/lib/store`);
const kv = await import(`${ROOT}/lib/kv`);
const admin = await import(`${ROOT}/lib/admin`);
const restoreRoute = await import(`${ROOT}/app/api/backup/restore/route`);
const { NextRequest } = await import('next/server');

const post = (body: unknown, withAdmin = true) =>
  new NextRequest('http://localhost/api/backup/restore', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(withAdmin ? { cookie: `${admin.ADMIN_COOKIE}=${admin.adminSessionToken()}` } : {}) },
    body: JSON.stringify(body),
  });

describe('バックアップと復元', () => {
  afterAll(async () => {
    for (const k of ['fleet:notices:v1', 'fleet:cards:v1', 'fleet:push:subs:v1', 'fleet:reports:archive:v1:2026-01']) await kv.kvDel(k);
  });
  test('全種類が入り、復元でその時点に戻る（後から増えたキーは消える）', async () => {
    const d = await store.loadData();
    const vehicles0 = d.vehicles.length;
    await kv.kvSet('fleet:notices:v1', [{ id: 'n1', text: 'A' }]);
    await kv.kvSet('fleet:reports:archive:v1:2026-01', [{ id: 'r-old' }]);
    const b = await backup.collectBackup();
    expect(b.format).toBe('fleet-backup');
    expect(b.keys['fleet:notices:v1']).toEqual([{ id: 'n1', text: 'A' }]);
    expect(b.keys['fleet:reports:archive:v1:2026-01']).toEqual([{ id: 'r-old' }]);

    // その後に変更
    await store.saveData({ reports: d.reports, vehicles: [], drivers: d.drivers, masters: d.masters, logs: d.logs });
    await kv.kvSet('fleet:notices:v1', [{ id: 'n2', text: 'B' }]);
    await kv.kvSet('fleet:insurance:v1', { company: 'X' });
    await kv.kvSet('fleet:push:subs:v1', [{ endpoint: 'keep' }]);

    const parsed = backup.parseBackup(JSON.parse(JSON.stringify(b)));
    expect(parsed).not.toBeNull();
    await backup.applyBackup(parsed);
    expect((await store.loadData()).vehicles.length).toBe(vehicles0);
    expect(await kv.kvGet('fleet:notices:v1', null)).toEqual([{ id: 'n1', text: 'A' }]);
    expect(await kv.kvGet('fleet:insurance:v1', null)).toBeNull();
    // バックアップの対象外（通知の登録）は触らない
    expect(await kv.kvGet('fleet:push:subs:v1', null)).toEqual([{ endpoint: 'keep' }]);
  });

  test('形のちがうものは受け付けない。旧形式は本体だけ戻す', async () => {
    expect(backup.parseBackup(null)).toBeNull();
    expect(backup.parseBackup({ foo: 1 })).toBeNull();
    expect(backup.parseBackup({ format: 'fleet-backup', data: { reports: [] }, keys: {} })).toBeNull();
    const d = await store.loadData();
    const { persistent, ...plain } = d;
    void persistent;
    const old = backup.parseBackup(plain);
    expect(old.version).toBe(0);
    await kv.kvSet('fleet:cards:v1', [{ id: 'c1' }]);
    await backup.applyBackup(old);
    expect(await kv.kvGet('fleet:cards:v1', null)).toEqual([{ id: 'c1' }]);
  });

  test('許可していないキーは書き込まない', async () => {
    const b = await backup.collectBackup();
    b.keys['fleet:push:subs:v1'] = [{ endpoint: 'evil' }];
    b.keys['fleet:rate:v1'] = {};
    await backup.applyBackup(b);
    expect(await kv.kvGet('fleet:push:subs:v1', null)).toEqual([{ endpoint: 'keep' }]);
  });

  test('控えは7日分だけ残る', async () => {
    for (let i = 1; i <= 9; i++) await kv.kvSet(`${backup.SNAPSHOT_PREFIX}2026-01-0${i}`, await backup.collectBackup());
    await backup.saveSnapshot();
    const list = await backup.listSnapshots();
    const dated = list.filter((s: { id: string }) => s.id !== 'pre-restore');
    expect(dated.length).toBe(7);
    expect(dated.some((s: { id: string }) => s.id === '2026-01-01')).toBe(false);
  });

  test('復元API：管理者のみ・確認の文字が必要・直前の状態を残す', async () => {
    const b = await backup.collectBackup();
    expect((await restoreRoute.POST(post({ backup: b, confirm: '復元' }, false))).status).toBe(401);
    expect((await restoreRoute.POST(post({ backup: b }))).status).toBe(400);
    expect((await restoreRoute.POST(post({ backup: { x: 1 }, confirm: '復元' }))).status).toBe(400);
    await kv.kvSet('fleet:notices:v1', [{ id: 'before-restore' }]);
    const res = await restoreRoute.POST(post({ backup: b, confirm: '復元' }));
    expect(res.status).toBe(200);
    const pre = await backup.loadSnapshot('pre-restore');
    expect(pre.keys['fleet:notices:v1']).toEqual([{ id: 'before-restore' }]);
    const logs = (await store.loadData()).logs;
    expect(logs[0].action).toBe('バックアップから復元');
  });
});

describe('古い日報の保管', () => {
  test('帰着済みで3か月より前の月の日報だけが移り、番号はずれない', async () => {
    const arch = await import(`${ROOT}/lib/report-archive`);
    expect(arch.archiveCutoff('2026-11-20')).toBe('2026-08-01');
    expect(arch.archiveCutoff('2026-02-10')).toBe('2025-11-01');
    const d = await store.loadData();
    const mk = (id: string, date: string, extra = {}) => ({ id, date, preTime: '08:00', driver: 'A', vehicleName: 'V', destination: '', purpose: '', postDone: true, startKm: 1, endKm: 2, tripKm: 1, ...extra });
    const reports = [
      mk('a1', '2026-05-10'),
      mk('a2', '2026-07-31'),
      mk('k-open', '2026-05-11', { postDone: false }),
      mk('k-req', '2026-05-12', { maintRequest: true, maintRequestDone: true }),
      mk('k-new', '2026-08-01'),
      mk('k-now', '2026-11-19'),
    ];
    await store.saveData({ reports, vehicles: d.vehicles, drivers: d.drivers, masters: d.masters, logs: [] });
    const r = await arch.archiveOldReports('2026-11-20');
    expect(r.moved).toBe(2);
    expect(r.months).toEqual(['2026-05', '2026-07']);
    const after = await store.loadData();
    expect(after.reports.map((x: { id: string }) => x.id).sort()).toEqual(['k-new', 'k-now', 'k-open', 'k-req']);
    expect(after.reports.find((x: { id: string }) => x.id === 'k-open').code).toBe('R-102');
    expect(after.reports.find((x: { id: string }) => x.id === 'k-now').code).toBe('R-106');
    const may = await arch.loadArchiveMonth('2026-05');
    expect(may.length).toBe(1);
    expect(may[0].code).toBe('R-101');
    expect((await arch.loadArchiveMonth('2026-07'))[0].code).toBe('R-104');
    expect((await arch.loadArchiveIndex()).total).toBe(2);
    // もう一度走らせても、増えない
    expect((await arch.archiveOldReports('2026-11-20')).moved).toBe(0);
    // バックアップに、保管分も入る
    const b = await backup.collectBackup();
    expect(Object.keys(b.keys).filter((k) => k.startsWith('fleet:reports:archive:v1:')).length).toBe(3);
    const route = await import(`${ROOT}/app/api/reports/archive/route`);
    const j = await (await route.GET(new NextRequest('http://localhost/api/reports/archive'))).json();
    expect(j.total).toBe(2);
    expect(j.months[0].month).toBe('2026-07');
    for (const k of await kv.kvKeys('fleet:reports:archive:v1:')) await kv.kvDel(k);
    await store.saveData({ reports: [], vehicles: d.vehicles, drivers: d.drivers, masters: d.masters, logs: [] });
  });
});
