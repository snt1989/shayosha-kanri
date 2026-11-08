'use client';

import { useRef, useState } from 'react';
import { MAX_PHOTOS } from '@/lib/photo-ids';
import { photoUrl, uploadPhoto } from '@/lib/image';

// 写真を押すと大きく表示する
function Lightbox({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <div className="photo-lightbox" onClick={onClose} role="dialog" aria-label="写真">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl(id)} alt="添付した写真" />
      <button type="button" className="btn btn-sm" onClick={onClose}>
        閉じる
      </button>
    </div>
  );
}

// 一覧用の小さな表示（押すと大きく表示）
export function PhotoThumbs({ ids }: { ids?: string[] }) {
  const [open, setOpen] = useState('');
  if (!ids || ids.length === 0) return null;
  return (
    <>
      <span className="photo-thumbs" onClick={(e) => e.stopPropagation()}>
        {ids.map((id) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={id} src={photoUrl(id)} alt="添付した写真" loading="lazy" onClick={() => setOpen(id)} />
        ))}
      </span>
      {open && <Lightbox id={open} onClose={() => setOpen('')} />}
    </>
  );
}

// 写真を付ける欄。選んだ写真は端末で最軽量に縮めてからすぐ保存し、idを返す。
export default function PhotoField({
  ids,
  onChange,
  label = '写真（任意）',
}: {
  ids: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState('');
  const [added, setAdded] = useState<string[]>([]); // この画面で追加した写真（外したら保存先からも消す）

  async function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError('');
    setBusy(true);
    try {
      const next = [...ids];
      const newly: string[] = [];
      for (const file of Array.from(files)) {
        if (next.length >= MAX_PHOTOS) {
          setError(`写真は${MAX_PHOTOS}枚までです。`);
          break;
        }
        if (!file.type.startsWith('image/')) {
          setError('画像のファイルを選んでください。');
          continue;
        }
        try {
          const id = await uploadPhoto(file);
          next.push(id);
          newly.push(id);
        } catch {
          setError('写真を保存できませんでした。通信を確認して、もう一度お試しください。');
        }
      }
      if (newly.length) {
        setAdded((cur) => [...cur, ...newly]);
        onChange(next);
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function remove(id: string) {
    onChange(ids.filter((x) => x !== id));
    if (added.includes(id)) {
      setAdded((cur) => cur.filter((x) => x !== id));
      fetch(`/api/photos/${id}`, { method: 'DELETE' }).catch(() => {});
    }
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="photo-field">
        {ids.map((id) => (
          <div key={id} className="photo-item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(id)} alt="添付した写真" onClick={() => setOpen(id)} />
            <button type="button" className="photo-remove" aria-label="この写真を外す" onClick={() => remove(id)}>
              ×
            </button>
          </div>
        ))}
        {ids.length < MAX_PHOTOS && (
          <button type="button" className="photo-add" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? '保存中…' : '📷 写真を追加'}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => pick(e.target.files)} />
      <div style={{ fontSize: 12, color: 'var(--slate-500)', marginTop: 4 }}>
        {MAX_PHOTOS}枚まで。通信量を減らすため、写真は自動で小さく（1枚およそ50KB以下）して保存します。
      </div>
      {error && (
        <div role="alert" style={{ fontSize: 12, color: 'var(--red-600, #dc2626)', marginTop: 4 }}>
          {error}
        </div>
      )}
      {open && <Lightbox id={open} onClose={() => setOpen('')} />}
    </div>
  );
}
