// アラートを「いつから出すか」の設定（管理者が設定画面で変える）。本体データとは別のキーに保存する。
export type AlertSettings = {
  shakenDays: number; // 車検満了日の何日前から出すか
  licenseDays: number; // 免許の更新期日の何日前から出すか
  oilKm: number; // オイル交換の目安まで、残り何kmから出すか
};

export const ALERT_SETTINGS_KEY = 'fleet:alert-settings:v1';
export const DEFAULT_ALERT_SETTINGS: AlertSettings = { shakenDays: 30, licenseDays: 30, oilKm: 1000 };

export const ALERT_LIMITS = {
  shakenDays: { min: 1, max: 365 },
  licenseDays: { min: 1, max: 365 },
  oilKm: { min: 100, max: 20000 },
} as const;

const pick = (v: unknown, def: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
};

// 保存済みの値（または画面から届いた値）を、範囲内の整数にそろえる。おかしな値は初期値に戻す。
export function normalizeAlertSettings(raw: unknown): AlertSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const L = ALERT_LIMITS;
  return {
    shakenDays: pick(r.shakenDays, DEFAULT_ALERT_SETTINGS.shakenDays, L.shakenDays.min, L.shakenDays.max),
    licenseDays: pick(r.licenseDays, DEFAULT_ALERT_SETTINGS.licenseDays, L.licenseDays.min, L.licenseDays.max),
    oilKm: pick(r.oilKm, DEFAULT_ALERT_SETTINGS.oilKm, L.oilKm.min, L.oilKm.max),
  };
}
