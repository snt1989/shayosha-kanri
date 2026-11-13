// 事故・トラブルの報告と、緊急連絡先。本体データとは別のキーに保存する。
export const INCIDENTS_KEY = 'fleet:incidents:v1';
export const INCIDENT_CONTACTS_KEY = 'fleet:incident-contacts:v1';
export const INCIDENTS_MAX = 200;

export const INCIDENT_KINDS = ['事故（人・物・他の車）', '故障・パンクなどのトラブル', '交通違反・その他'] as const;
export const INCIDENT_INJURY = ['けが人なし', 'けが人あり', 'わからない'] as const;

export type Incident = {
  id: string;
  at: string; // 報告した日時（ISO）
  kind: string;
  driverId?: string;
  driver: string;
  vehicleId?: string;
  vehicleName: string;
  plate: string;
  place: string; // 場所（入力した文字、または現在地の地図リンク）
  lat?: number;
  lng?: number;
  injury: string;
  police: boolean; // 警察に連絡した
  insurer?: boolean; // 保険会社（三井住友海上）に連絡した
  otherParty: boolean; // 相手がいる
  canDrive: boolean; // そのまま走れる
  note: string;
  photos: string[];
  status: 'open' | 'done';
  doneAt?: string;
  memo?: string; // 管理者の対応メモ
};

export type IncidentContact = { label: string; phone: string };

// 加入している保険（三井住友海上）の事故受付。管理者が緊急連絡先を一度も保存していないときの初期値として出す
// （電話番号は三井住友海上の「事故のご連絡」ページ https://www.ms-ins.com/contractor/emergency/ による。変わったら設定画面で直せる）
export const INSURER_NAME = '三井住友海上';
export const INSURER_WEB_URL = 'https://www.ms-ins.com/contractor/emergency/';
export const DEFAULT_INCIDENT_CONTACTS: IncidentContact[] = [
  { label: '三井住友海上 自動車保険 事故受付', phone: '0120-258-365' },
  { label: '三井住友海上 ロードサービス', phone: '0120-096-991' },
  { label: '取扱代理店 保険ビルド岩手（金沢）', phone: '019-601-2320' },
];

export const normalizePhone = (s: string) => s.replace(/[^\d+]/g, '');

export function cleanContacts(raw: unknown): IncidentContact[] {
  if (!Array.isArray(raw)) return [];
  const out: IncidentContact[] = [];
  for (const x of raw) {
    const label = String((x as IncidentContact)?.label ?? '').trim().slice(0, 30);
    const phone = String((x as IncidentContact)?.phone ?? '').trim().slice(0, 30);
    if (label && normalizePhone(phone).length >= 3) out.push({ label, phone });
    if (out.length >= 10) break;
  }
  return out;
}
