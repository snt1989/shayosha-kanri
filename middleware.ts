import { NextRequest, NextResponse } from 'next/server';

// BASIC_AUTH_USER と BASIC_AUTH_PASSWORD が両方設定されている場合のみ
// Basic認証を有効化します（Vercelの環境変数で設定してください）。
export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !pass) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const encoded = authHeader.split(' ')[1] || '';
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const [reqUser, reqPass] = decoded.split(':');
    if (reqUser === user && reqPass === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse('認証が必要です', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Fleet Management"' },
  });
}

export const config = {
  // アイコン・マニフェスト・サービスワーカー・オフライン画面は、Basic認証の対象にしない
  // （ブラウザはこれらを認証情報なしで取得することがあり、401になるとアプリとして入れられなくなる）
  matcher: '/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|sw.js|offline.html|icons/).*)',
};
