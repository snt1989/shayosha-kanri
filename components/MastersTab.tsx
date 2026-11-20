'use client';

import { useRef, useState } from 'react';
import { Driver, EmpIdRule, MASTER_KEYS, MASTER_LABELS, MasterKey, Masters } from '@/lib/types';
import EmpIdRuleCard from './EmpIdRuleCard';
import { csvToMasters, downloadCsv, mastersToCsv } from '@/lib/csv';
import { todayStr } from '@/lib/utils';

const ICONS: Record<MasterKey, string> = {
  departments: '🏢',
  checkers: '👤',
  checkMethods: '📞',
  maintTypes: '🔧',
  tireTypes: '🛞',
  licenseTypes: '🪪',
  rentalCompanies: '🏢',
  rentalCarClasses: '🚙',
  mechanics: '🔧',
  fuelTypes: '⛽',
  payMethods: '💳',
  storageLocations: '📍',
};

export default function MastersTab({
  masters,
  empIdRule,
  drivers,
  onSaveEmpIdRule,
  isAdmin,
  adminConfigured,
  onSaveCategory,
  onSaveAll,
  onRequestLogin,
}: {
  masters: Masters;
  empIdRule: EmpIdRule;
  drivers: Driver[];
  onSaveEmpIdRule: (r: EmpIdRule & { assignMissing?: boolean }) => Promise<unknown>;
  isAdmin: boolean;
  adminConfigured: boolean;
  onSaveCategory: (category: MasterKey, items: string[]) => Promise<unknown>;
  onSaveAll: (masters: Masters) => Promise<unknown>;
  onRequestLogin: () => void;
}) {
  const [activeCat, setActiveCat] = useState<MasterKey>('departments');
  const [bulkText, setBulkText] = useState('');
  const [busy, setBusy] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const csvFileRef = useRef<HTMLInputElement>(null);

  if (!isAdmin) {
    return (
      <div className="card">
        <div className="locked-panel">
          <div className="lock-ic">🔒</div>
          <h3>管理者ログインが必要です</h3>
          <p>
            各種マスタ（事業部・確認者・確認方法・整備区分・タイヤ種別・免許種別）の編集は、
            誤操作防止のため管理者のみ行えます。
          </p>
          <button className="btn btn-primary" onClick={onRequestLogin}>
            🔒 管理者ログイン
          </button>
          {!adminConfigured && (
            <p style={{ marginTop: 14, color: 'var(--amber-600)' }}>
              ※ サーバーに ADMIN_PASSWORD が未設定です。Vercelの環境変数を設定してください。
            </p>
          )}
        </div>
      </div>
    );
  }

  const items = masters[activeCat];

  async function persist(list: string[]) {
    setBusy(true);
    try {
      await onSaveCategory(activeCat, list);
    } catch {
      // 401等はFleetApp側でログアウト状態への復帰・通知まで処理済みなので、ここでは何もしない
    } finally {
      setBusy(false);
    }
  }

  async function bulkAdd() {
    const lines = bulkText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    const merged = [...items];
    lines.forEach((line) => {
      if (!merged.includes(line)) merged.push(line);
    });
    await persist(merged);
    setBulkText('');
  }

  async function removeAt(idx: number) {
    const list = [...items];
    list.splice(idx, 1);
    await persist(list);
  }

  async function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const list = [...items];
    [list[idx], list[target]] = [list[target], list[idx]];
    await persist(list);
  }

  async function sortAlpha() {
    const list = [...items].sort((a, b) => a.localeCompare(b, 'ja'));
    await persist(list);
  }

  function exportAllCsv() {
    downloadCsv(`マスタ設定_${todayStr()}.csv`, mastersToCsv(masters));
  }

  function triggerCsvImport() {
    csvFileRef.current?.click();
  }

  function handleCsvFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || '');
      const imported = csvToMasters(text);
      const totalCount = MASTER_KEYS.reduce((sum, k) => sum + imported[k].length, 0);
      if (totalCount === 0) {
        alert('CSVから有効なデータを読み取れませんでした。「カテゴリキー,カテゴリ名,登録名称」の形式で出力したCSVをご利用ください。');
        return;
      }
      if (!confirm(`CSVから読み取った${totalCount}件で全マスタ（全カテゴリ）を上書きします。よろしいですか？`)) return;
      setBusy(true);
      try {
        await onSaveAll(imported);
      } catch {
        // 401等はFleetApp側で処理済み
      } finally {
        setBusy(false);
      }
    };
    reader.readAsText(file, 'utf-8');
    if (csvFileRef.current) csvFileRef.current.value = '';
  }

  function startEdit(idx: number) {
    setEditIdx(idx);
    setEditVal(items[idx]);
  }

  async function saveEdit() {
    if (editIdx === null) return;
    const val = editVal.trim();
    if (!val) return;
    const list = [...items];
    list[editIdx] = val;
    await persist(list);
    setEditIdx(null);
  }

  return (
    <div>
    <EmpIdRuleCard rule={empIdRule} drivers={drivers} onSave={onSaveEmpIdRule} />
    <div className="card">
      <div className="toolbar2" style={{ marginBottom: 4, alignItems: 'flex-start' }}>
        <div>
          <h3 className="card-title" style={{ marginBottom: 4 }}>
            ⚙️ 各種プルダウン・マスタ一括管理
          </h3>
          <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
            事業部、点呼確認者、確認方法、点検区分などの選択肢を自由に設定・編集できます。
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-sm" onClick={triggerCsvImport} disabled={busy}>
            ⬆ 全マスタCSV取込
          </button>
          <button className="btn btn-sm" onClick={exportAllCsv}>
            ⬇ 全マスタCSV出力
          </button>
          <input ref={csvFileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => handleCsvFile(e.target.files?.[0] || null)} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--slate-400)', marginBottom: 16 }}>
        CSV出力は全カテゴリを1つのファイルにまとめます（カテゴリキー・カテゴリ名・登録名称の3列）。取込時は同じ形式のCSVで全カテゴリを一括上書きします。
      </div>

      <div className="subtabbar">
        {MASTER_KEYS.map((k) => (
          <button
            key={k}
            className={`subtab ${activeCat === k ? 'active' : ''}`}
            onClick={() => {
              setActiveCat(k);
              setEditIdx(null);
              setBulkText('');
            }}
          >
            <span>{ICONS[k]}</span>
            {MASTER_LABELS[k]}
          </button>
        ))}
      </div>

      <div className="masters-layout">
        <div className="bulk-paste">
          <div className="section-heading" style={{ marginTop: 0 }}>
            まとめて一括登録（Excelコピペ可）
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--slate-500)', marginTop: -4, marginBottom: 8 }}>
            Excelの列からコピーして貼り付けてください（改行区切り）。
          </p>
          <textarea
            placeholder="改行区切りで貼り付け…"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            spellCheck={false}
          />
          <button className="btn btn-primary btn-block" style={{ marginTop: 10, background: 'var(--green-600)', borderColor: 'var(--green-600)' }} onClick={bulkAdd} disabled={busy || !bulkText.trim()}>
            一括追加して保存
          </button>
        </div>

        <div>
          <div className="toolbar2" style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>登録済み一覧</div>
            <button className="btn btn-sm" onClick={sortAlpha} disabled={busy || items.length < 2}>
              🔤 五十音順に整列
            </button>
          </div>
          {items.length === 0 ? (
            <div className="empty-state">未登録です</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table reorder-table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>登録名称</th>
                    <th>並び順</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((v, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td className="name-cell">
                        {editIdx === idx ? (
                          <input
                            value={editVal}
                            autoFocus
                            onChange={(e) => setEditVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit();
                              if (e.key === 'Escape') setEditIdx(null);
                            }}
                            style={{ padding: '5px 8px', border: '1px solid var(--slate-300)', borderRadius: 6, fontSize: 12.5 }}
                          />
                        ) : (
                          v
                        )}
                      </td>
                      <td>
                        <span className="reorder-btns">
                          <button onClick={() => move(idx, -1)} disabled={idx === 0 || busy}>
                            ↑
                          </button>
                          <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1 || busy}>
                            ↓
                          </button>
                        </span>
                      </td>
                      <td>
                        {editIdx === idx ? (
                          <>
                            <button className="btn btn-sm btn-primary" onClick={saveEdit}>
                              保存
                            </button>{' '}
                            <button className="btn btn-sm" onClick={() => setEditIdx(null)}>
                              キャンセル
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-sm" onClick={() => startEdit(idx)}>
                              変更
                            </button>{' '}
                            <button className="btn btn-sm btn-danger" onClick={() => removeAt(idx)} disabled={busy}>
                              削除
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
