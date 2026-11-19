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
