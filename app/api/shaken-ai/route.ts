import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminCookieValid } from '@/lib/admin';
import { loadData } from '@/lib/store';
import { isAdminOrMechanic } from '@/lib/mechanic-auth';

async function allowed(req: NextRequest) {
  if (isAdminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value)) return true;
  const data = await loadData();
  return isAdminOrMechanic(req, data.masters.mechanics);
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 車検証・検査証記録事項の写真を、AI（Claude）に読み取らせる。管理者のみ。
// APIキー（ANTHROPIC_API_KEY）が未設定のときは、使えないことを返す（画面側はOCRだけを出す）。
// 写真は社外（Anthropic）へ送られる。所有者・使用者の氏名や住所は、取り出さない指示にしている。
const MODEL = process.env.SHAKEN_AI_MODEL || 'claude-sonnet-5-5';
const MAX_IMAGE_CHARS = 3_500_000; // data URL の長さ（Vercelのリクエスト上限 約4.5MB に収める）

const PROMPT = `これは日本の「自動車検査証（車検証）」または「自動車検査証記録事項」の画像です。次の項目を読み取り、JSONだけを出力してください（説明文やコードブロックは付けない）。読み取れない項目は空文字にしてください。推測で埋めないでください。
{
 "plate": "自動車登録番号または車両番号。例: 盛岡 580 た 89-96",
 "modelType": "型式（原動機の型式ではない）。例: DBA-MK32S",
 "shakenDate": "有効期間の満了する日。西暦 YYYY-MM-DD",
 "carName": "車名（メーカー名）。例: スズキ",
 "chassisNo": "車台番号。例: MK32S-123456",
 "firstRegistered": "初度登録年月。西暦 YYYY-MM",
 "capacity": "乗車定員。例: 4人",
 "grossWeight": "車両総重量。例: 1,070kg",
 "displacement": "総排気量又は定格出力。例: 0.66L",
 "fuelType": "燃料の種類。例: ガソリン"
}
和暦は西暦に直してください（令和元年=2019年、平成元年=1989年）。所有者・使用者の氏名や住所など、上の項目以外は出力しないでください。`;

type Fields = {
  plate?: string;
  modelType?: string;
  shakenDate?: string;
  carName?: string;
  chassisNo?: string;
  firstRegistered?: string;
  capacity?: string;
  grossWeight?: string;
  displacement?: string;
  fuelType?: string;
};

const clean = (v: unknown, max = 40) => (typeof v === 'string' ? v.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, max) : '');

function sanitize(o: Record<string, unknown>): Fields {
  const out: Fields = {};
  const plate = clean(o.plate, 30);
  if (plate) out.plate = plate;
  const model = clean(o.modelType, 20).toUpperCase();
  if (/^[A-Z0-9][A-Z0-9-]{2,18}$/.test(model)) out.modelType = model;
  const date = clean(o.shakenDate, 12);
  if (/^20\d{2}-\d{2}-\d{2}$/.test(date)) out.shakenDate = date;
  const name = clean(o.carName, 20);
  if (name) out.carName = name;
  const chassis = clean(o.chassisNo, 24).toUpperCase().replace(/\s+/g, '');
  if (/^[A-Z0-9-]{4,24}$/.test(chassis)) out.chassisNo = chassis;
  const first = clean(o.firstRegistered, 8);
  if (/^(19|20)\d{2}-\d{2}$/.test(first)) out.firstRegistered = first;
  const cap = clean(o.capacity, 8);
  if (/^\d{1,2}人?$/.test(cap)) out.capacity = cap.endsWith('人') ? cap : `${cap}人`;
  const gw = clean(o.grossWeight, 12);
  if (/^[\d,]{3,7} ?kg$/i.test(gw)) out.grossWeight = gw.replace(/ /g, '');
  const disp = clean(o.displacement, 12);
  if (/^\d+(\.\d+)? ?(L|cc|CC|ℓ)?$/.test(disp)) out.displacement = disp.replace(/ /g, '').replace('ℓ', 'L');
  const fuel = clean(o.fuelType, 10);
  if (fuel) out.fuelType = fuel;
  return out;
}

// 使えるか（APIキーが設定されているか）だけを返す
export async function GET(req: NextRequest) {
  if (!(await allowed(req))) {
    return NextResponse.json({ success: false, error: 'admin only' }, { status: 401 });
  }
  return NextResponse.json({ success: true, configured: Boolean(process.env.ANTHROPIC_API_KEY) });
}

export async function POST(req: NextRequest) {
  if (!(await allowed(req))) {
    return NextResponse.json({ success: false, message: '管理者か整備士のログインが必要です。' }, { status: 401 });
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

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    });
  } catch {
    return NextResponse.json({ success: false, message: 'AIに接続できませんでした。時間をおいて、もう一度お試しください。' }, { status: 502 });
  }
  if (!res.ok) {
    // APIキーの誤りなど。キーの値は出さない
    const status = res.status === 401 ? 'APIキーが正しくないようです。' : res.status === 429 ? '利用回数の上限に達しました。時間をおいてお試しください。' : `AIの読み取りに失敗しました（${res.status}）。`;
    return NextResponse.json({ success: false, message: status }, { status: 502 });
  }
  const j = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[] } | null;
  const text = (j?.content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join('');
  const json = text.match(/\{[\s\S]*\}/);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = json ? JSON.parse(json[0]) : {};
  } catch {
    parsed = {};
  }
  return NextResponse.json({ success: true, fields: sanitize(parsed) });
}
