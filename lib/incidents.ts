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
  otherParty: boolean; // 相手がいる
  canDrive: boolean; // そのまま走れる
  note: string;
  photos: string[];
  status: 'open' | 'done';
  doneAt?: string;
  memo?: string; // 管理者の対応メモ
};

export type IncidentContact = { label: string; phone: string };

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
