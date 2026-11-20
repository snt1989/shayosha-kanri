import { ROOT } from './setup';
import { describe, expect, test } from 'bun:test';

const admin = await import(`${ROOT}/lib/admin`);
const kv = await import(`${ROOT}/lib/kv`);
const utils = await import(`${ROOT}/lib/utils`);
const rate = await import(`${ROOT}/lib/rate-limit`);
const { NextRequest } = await import('next/server');

describe('管理者ログインのトークン', () => {
  test('発行したトークンは有効で、毎回ちがう値になる', () => {
    const a = admin.adminSessionToken();
    const b = admin.adminSessionToken();
    expect(a).not.toBe(b);
    expect(admin.isAdminCookieValid(a)).toBe(true);
  });
  test('期限切れ・改ざん・古い固定値は無効', () => {
    const old = admin.adminSessionToken(Date.now() - 9 * 3600 * 1000);
    expect(admin.isAdminCookieValid(old)).toBe(false);
    const t = admin.adminSessionToken();
    const [exp, nonce, sig] = t.split('.');
    expect(admin.isAdminCookieValid(`${Number(exp) + 1000}.${nonce}.${sig}`)).toBe(false);
    expect(admin.isAdminCookieValid('a'.repeat(64))).toBe(false);
    expect(admin.isAdminCookieValid('')).toBe(false);
  });
  test('パスワードの確認', () => {
    expect(admin.checkAdminPassword('test-password')).toBe(true);
    expect(admin.checkAdminPassword('test-passwor')).toBe(false);
  });
});

describe('回数制限', () => {
  test('5回まちがえると止まり、成功で消える', async () => {
    const b = 'admin:1.2.3.4';
    for (let i = 0; i < 4; i++) expect((await rate.rateFail(b)).locked).toBe(false);
    expect((await rate.rateCheck(b)).ok).toBe(true);
    expect((await rate.rateFail(b)).locked).toBe(true);
    expect((await rate.rateCheck(b)).ok).toBe(false);
    await rate.rateClear(b);
    expect((await rate.rateCheck(b)).ok).toBe(true);
  });
});

describe('書き込みロック', () => {
  test('同時の「読んで・足して・書く」が、1つも消えない', async () => {
    await kv.kvSet('t:counter', 0);
    const inc = () =>
      kv.runExclusive(async () => {
        const v = await kv.kvGet('t:counter', 0);
        await new Promise((r) => setTimeout(r, 2));
        await kv.kvSet('t:counter', v + 1);
      });
    await Promise.all(Array.from({ length: 25 }, inc));
    expect(await kv.kvGet('t:counter', 0)).toBe(25);
  });
  test('お知らせを同時に10件投稿しても、10件とも残る', async () => {
    const { POST, GET } = await import(`${ROOT}/app/api/notices/route`);
    const cookie = `${admin.ADMIN_COOKIE}=${admin.adminSessionToken()}`;
    const post = (i: number) => POST(new NextRequest('http://x/api/notices', { method: 'POST', headers: { cookie }, body: JSON.stringify({ title: `お知らせ${i}`, body: '' }) }));
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => post(i)));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    const j = await (await GET(new NextRequest('http://x/api/notices', { headers: { cookie } }))).json();
    expect(j.notices.filter((n: { title: string }) => n.title.startsWith('お知らせ')).length).toBe(10);
  });
});

describe('タイヤ・整備の判定', () => {
  test('いま履いているタイヤの見分け', () => {
    expect(utils.tireKind('スタッドレス（冬用）')).toBe('winter');
    expect(utils.tireKind('夏タイヤ（ノーマル）')).toBe('summer');
    expect(utils.tireKind('オールシーズン')).toBe('all');
    expect(utils.tireKind('')).toBe('unknown');
  });
  test('DOTの整形と検査', () => {
    expect(utils.normalizeDot('DOT ２３２４')).toBe('2324');
    expect(utils.TIRE_DOT_RE.test('2324')).toBe(true);
    expect(utils.TIRE_DOT_RE.test('9924')).toBe(false);
    expect(utils.dotText('2324')).toContain('2024年 第23週');
  });
  test('修理予定日の車両は、その日だけ使えない', () => {
    const reports = [{ id: 'r1', maintRequest: true, vehicleId: 'v1', vehicleName: 'A', plate: '', maintRequestScheduledDate: '2026-12-01', maintRequestType: '車検' }];
    const blocks = utils.maintBlocks(reports);
    expect(utils.maintBlockIn(blocks, 'v1', '2026-12-01', '2026-12-01')?.reportId).toBe('r1');
    expect(utils.maintBlockIn(blocks, 'v1', '2026-12-02', '2026-12-03')).toBeUndefined();
    expect(utils.maintBlockIn(blocks, 'v2', '2026-12-01', '2026-12-01')).toBeUndefined();
    expect(utils.maintBlocks([{ ...reports[0], maintRequestDone: true }]).length).toBe(0);
  });
});

describe('通知の送り先', () => {
  test('当てはまる端末と、だれのものか不明の端末に送る。当てはまらなければ管理者、それも無ければ全員', async () => {
    const push = await import(`${ROOT}/lib/push`);
    const s = (endpoint: string, who?: object) => ({ endpoint, createdAt: '', ...(who ? { who } : {}) });
    const subs = [s('legacy'), s('adm', { admin: true }), s('mech', { mechanic: '田中' }), s('d1', { driverId: 'd1' }), s('d2', { driverId: 'd2' }), s('anon', { driverId: '', mechanic: '', admin: false })];
    const ep = (to?: object) => push.pickSubs(subs, to).map((x: { endpoint: string }) => x.endpoint).sort();
    expect(ep()).toEqual(['adm', 'anon', 'd1', 'd2', 'legacy', 'mech']);
    expect(ep({ all: true }).length).toBe(6);
    expect(ep({ admins: true })).toEqual(['adm', 'legacy']);
    expect(ep({ admins: true, mechanics: true })).toEqual(['adm', 'legacy', 'mech']);
    expect(ep({ driverIds: ['d2'] })).toEqual(['d2', 'legacy']);
    expect(ep({ driverIds: ['zzz'] })).toEqual(['adm', 'legacy']);
    expect(push.pickSubs([s('anon', { driverId: '' }), s('d1', { driverId: 'd1' })], { admins: true }).length).toBe(2);
    expect(push.cleanWho({ driverId: 'd1', admin: true }, false)).toEqual({ driverId: 'd1', mechanic: '', admin: false });
    expect(push.cleanWho({ admin: true }, true).admin).toBe(true);
  });
});

describe('確定済みの日報の修正の履歴', () => {
  test('変えた項目だけが残り、端末から送った履歴・番号は使われない', async () => {
    const store = await import(`${ROOT}/lib/store`);
    const route = await import(`${ROOT}/app/api/reports/route`);
    const d = await store.loadData();
    const drv = d.drivers[0];
    const base = { id: 'edit-1', date: '2026-11-19', dept: '', driverId: drv.id, driverLast: drv.lastName, driverFirst: drv.firstName, driver: `${drv.lastName} ${drv.firstName}`, vehicleId: '', vehicleName: 'テスト車', plate: '', destination: 'A', purpose: '', preTime: '08:00', preAlcohol: '0.00', preChecker: 'X', tireOk: true, brakeOk: true, postDone: true, postTime: '17:00', postAlcohol: '0.00', postChecker: 'X', startKm: 10, endKm: 20, tripKm: 10, notes: '' };
    const post = (body: unknown, cookie = '') => route.POST(new NextRequest('http://localhost/api/reports', { method: 'POST', headers: { 'content-type': 'application/json', 'x-driver-id': drv.id, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }));
    expect((await post({ ...base, editLog: [{ at: 'x', by: 'fake', changes: [] }], code: 'R-999' })).status).toBe(200);
    let r = (await store.loadData()).reports.find((x: { id: string }) => x.id === 'edit-1');
    expect(r.editLog).toBeUndefined();
    expect(r.code).toBeUndefined();
    // 本人が、帰着済みの日報のアルコールの値を直す
    expect((await post({ ...base, postAlcohol: '0.15', destination: 'B' })).status).toBe(200);
    r = (await store.loadData()).reports.find((x: { id: string }) => x.id === 'edit-1');
    expect(r.editLog.length).toBe(1);
    expect(r.editLog[0].by).toBe(`${drv.lastName} ${drv.firstName}`);
    expect(r.editLog[0].changes.map((c: { label: string }) => c.label).sort()).toEqual(['行先', '運転後のアルコール'].sort());
    // 何も変えずに保存しても、増えない。管理者の修正は「管理者」と残る
    await post({ ...base, postAlcohol: '0.15', destination: 'B' });
    await post({ ...base, postAlcohol: '0.00', destination: 'B', editLog: [] }, `${admin.ADMIN_COOKIE}=${admin.adminSessionToken()}`);
    r = (await store.loadData()).reports.find((x: { id: string }) => x.id === 'edit-1');
    expect(r.editLog.length).toBe(2);
    expect(r.editLog[1].by).toBe('管理者');
    expect(r.editLog[1].changes).toEqual([{ label: '運転後のアルコール', from: '0.15', to: '0.00' }]);
  });
});

describe('未送信の日報（オフライン）', () => {
  test('新規には id を付け、同じ日報は置きかえ、表示に重ねる', async () => {
    const ob = await import(`${ROOT}/lib/outbox`);
    const mk = (id: string, extra = {}) => ({ id, date: '2026-11-20', driver: 'A', vehicleName: 'V', postDone: false, ...extra });
    const a = ob.enqueue([], mk(''), 'd1', '2026-11-20T00:00:00Z');
    expect(a.report.id.startsWith('r')).toBe(true);
    const b = ob.enqueue(a.items, { ...a.report, postDone: true }, 'd1', '2026-11-20T01:00:00Z');
    expect(b.items.length).toBe(1);
    expect(b.items[0].report.postDone).toBe(true);
    const c = ob.enqueue(b.items, mk('srv-1', { postDone: true }), 'd1');
    const shown = ob.applyOutbox({ reports: [mk('srv-1'), mk('srv-2')] }, c.items);
    expect(shown.reports.length).toBe(3);
    expect(shown.reports.find((r: { id: string }) => r.id === 'srv-1').postDone).toBe(true);
    expect(ob.isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(ob.isNetworkError(Object.assign(new Error('x'), { status: 409 }))).toBe(false);
  });
});

describe('写真の保存（Blob が無いときは、これまでどおり Redis）', () => {
  test('保存 → 表示 → 削除', async () => {
    const up = await import(`${ROOT}/app/api/photos/route`);
    const one = await import(`${ROOT}/app/api/photos/[id]/route`);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const res = await up.POST(new NextRequest('http://localhost/api/photos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: `data:image/jpeg;base64,${jpeg.toString('base64')}` }) }));
    const { id } = await res.json();
    expect(id.startsWith('p')).toBe(true);
    const params = { params: Promise.resolve({ id }) };
    const got = await one.GET(new NextRequest(`http://localhost/api/photos/${id}`), params);
    expect(got.status).toBe(200);
    expect(Buffer.from(await got.arrayBuffer()).equals(jpeg)).toBe(true);
    expect((await one.DELETE(new NextRequest(`http://localhost/api/photos/${id}`, { method: 'DELETE' }), params)).status).toBe(200);
    expect((await one.GET(new NextRequest(`http://localhost/api/photos/${id}`), params)).status).toBe(404);
    expect((await up.POST(new NextRequest('http://localhost/api/photos', { method: 'POST', body: JSON.stringify({ image: 'data:image/png;base64,AAAA' }) }))).status).toBe(400);
  });
});

describe('バッテリーの情報', () => {
  test('経過の計算と、目安', () => {
    expect(utils.batteryAge('2026-11-20', '2026-11-20').text).toBe('1か月未満');
    expect(utils.batteryAge('2024-11-21', '2026-11-20')).toEqual({ months: 23, text: '1年11か月', level: 'ok' });
    expect(utils.batteryAge('2024-11-20', '2026-11-20').level).toBe('warn');
    expect(utils.batteryAge('2023-05-01', '2026-11-20')).toEqual({ months: 42, text: '3年6か月', level: 'due' });
    expect(utils.batteryAge('', '2026-11-20')).toBeNull();
    expect(utils.batteryAge('2027-01-01', '2026-11-20')).toBeNull();
  });
  test('保存するのは決まった項目だけ。空なら持たない', async () => {
    expect(utils.cleanBattery({})).toBeUndefined();
    expect(utils.cleanBattery({ maker: ' GSユアサ ', model: '４０b１９l', replacedAt: '2025/1/1', replacedKm: -5, evil: 'x' })).toEqual({ maker: 'GSユアサ', model: '40B19L' });
    const store = await import(`${ROOT}/lib/store`);
    const route = await import(`${ROOT}/app/api/vehicles/route`);
    const v = (await store.loadData()).vehicles[0];
    const post = (body: unknown) => route.POST(new NextRequest('http://localhost/api/vehicles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    await post({ ...v, battery: { maker: 'パナソニック', model: 'q-85', replacedAt: '2025-04-01', replacedKm: 30000, note: 'IS車用' } });
    expect((await store.loadData()).vehicles[0].battery).toEqual({ maker: 'パナソニック', model: 'Q-85', replacedAt: '2025-04-01', replacedKm: 30000, note: 'IS車用' });
    await post({ ...v, battery: { maker: '' } });
    expect((await store.loadData()).vehicles[0].battery).toBeUndefined();
    await post({ ...v, etc: { kind: 'etc', cardLabel: '1234', cardExpiry: '2027-03', evil: 1 } });
    expect((await store.loadData()).vehicles[0].etc).toEqual({ kind: 'etc', cardLabel: '1234', cardExpiry: '2027-03' });
    await post({ ...v, etc: {} });
    expect((await store.loadData()).vehicles[0].etc).toBeUndefined();
  });
});

describe('タイヤの品番', () => {
  test('表示に品番が入る', () => {
    expect(utils.tireInfoText({ maker: 'ブリヂストン', model: 'BLIZZAK VRX3', size: '195/65R15', dot: '2324' })).toBe('ブリヂストン BLIZZAK VRX3 / 195/65R15 / ' + utils.dotText('2324'));
    expect(utils.tireInfoText({ model: 'NEWNO' })).toBe('NEWNO');
  });
});

describe('整備依頼：項目が複数あるとき、終わったものだけ完了', () => {
  test('一部だけ完了 → 対応待ちのまま。全部そろうと対応済。戻すと印が消える', async () => {
    const store = await import(`${ROOT}/lib/store`);
    const route = await import(`${ROOT}/app/api/reports/[id]/maint-request/route`);
    const d = await store.loadData();
    const rep = { id: 'req-multi', date: '2026-11-20', driver: 'A B', driverLast: 'A', driverFirst: 'B', vehicleId: d.vehicles[0].id, vehicleName: 'V', plate: '', destination: '', purpose: '', preTime: '', postDone: true, maintOnly: true, maintRequest: true, maintRequestType: 'オイル交換、タイヤ交換、バッテリー交換', maintRequestUrgency: '通常', maintRequestNote: '' };
    await store.saveData({ reports: [rep, ...d.reports], vehicles: d.vehicles, drivers: d.drivers, masters: d.masters, logs: d.logs });
    const post = (body: unknown) => route.POST(new NextRequest('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'req-multi' }) });
    const get = async () => (await store.loadData()).reports.find((x: { id: string }) => x.id === 'req-multi');
    expect((await post({ doneTypes: [] })).status).toBe(400);
    expect((await post({ doneTypes: ['オイル交換', '関係ない項目'] })).status).toBe(200);
    let r = await get();
    expect(r.maintRequestDone).toBeFalsy();
    expect(r.maintRequestDoneTypes).toEqual(['オイル交換']);
    expect(utils.isRequestOpen(r)).toBe(true);
    expect(utils.requestTypeState(r).left).toEqual(['タイヤ交換', 'バッテリー交換']);
    await post({ doneTypes: ['バッテリー交換'] });
    r = await get();
    expect(r.maintRequestDoneTypes).toEqual(['オイル交換', 'バッテリー交換']);
    expect(utils.isRequestOpen(r)).toBe(true);
    await post({ doneTypes: ['タイヤ交換'] });
    r = await get();
    expect(r.maintRequestDone).toBe(true);
    expect(utils.isRequestOpen(r)).toBe(false);
    // 対応待ちに戻すと、項目ごとの完了も消える
    await post({ done: false });
    r = await get();
    expect(r.maintRequestDone).toBe(false);
    expect(r.maintRequestDoneTypes).toBeUndefined();
    // これまでどおりの「まとめて対応済」も使える
    await post({ done: true });
    r = await get();
    expect(r.maintRequestDone).toBe(true);
    expect(r.maintRequestDoneTypes.length).toBe(3);
  });
});

describe('今日の車両の動き', () => {
  test('走行中・帰着済み・予約・整備・待機に分かれる', async () => {
    const ft = await import(`${ROOT}/lib/fleet-today`);
    const v = (id: string) => ({ id, name: `車${id}`, plate: id });
    const rep = (id: string, vehicleId: string, extra = {}) => ({ id, vehicleId, date: '2026-11-20', preTime: '08:00', driver: 'A', postDone: true, tripKm: 30, ...extra });
    const data = {
      vehicles: ['a', 'b', 'c', 'd', 'e', 'f'].map(v),
      reports: [
        rep('1', 'a', { postDone: false }),
        rep('2', 'b'),
        rep('3', 'b', { preTime: '13:00', tripKm: 12 }),
        rep('4', 'd', { maintOnly: true, maintRequest: true, maintRequestType: 'オイル交換', maintRequestScheduledDate: '2026-11-20' }),
        rep('5', 'f', { date: '2026-11-18', postDone: false }),
        rep('6', 'e', { date: '2026-11-19' }),
      ],
      reservations: [{ id: 'x', vehicleId: 'c', startDate: '2026-11-20', endDate: '2026-11-20', startTime: '14:00', endTime: '16:00', driver: 'B', destination: '' }, { id: 'y', vehicleId: 'e', rentalId: 'e', startDate: '2026-11-20', endDate: '2026-11-20', startTime: '', endTime: '', driver: 'C', destination: '' }],
    };
    const got = Object.fromEntries(ft.fleetToday(data, '2026-11-20').map((x: { id: string; state: string }) => [x.id, x.state]));
    expect(got).toEqual({ a: 'out', b: 'back', c: 'reserved', d: 'maint', e: 'idle', f: 'out' });
    const list = ft.fleetToday(data, '2026-11-20');
    expect(list.find((x: { id: string }) => x.id === 'b').km).toBe(42);
    expect(list.find((x: { id: string }) => x.id === 'f').overdue).toBe(true);
    expect(list.find((x: { id: string }) => x.id === 'd').openRequests).toBe(1);
    expect(list[0].state).toBe('out');
  });
});

describe('整備依頼の「整備中」', () => {
  test('印を付ける・外す。対応済にすると消える。今日の車両の動きに出る', async () => {
    const store = await import(`${ROOT}/lib/store`);
    const route = await import(`${ROOT}/app/api/reports/[id]/maint-request/route`);
    const ft = await import(`${ROOT}/lib/fleet-today`);
    const d = await store.loadData();
    const vid = d.vehicles[1].id;
    const rep = { id: 'req-work', date: '2026-11-20', driver: 'A B', driverLast: 'A', driverFirst: 'B', vehicleId: vid, vehicleName: 'V', plate: '', destination: '', purpose: '', preTime: '', postDone: true, maintOnly: true, maintRequest: true, maintRequestType: 'オイル交換', maintRequestUrgency: '通常', maintRequestNote: '' };
    await store.saveData({ reports: [rep, ...d.reports], vehicles: d.vehicles, drivers: d.drivers, masters: d.masters, logs: d.logs });
    const post = (body: unknown) => route.POST(new NextRequest('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'req-work' }) });
    const get = async () => (await store.loadData()).reports.find((x: { id: string }) => x.id === 'req-work');
    expect((await post({ working: true, by: '田中' })).status).toBe(200);
    let r = await get();
    expect(r.maintRequestWorking).toBe(true);
    expect(r.maintRequestWorkingBy).toBe('田中');
    expect(utils.isRequestOpen(r)).toBe(true);
    const tile = ft.fleetToday(await store.loadData(), '2026-11-25').find((x: { id: string }) => x.id === vid);
    expect(tile.state).toBe('maint');
    expect(tile.working).toBe(true);
    await post({ working: false });
    expect((await get()).maintRequestWorking).toBeUndefined();
    await post({ working: true });
    await post({ done: true });
    r = await get();
    expect(r.maintRequestDone).toBe(true);
    expect(r.maintRequestWorking).toBeUndefined();
    expect((await post({ working: true })).status).toBe(409);
  });
});

describe('取締り・オービス情報（社内の注意地点）', () => {
  test('登録はログインした人だけ。消せるのは本人か管理者。リンクは都道府県で変わる', async () => {
    const tr = await import(`${ROOT}/lib/traffic`);
    const route = await import(`${ROOT}/app/api/traffic-spots/route`);
    const store = await import(`${ROOT}/lib/store`);
    const d = await store.loadData();
    const call = (method: string, body?: unknown, cookie = '') => route[method](new NextRequest('http://localhost/api/traffic-spots', { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }));
    expect(tr.policeName('東京都')).toBe('警視庁');
    expect(tr.policeName('千葉県')).toBe('千葉県警察');
    expect(decodeURIComponent(tr.trafficLinks('大阪府')[0].url)).toContain('大阪府警察');
    expect(tr.cleanSpot({ name: ' ' })).toBeNull();
    expect(tr.cleanSpot({ name: 'A', kind: 'x', lat: 999, lng: 0 })).toEqual({ kind: 'other', name: 'A' });
    expect((await call('POST', { name: '国道の交差点' })).status).toBe(401);
    expect((await call('POST', { driverId: d.drivers[0].id, name: '' })).status).toBe(400);
    const ok = await call('POST', { driverId: d.drivers[0].id, kind: 'orbis', name: '○○交差点の手前', road: '国道16号 上り', limit: '60km/h', lat: 35.123456789, lng: 139.5 });
    expect(ok.status).toBe(200);
    const spot = (await ok.json()).spot;
    expect(spot.lat).toBe(35.123457);
    expect(tr.spotMapUrl(spot)).toContain('35.123457,139.5');
    expect((await (await route.GET()).json()).spots.length).toBe(1);
    expect((await call('DELETE', { id: spot.id, driverId: d.drivers[1].id })).status).toBe(403);
    expect((await call('DELETE', { id: spot.id, driverId: d.drivers[0].id })).status).toBe(200);
    expect((await (await route.GET()).json()).spots.length).toBe(0);
  });
});

describe('岩手県の取締り情報', () => {
  test('17の部署ぶんがあり、道路ごとにまとめられる', async () => {
    const iw = await import(`${ROOT}/lib/traffic-iwate`);
    expect(iw.IWATE_UNITS.length).toBe(17);
    for (const u of iw.IWATE_UNITS) {
      expect(u.routes.length).toBeGreaterThan(0);
      expect(u.pdf.startsWith('https://www.pref.iwate.jp/kenkei/')).toBe(true);
    }
    const roads = iw.iwateByRoad();
    expect(roads[0].road).toBe('東北自動車道');
    const r4 = roads.find((g: { road: string }) => g.road === '国道4号');
    expect(r4.items.length).toBe(9);
    expect(roads.find((g: { road: string }) => g.road === '一関大東線').items.length).toBe(2);
    expect(iw.IWATE_ORBIS.filter((o: { fixed: boolean }) => o.fixed).length).toBe(7);
  });
});

describe('取締り情報のマップ・規制', () => {
  test('地図用の地名がそろっている。地名の問い合わせは岩手県だけ受け付ける', async () => {
    const iw = await import(`${ROOT}/lib/traffic-iwate`);
    const withGeo = iw.IWATE_UNITS.flatMap((u: { routes: { geo?: string[] }[] }) => u.routes).filter((r: { geo?: string[] }) => r.geo?.length);
    expect(withGeo.length).toBe(32);
    expect(iw.IWATE_CLOSURES.length).toBe(3);
    expect(iw.IWATE_LIVE_LINKS.flatMap((g: { items: unknown[] }) => g.items).length).toBe(6);
    expect(iw.orbisGeo(iw.IWATE_ORBIS[0])).toBe('紫波郡矢巾町広宮沢');
    const kv = await import(`${ROOT}/lib/kv`);
    await kv.kvSet('fleet:geo:v1', { '岩手県盛岡市高松': [39.73, 141.15] });
    const route = await import(`${ROOT}/app/api/geocode/route`);
    const res = await route.POST(new NextRequest('http://localhost/api/geocode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: ['岩手県盛岡市高松', '東京都千代田区', 123] }) }));
    const j = await res.json();
    expect(j.geo).toEqual({ '岩手県盛岡市高松': [39.73, 141.15] });
    expect(j.pending).toBe(0);
    await kv.kvDel('fleet:geo:v1');
  });
});

describe('気象庁データの読み取り', () => {
  const area = {
    class10s: { '030010': { name: '内陸' }, '030020': { name: '沿岸北部' }, '030030': { name: '沿岸南部' } },
    class15s: { '030011': { name: '盛岡地域', parent: '030010' }, '030022': { name: '宮古地域', parent: '030020' } },
    class20s: { '0320100': { name: '盛岡市', parent: '030011' }, '0320200': { name: '宮古市', parent: '030022' } },
  };
  test('発表中のものだけを、地域ごとにまとめる（解除・なしは出さない）', async () => {
    const jma = await import(`${ROOT}/lib/jma`);
    const raw = [
      { reportDatetime: '2026-11-20T10:00:00+09:00', headlineText: '大雪に注意', warning: { class10Items: [{ areaCode: '030010', kinds: [{ code: '12', status: '発表' }] }, { areaCode: '030020', kinds: [{ status: '発表警報・注意報はなし' }] }], class20Items: [{ areaCode: '0320100', kinds: [{ code: '12', status: '発表' }, { code: '14', status: '解除' }] }] } },
      { reportDatetime: '2026-11-19T16:00:00+09:00', headlineText: '古い', warning: { class10Items: [{ areaCode: '030030', kinds: [{ code: '15', status: '解除' }] }], class20Items: [{ areaCode: '0320200', kinds: [{ code: '06', status: '継続' }] }] } },
    ];
    const w = jma.parseWarnings(raw, area);
    expect(w.reportDatetime).toBe('2026-11-20T10:00:00+09:00');
    expect(w.headline).toBe('大雪に注意');
    const inland = w.areas.find((a: { code: string }) => a.code === '030010');
    expect(inland.warns.map((x: { name: string }) => x.name)).toEqual(['大雪注意報']);
    expect(inland.warns[0].towns).toEqual(['盛岡市']);
    const north = w.areas.find((a: { code: string }) => a.code === '030020');
    expect(north.warns[0]).toMatchObject({ name: '大雪警報', level: 'warning', road: true, towns: ['宮古市'] });
    expect(w.areas.find((a: { code: string }) => a.code === '030030').warns).toEqual([]);
    expect(w.anyRoad).toBe(true);
    expect(jma.levelOf('49')).toBe('danger');
    expect(jma.levelOf('36')).toBe('special');
    expect(jma.warnName('49')).toBe('土砂災害危険警報');
    expect(jma.parseWarnings({}, area)).toBeNull();
  });
  test('天気予報：今日・明日の天気、降水確率、気温', async () => {
    const jma = await import(`${ROOT}/lib/jma`);
    const raw = [
      {
        reportDatetime: '2026-11-20T11:00:00+09:00',
        timeSeries: [
          { timeDefines: ['2026-11-20T11:00:00+09:00', '2026-11-21T00:00:00+09:00'], areas: [{ area: { name: '内陸', code: '030010' }, weathers: ['雪　時々　くもり', 'くもり'], winds: ['西の風　後　南の風', ''] }] },
          { timeDefines: ['2026-11-20T12:00:00+09:00', '2026-11-20T18:00:00+09:00', '2026-11-21T00:00:00+09:00'], areas: [{ area: { name: '内陸', code: '030010' }, pops: ['40', '60', '30'] }] },
          { timeDefines: ['2026-11-20T09:00:00+09:00', '2026-11-20T00:00:00+09:00', '2026-11-21T00:00:00+09:00', '2026-11-21T09:00:00+09:00'], areas: [{ area: { name: '盛岡', code: '33431' }, temps: ['5', '5', '-1', '6'] }] },
        ],
      },
    ];
    const f = jma.parseForecast(raw);
    expect(f.areas[0].days[0]).toEqual({ date: '2026-11-20', weather: '雪 時々 くもり', pop: '60' });
    expect(f.areas[0].days[1].pop).toBe('30');
    expect(f.areas[0].wind).toBe('西の風 後 南の風');
    expect(f.temps[0]).toEqual({ name: '盛岡', todayMax: '5', tomorrowMin: '-1', tomorrowMax: '6' });
  });
});

describe('ETC', () => {
  test('cleanEtc は決まった項目だけ残し、空なら捨てる', () => {
    expect(utils.cleanEtc({})).toBeUndefined();
    expect(utils.cleanEtc({ kind: 'etc2', model: 'ｃｙ-et2020', cardExpiry: '2027-03', cardLabel: ' 3号車 ', evil: 'x' })).toEqual({ kind: 'etc2', model: 'CY-ET2020', cardLabel: '3号車', cardExpiry: '2027-03' });
    expect(utils.cleanEtc({ kind: 'bad', cardExpiry: '2027-13' })).toBeUndefined();
  });
  test('etcExpiry は月末までを有効とする', () => {
    expect(utils.etcExpiry('2026-11', '2026-11-30')?.level).toBe('warn');
    expect(utils.etcExpiry('2026-10', '2026-11-01')).toEqual({ text: '期限切れ', level: 'due' });
    expect(utils.etcExpiry('2027-12', '2026-11-20')?.level).toBe('ok');
    expect(utils.etcExpiry('', '2026-11-20')).toBeNull();
  });
});
