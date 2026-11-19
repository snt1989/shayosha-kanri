// テスト用：保存先を一時フォルダにする（lib/kv.ts と lib/store.ts は、読み込み時の作業フォルダの .data を使う）
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const dir = mkdtempSync(path.join(tmpdir(), 'fleet-test-'));
process.chdir(dir);
process.env.ADMIN_PASSWORD = 'test-password';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.KV_REST_API_URL;
export const ROOT = path.resolve(import.meta.dir, '..');
