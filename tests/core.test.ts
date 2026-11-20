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
