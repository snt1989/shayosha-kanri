// プッシュ通知用の「VAPID鍵」を作る。パソコンで一度だけ実行する。
//   node scripts/gen-vapid.mjs
// 表示された2つを、Vercel の Environment Variables に登録して、再デプロイする。
// VAPID_PRIVATE_KEY は秘密の鍵なので、他人に見せたり、ファイルに保存したり（コミットしたり）しない。
import crypto from 'crypto';

const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);

console.log('次の2つを、Vercel の Environment Variables に登録してください。\n');
console.log('VAPID_PUBLIC_KEY=' + pub.toString('base64url'));
console.log('VAPID_PRIVATE_KEY=' + jwk.d);
console.log('\n（任意）VAPID_SUBJECT=mailto:あなたのメールアドレス');
console.log('（毎朝の自動通知を使うとき）CRON_SECRET=推測されにくい長い文字列');
