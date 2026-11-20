import { ROOT } from './setup';
import { afterAll, describe, expect, test } from 'bun:test';

const pins = await import(`${ROOT}/lib/pins`);
const store = await import(`${ROOT}/lib/store`);
const kv = await import(`${ROOT}/lib/kv`);
const admin = await import(`${ROOT}/lib/admin`);
const pinsRoute = await import(`${ROOT}/app/api/pins/route`);
const authRoute = await import(`${ROOT}/app/api/auth/pin/route`);
const reqRoute = await import(`${ROOT}/app/api/maint-requests/route`);
const { NextRequest } = await import('next/server');

const req = (url: string, method: string, body?: unknown, cookie = '') =>
  new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const cookieOf = (res: Response) => (res.headers.get('set-cookie') || '').split(';')[0];

describe('運転者・整備士の暗証番号', () => {
  afterAll(async () => {
    await kv.kvDel(pins.PINS_KEY);
    await kv.kvDel('fleet:rate:v1');
  });

  test('トークンは本人の名前・種類・期限を確かめる', () => {
    const t = pins.pinToken('driver', 'd1');
    expect(pins.pinTokenId('driver', t)).toBe('d1');
    expect(pins.pinTokenId('mechanic', t)).toBe('');
    expect(pins.pinTokenId('driver', pins.pinToken('driver', 'd1', Date.now() - 91 * 86400000))).toBe('');
    expect(pins.pinTokenId('driver', t.slice(0, -2) + 'xx')).toBe('');
  });

  test('設定 → 確認 → 暗証番号つきの名前は、確認済みの端末だけが使える', async () => {
    const data = await store.loadData();
    const d = data.drivers[0];
    const v = data.vehicles[0];
    // まだ暗証番号が無い：これまでどおり通る
    const body = { vehicleId: v.id, driverId: d.id, type: 'その他', urgency: '通常', note: 'テスト' };
    expect((await reqRoute.POST(req('/api/maint-requests', 'POST', body))).status).toBe(200);

    expect((await pinsRoute.POST(req('/api/pins', 'POST', { kind: 'driver', id: d.id, pin: '12a4' }))).status).toBe(400);
    expect((await pinsRoute.POST(req('/api/pins', 'POST', { kind: 'driver', id: 'nobody', pin: '1234' }))).status).toBe(404);
    const set = await pinsRoute.POST(req('/api/pins', 'POST', { kind: 'driver', id: d.id, pin: '1234' }));
    expect(set.status).toBe(200);
    const selfCookie = cookieOf(set);
    expect(selfCookie.startsWith('fleet_pin_d=')).toBe(true);
    const list = await (await pinsRoute.GET()).json();
    expect(list.drivers).toEqual([d.id]);
    // 保存されているのは照合用の値だけ
    expect(JSON.stringify(await kv.kvGet(pins.PINS_KEY, null))).not.toContain('1234');
    // /api/data の本体には入らない
    expect(JSON.stringify(await store.loadData())).not.toContain('fleet_pin');

    // 確認していない端末：止まる
    const deny = await reqRoute.POST(req('/api/maint-requests', 'POST', body));
    expect(deny.status).toBe(401);
    expect((await deny.json()).pin).toBe(true);
    // まちがった暗証番号
    const bad = await authRoute.POST(req('/api/auth/pin', 'POST', { kind: 'driver', id: d.id, pin: '0000' }));
    expect(bad.status).toBe(401);
    // 正しい暗証番号 → クッキー → 通る
    const ok = await authRoute.POST(req('/api/auth/pin', 'POST', { kind: 'driver', id: d.id, pin: '1234' }));
    expect(ok.status).toBe(200);
    expect((await reqRoute.POST(req('/api/maint-requests', 'POST', body, cookieOf(ok)))).status).toBe(200);
    // ほかの人のクッキーでは通らない
    const other = `fleet_pin_d=${pins.pinToken('driver', 'someone-else')}`;
    expect((await reqRoute.POST(req('/api/maint-requests', 'POST', body, other))).status).toBe(401);

    // 変更は、いまの暗証番号が要る。管理者は消せる
    expect((await pinsRoute.POST(req('/api/pins', 'POST', { kind: 'driver', id: d.id, pin: '9999' }))).status).toBe(401);
    expect((await pinsRoute.POST(req('/api/pins', 'POST', { kind: 'driver', id: d.id, pin: '9999', currentPin: '1234' }))).status).toBe(200);
    expect((await pinsRoute.DELETE(req('/api/pins', 'DELETE', { kind: 'driver', id: d.id }))).status).toBe(401);
    const adminCookie = `${admin.ADMIN_COOKIE}=${admin.adminSessionToken()}`;
    expect((await pinsRoute.DELETE(req('/api/pins', 'DELETE', { kind: 'driver', id: d.id }, adminCookie))).status).toBe(200);
    expect((await reqRoute.POST(req('/api/maint-requests', 'POST', body))).status).toBe(200);
  });

  test('5回まちがえると止まる', async () => {
    const data = await store.loadData();
    const m = data.masters.mechanics[0] || '整備士A';
    if (!data.masters.mechanics.includes(m)) {
      data.masters.mechanics.push(m);
      await store.saveData({ reports: data.reports, vehicles: data.vehicles, drivers: data.drivers, masters: data.masters, logs: data.logs });
    }
    await pins.setPin('mechanic', m, '4321');
    let last = 0;
    for (let i = 0; i < 5; i++) last = (await authRoute.POST(req('/api/auth/pin', 'POST', { kind: 'mechanic', id: m, pin: '0000' }))).status;
    expect(last).toBe(401);
    expect((await authRoute.POST(req('/api/auth/pin', 'POST', { kind: 'mechanic', id: m, pin: '4321' }))).status).toBe(429);
  });
});
