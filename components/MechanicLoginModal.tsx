'use client';

import Modal from './Modal';

// 整備士としてのログイン。各種マスタ設定の「整備士」に登録した名前から選ぶ（パスワードは不要）。
export default function MechanicLoginModal({
  mechanics,
  onClose,
  onSelect,
  notice,
}: {
  mechanics: string[];
  onClose: () => void;
  onSelect: (name: string) => void;
  notice?: string | null;
}) {
  return (
    <Modal title="🔧 整備士としてログイン" onClose={onClose} footer={<button className="btn" onClick={onClose}>キャンセル</button>}>
      {notice && (
        <div className="alert-item warn" style={{ marginBottom: 12 }} role="alert">
          <span>🔒</span>
          <div style={{ flex: 1 }}>{notice}</div>
        </div>
      )}
      <p style={{ fontSize: 12.5, color: 'var(--slate-600)', marginTop: 0 }}>
        自分の名前を選んでください。パスワードは不要です。ログインすると、整備台帳の記録の追加・修正・削除と、整備依頼への対応ができます。記録には整備士の名前が残ります。
      </p>
      {mechanics.length === 0 ? (
        <div className="empty-state">
          整備士が登録されていません。管理者ログイン後、「設定」→「各種マスタ設定」→「整備士」に名前を登録してください。
        </div>
      ) : (
        <div className="alert-list">
          {mechanics.map((m) => (
            <div key={m} className="alert-item" style={{ background: 'var(--slate-50)', borderColor: 'var(--slate-200)', color: 'var(--slate-800)' }}>
              <span>🔧</span>
              <div style={{ flex: 1 }}>
                <strong>{m}</strong>
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => onSelect(m)}>
                この名前でログイン
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
