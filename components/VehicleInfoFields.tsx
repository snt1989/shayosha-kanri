'use client';

import { ETC_KINDS, type BatteryInfo, type EtcInfo, type TireInfo, type Vehicle } from '@/lib/types';
import { TIRE_DOT_RE, batteryAge, etcExpiry, dotText, normalizeDot, normalizeTireSize, tireBadge, tireSetsOf } from '@/lib/utils';

// 車両のタイヤ・バッテリーの入力欄。車両台帳の編集画面と、整備記録の登録画面の両方で使う。
const TIRE_SIZES = ['145/80R12 80/78N', '155/65R14', '165/65R14', '165/70R14', '175/65R15', '185/65R15', '195/65R15', '195/60R16', '205/60R16', '195/80R15 107/105N', '195/70R15 106/104N', '215/60R17', '225/65R17', '205/55R16'];
const TIRE_MAKERS = ['ブリヂストン', 'ヨコハマ', 'ダンロップ', 'トーヨー', 'ミシュラン', 'グッドイヤー', 'ピレリ', 'ファルケン', 'コンチネンタル', 'ハンコック', 'クムホ', 'ナンカン'];
const TIRE_MODELS = ['ECOPIA NH200', 'NEWNO', 'BLIZZAK VRX3', 'BLIZZAK VL10', 'BluEarth-GT AE51', 'iceGUARD 7', 'ENASAVE EC204', 'WINTER MAXX 03', 'NANOENERGY 3 PLUS', 'OBSERVE GIZ2', 'ENERGY SAVER 4', 'X-ICE SNOW'];
const BATTERY_MAKERS = ['GSユアサ', 'パナソニック', '古河電池', 'エナジーウィズ', 'ボッシュ', 'ACデルコ', 'アトラス', '純正'];

type TireDraft = Pick<Vehicle, 'tire' | 'tireSummer' | 'tireWinter' | 'tireMaker' | 'tireYear'>;

// 保存の前に、タイヤの入力を整える。DOT を入れたら、旧の「製造年」は消す（DOT のほうが正確）。DOT の形が正しくなければ ok:false
export function cleanTires(v: TireDraft): { ok: boolean; tireSummer: TireInfo; tireWinter: TireInfo } {
  const sets = tireSetsOf(v);
  const clean = (t: TireInfo): TireInfo => {
    const dot = normalizeDot(t.dot);
    return { maker: (t.maker || '').trim().slice(0, 30), model: (t.model || '').trim().slice(0, 40), size: normalizeTireSize(t.size), dot, year: dot ? '' : (t.year || '').trim() };
  };
  const tireSummer = clean(sets.summer);
  const tireWinter = clean(sets.winter);
  const ok = !((tireSummer.dot && !TIRE_DOT_RE.test(tireSummer.dot)) || (tireWinter.dot && !TIRE_DOT_RE.test(tireWinter.dot)));
  return { ok, tireSummer, tireWinter };
}
export const TIRE_DOT_MESSAGE = 'タイヤのDOTは、タイヤ側面の「DOT」の最後の4桁（週2桁＋年2桁。例：2324）で入れてください。週は01〜53です。';

export function TireFields({ v, tireTypes, onChange }: { v: TireDraft; tireTypes: string[]; onChange: (patch: Partial<Vehicle>) => void }) {
  const sets = tireSetsOf(v);
  return (
    <>
      <div className="field">
        <label>いま履いているタイヤ</label>
        <div className="tire-pick" role="group" aria-label="いま履いているタイヤ">
          {(tireTypes.includes(v.tire) || !v.tire ? tireTypes : [v.tire, ...tireTypes]).map((t) => {
            const b = tireBadge(t);
            const on = v.tire === t;
            return (
              <button key={t} type="button" className={`tire-pick-btn ${b.kind} ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange({ tire: t })}>
                <span className="tire-pick-ic" aria-hidden>
                  {b.icon}
                </span>
                <span>{t}</span>
                {on && <span className="tire-pick-now">装着中</span>}
              </button>
            );
          })}
        </div>
      </div>
      {(['summer', 'winter'] as const).map((k) => {
        const key = k === 'summer' ? 'tireSummer' : 'tireWinter';
        const cur = sets[k];
        const set = (patch: TireInfo) => onChange({ tireMaker: undefined, tireYear: undefined, tireSummer: sets.summer, tireWinter: sets.winter, [key]: { ...cur, ...patch } });
        const dotOk = cur.dot ? TIRE_DOT_RE.test(normalizeDot(cur.dot)) : true;
        return (
          <div className={`tire-set ${k}`} key={k}>
            <div className="tire-set-title">
              {k === 'summer' ? '☀️ 夏タイヤ' : '❄️ 冬タイヤ（スタッドレス）'}
              <span>（すべて任意）</span>
            </div>
            <div className="tire-grid">
              <div className="field">
                <label>メーカー</label>
                <input list="tire-makers" value={cur.maker || ''} maxLength={30} placeholder="ブリヂストン" onChange={(e) => set({ maker: e.target.value })} />
              </div>
              <div className="field">
                <label>品番（商品名）</label>
                <input list="tire-models" value={cur.model || ''} maxLength={40} placeholder={k === 'summer' ? 'ECOPIA NH200' : 'BLIZZAK VRX3'} onChange={(e) => set({ model: e.target.value })} />
              </div>
              <div className="field">
                <label>サイズ</label>
                <input list="tire-sizes" value={cur.size || ''} maxLength={24} placeholder="195/65R15 91H" onChange={(e) => set({ size: e.target.value })} />
              </div>
              <div className="field">
                <label>DOT（製造年週・4桁）</label>
                <input
                  value={cur.dot || ''}
                  maxLength={8}
                  inputMode="numeric"
                  placeholder="2324"
                  onChange={(e) => set({ dot: e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^0-9]/g, '') })}
                />
              </div>
              <div className="tire-dot-note" style={{ gridColumn: '1 / -1', ...(dotOk ? {} : { color: 'var(--amber-600)' }) }}>
                {cur.dot
                  ? dotOk
                    ? `→ ${dotText(normalizeDot(cur.dot))}`
                    : '週2桁＋年2桁で入れてください（例：2324）'
                  : cur.year
                    ? `いまの記録：${cur.year.replace('-', '年')}${cur.year.includes('-') ? '月' : '年'}製（DOTを入れると置き換わります）`
                    : 'DOTの例：2324 ＝ 2024年の23週'}
              </div>
            </div>
          </div>
        );
      })}
      <datalist id="tire-sizes">
        {TIRE_SIZES.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id="tire-makers">
        {TIRE_MAKERS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id="tire-models">
        {TIRE_MODELS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <div style={{ fontSize: 11, color: 'var(--slate-500)', margin: '-4px 0 12px' }}>「いま履いているタイヤ」は、いま付けているほうです。品番は、タイヤ側面に書いてある商品名です。DOTは、「DOT」刻印の最後の4桁です。</div>
    </>
  );
}

// fill：整備記録の画面から使うとき、「この整備の日付・走行を入れる」ボタンで入れる値
export function BatteryFields({ battery, onChange, fill }: { battery: BatteryInfo | undefined; onChange: (b: BatteryInfo) => void; fill?: { date: string; km: number } }) {
  const bat = battery || {};
  const set = (patch: BatteryInfo) => onChange({ ...bat, ...patch });
  const age = batteryAge(bat.replacedAt);
  return (
    <>
      <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 10 }}>すべて任意です。形式は、バッテリーの上面のラベルにあります（例：40B19L、Q-85）。</div>
      <div className="field-row row2">
        <div className="field">
          <label>メーカー</label>
          <input list="battery-makers" value={bat.maker || ''} maxLength={30} placeholder="GSユアサ" onChange={(e) => set({ maker: e.target.value })} />
        </div>
        <div className="field">
          <label>形式</label>
          <input value={bat.model || ''} maxLength={30} placeholder="40B19L" onChange={(e) => set({ model: e.target.value })} />
        </div>
      </div>
      {fill && (
        <button type="button" className="btn btn-sm" style={{ marginBottom: 10 }} onClick={() => set({ replacedAt: fill.date, replacedKm: fill.km || undefined })}>
          ⤵ この整備の日付・走行kmを「交換した日」に入れる
        </button>
      )}
      <div className="field-row row2">
        <div className="field">
          <label>交換した日</label>
          <input type="date" value={bat.replacedAt || ''} onChange={(e) => set({ replacedAt: e.target.value })} />
        </div>
        <div className="field">
          <label>交換したときの走行（km）</label>
          <input type="number" inputMode="numeric" placeholder="0" value={bat.replacedKm || ''} onChange={(e) => set({ replacedKm: Number(e.target.value) })} />
        </div>
      </div>
      {age && (
        <div className={`notice-box${age.level === 'ok' ? ' notice-ok' : ''}`} style={{ marginBottom: 12 }}>
          交換から {age.text} たっています。
          {age.level === 'due' ? '3年をこえています。交換の目安です。' : age.level === 'warn' ? '2年をこえています。そろそろ点検・交換を考える時期です。' : ''}
        </div>
      )}
      <div className="field">
        <label>メモ</label>
        <input value={bat.note || ''} maxLength={200} placeholder="例：アイドリングストップ車用。保証3年" onChange={(e) => set({ note: e.target.value })} />
      </div>
      <datalist id="battery-makers">
        {BATTERY_MAKERS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </>
  );
}

export function EtcFields({ etc, onChange }: { etc: EtcInfo | undefined; onChange: (e: EtcInfo) => void }) {
  const e = etc || {};
  const set = (patch: EtcInfo) => onChange({ ...e, ...patch });
  const exp = etcExpiry(e.cardExpiry);
  const none = e.kind === 'none';
  return (
    <>
      <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 10 }}>すべて任意です。ETCカードの番号は、全桁を入れないでください（カードの名前や、下4桁などの目印だけにします）。</div>
      <div className="field">
        <label>ETCの車載器</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ETC_KINDS.map((k) => (
            <button key={k.key} type="button" className={`btn btn-sm ${e.kind === k.key ? 'btn-primary' : ''}`} aria-pressed={e.kind === k.key} onClick={() => set({ kind: e.kind === k.key ? undefined : k.key })}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      {!none && (
        <>
          <div className="field-row row2">
            <div className="field">
              <label>車載器のメーカー</label>
              <input value={e.maker || ''} maxLength={30} placeholder="パナソニック" onChange={(ev) => set({ maker: ev.target.value })} />
            </div>
            <div className="field">
              <label>車載器の型式</label>
              <input value={e.model || ''} maxLength={30} placeholder="CY-ET2020" onChange={(ev) => set({ model: ev.target.value })} />
            </div>
          </div>
          <div className="field-row row2">
            <div className="field">
              <label>車載器の管理番号</label>
              <input value={e.unitNo || ''} maxLength={30} placeholder="00002-00079518-000920" onChange={(ev) => set({ unitNo: ev.target.value })} />
            </div>
            <div className="field">
              <label>型式登録番号</label>
              <input value={e.typeNo || ''} maxLength={20} placeholder="0500" onChange={(ev) => set({ typeNo: ev.target.value })} />
            </div>
          </div>
          <div className="field-row row2">
            <div className="field">
              <label>セットアップ（取り付け）した日</label>
              <input type="date" value={e.installedAt || ''} onChange={(ev) => set({ installedAt: ev.target.value })} />
            </div>
            <div className="field">
              <label>取扱店</label>
              <input value={e.dealer || ''} maxLength={40} placeholder="スーパーオートバックス盛岡" onChange={(ev) => set({ dealer: ev.target.value })} />
            </div>
          </div>
          <div className="field-row row2">
            <div className="field">
              <label>ETCカード（名前・下4桁など）</label>
              <input value={e.cardLabel || ''} maxLength={30} placeholder="ETC 3号車用 / 1234" onChange={(ev) => set({ cardLabel: ev.target.value })} />
            </div>
            <div className="field">
              <label>カードの有効期限（年月）</label>
              <input type="month" value={e.cardExpiry || ''} onChange={(ev) => set({ cardExpiry: ev.target.value })} />
            </div>
          </div>
          {exp && exp.level !== 'ok' && (
            <div className="notice-box" style={{ marginBottom: 12 }}>
              ETCカードの有効期限は、{exp.level === 'due' ? '切れています。' : `${exp.text}です。`}
            </div>
          )}
        </>
      )}
      <div className="field">
        <label>メモ</label>
        <input value={e.note || ''} maxLength={200} placeholder="例：セットアップ済み。カードは運転席のケース" onChange={(ev) => set({ note: ev.target.value })} />
      </div>
    </>
  );
}
