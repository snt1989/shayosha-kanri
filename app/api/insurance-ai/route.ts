import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 自動車保険の「保険証券」「満期日のお知らせ」「契約内容のお知らせ」の画像（またはPDFの文字）を、AI（Claude）に読み取らせる。管理者のみ。
// 読み取るのは、保険情報のページの項目だけ（証券番号・契約者・期間・代理店・窓口）。車両ごとの保険料や、個人の住所・生年月日などは取り出さない。
// APIキー（ANTHROPIC_API_KEY）が未設定のときは、使えないことを返す。画像は社外（Anthropic）へ送られる。
const MODEL = process.env.SHAKEN_AI_MODEL || 'claude-sonnet-5-5';
const MAX_IMAGE_CHARS = 3_500_000; // data URL の長さ（Vercelのリクエスト上限 約4.5MB に収める）
const MAX_TEXT_CHARS = 8000;

const PROMPT = `これは日本の自動車保険の「保険証券」「保険期間の満期日のお知らせ」「契約内容のお知らせ」のいずれかです（画像と、PDFから取り出した文字が付くことがあります）。次の項目を読み取り、JSONだけを出力してください。読み取れない項目は空文字にします。
{
 "company": "保険会社名。例: 三井住友海上",
 "product": "保険の種類。例: 自動車保険（法人用は「自動車保険」でよい）",
 "policyNo": "証券番号。英数字とハイフンだけ。例: NC18720385",
 "holder": "保険契約者（法人名または氏名）",
 "periodFrom": "保険期間の始まりの日。西暦 YYYY-MM-DD",
 "periodTo": "保険期間の満期日（終わりの日）。西暦 YYYY-MM-DD",
 "agencyName": "取扱代理店の名前",
 "agencyPhone": "取扱代理店の電話番号。例: 019-601-2320",
 "deskName": "保険会社のお客さま窓口・事故受付の名前",
 "deskPhone": "その電話番号",
 "deskHours": "その受付時間（書いてあるとき）"
}
和暦は西暦に直してください（令和元年=2019年）。更新前と更新後の両方が書かれているときは、更新後（これからの期間）を選んでください。上の項目以外（保険料・住所・生年月日・車両ごとの内容など）は、出力しないでください。`;

type Fields = Partial<Record<'company' | 'product' | 'policyNo' | 'holder' | 'periodFrom' | 'periodTo' | 'agencyName' | 'agencyPhone' | 'deskName' | 'deskPhone' | 'deskHours', string>>;

const clean = (v: unknown, max = 60) => (typeof v === 'string' ? v.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const phone = (v: unknown) => {
  const s = clean(v, 20);
  return /^[\d()+\-\s]{6,20}$/.test(s) && /\d{2,}/.test(s) ? s : '';
};
const date = (v: unknown) => {
  const s = clean(v, 12);
  return /^20\d{2}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : '';
};

function sanitizeInsurance(o: Record<string, unknown>): Fields {
  const out: Fields = {};
  const set = (k: keyof Fields, v: string) => {
    if (v) out[k] = v;
  };
  set('company', clean(o.company, 40));
  set('product', clean(o.product, 40));
  const no = clean(o.policyNo, 30).toUpperCase().replace(/\s+/g, '');
  set('policyNo', /^[A-Z0-9-]{5,30}$/.test(no) ? no : '');
  set('holder', clean(o.holder, 60));
  set('periodFrom', date(o.periodFrom));
  set('periodTo', date(o.periodTo));
  set('agencyName', clean(o.agencyName, 60));
  set('agencyPhone', phone(o.agencyPhone));
  set('deskName', clean(o.deskName, 60));
  set('deskPhone', phone(o.deskPhone));
  set('deskHours', clean(o.deskHours, 80));
  // 満期日が始まりより前なら、どちらも当てにならないので捨てる
  if (out.periodFrom && out.periodTo && out.periodTo < out.periodFrom) {
    delete out.periodFrom;
    delete out.periodTo;
  }
  return out;
}

// 使えるか（APIキーが設定されているか）だけを返す
export async function GET(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401 });
  }
  return NextResponse.json({ success: true, configured: Boolean(process.env.ANTHROPIC_API_KEY) });
}

export async function POST(req: NextRequest) {
  if (!isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401 });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ success: false, message: 'AI読み取りは、まだ設定されていません（ANTHROPIC_API_KEY が必要です）。' }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const image: unknown = body?.image;
  const m = typeof image === 'string' ? image.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/) : null;
  if (!m || (image as string).length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ success: false, message: '画像が正しくないか、大きすぎます。' }, { status: 400 });
  }
  const text = typeof body?.text === 'string' ? body.text.slice(0, MAX_TEXT_CHARS) : '';

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
              { type: 'text', text: PROMPT + (text ? `\n\n【PDFから取り出した文字（読み取りの助けに）】\n${text}` : '') },
            ],
          },
        ],
      }),
    });
  } catch {
    return NextResponse.json({ success: false, message: 'AIに接続できませんでした。時間をおいて、もう一度お試しください。' }, { status: 502 });
  }
  if (!res.ok) {
    const status = res.status === 401 ? 'APIキーが正しくないようです。' : res.status === 429 ? '利用回数の上限に達しました。時間をおいて、もう一度お試しください。' : 'AIでの読み取りに失敗しました。';
    return NextResponse.json({ success: false, message: status }, { status: 502 });
  }
  const j = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[] } | null;
  const out = (j?.content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join('');
  const json = out.match(/\{[\s\S]*\}/);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = json ? JSON.parse(json[0]) : {};
  } catch {
    parsed = {};
  }
  return NextResponse.json({ success: true, fields: sanitizeInsurance(parsed) });
}
