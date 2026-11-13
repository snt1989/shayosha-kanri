// この版のID。Vercel ではコミットのID。画面（ブラウザ）にもサーバーにも同じ値が埋め込まれ、
// 「アプリが新しくなった」ことを見分けるのに使う（/api/version と components/UpdatePrompt.tsx）。
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
};

export default nextConfig;
