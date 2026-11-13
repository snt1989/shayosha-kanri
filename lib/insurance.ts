// 加入している自動車保険の情報（事故のときに、証券番号などを伝えられるよう、🚨の画面に出す）。
// 本体データとは別のキーに保存する。管理者が一度も保存していないときは、初期値（三井住友海上の満期のお知らせの記載）を返す。
export const INSURANCE_KEY = 'fleet:insurance:v1';

export type Insurance = {
  company: string; // 保険会社
  product: string; // 保険の種類
  policyNo: string; // 証券番号
  holder: string; // 保険契約者
  periodFrom: string; // 保険期間の始まり（YYYY-MM-DD）
  periodTo: string; // 満期日（YYYY-MM-DD）
  agencyName: string; // 取扱代理店
  agencyPhone: string;
  deskName: string; // 保険会社のお客さまデスク
  deskPhone: string;
  deskHours: string;
  note: string;
};

export const DEFAULT_INSURANCE: Insurance = {
  company: '三井住友海上',
  product: '自動車保険',
  policyNo: 'NC18720385',
  holder: '株式会社三桜',
  periodFrom: '2025-05-19',
  periodTo: '2026-05-19',
  agencyName: '保険ビルド岩手（金沢）',
  agencyPhone: '019-601-2320',
  deskName: '三井住友海上 お客さまデスク',
  deskPhone: '0120-988-777',
  deskHours: '平日 9:00〜18:00、土日祝 9:00〜17:00（年末年始は休業）',
  note: '',
};

const str = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : '');

export function cleanInsurance(raw: unknown): Insurance {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    company: str(b.company, 40),
    product: str(b.product, 40),
    policyNo: str(b.policyNo, 40),
    holder: str(b.holder, 60),
    periodFrom: day(b.periodFrom),
    periodTo: day(b.periodTo),
    agencyName: str(b.agencyName, 60),
    agencyPhone: str(b.agencyPhone, 30),
    deskName: str(b.deskName, 60),
    deskPhone: str(b.deskPhone, 30),
    deskHours: str(b.deskHours, 80),
    note: str(b.note, 300),
  };
}
