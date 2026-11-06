'use client';

import { AppData, Driver, Reservation } from '@/lib/types';
import UsageCalendar from './UsageCalendar';

// 「カレンダー」ページ：車両の使用実績・予約・レンタカーの予約を、月のカレンダーで見る。予約の追加・変更・取消もここ。
export default function CalendarTab({
  data,
  currentDriver,
  onRequestDriverLogin,
  onSaveReservation,
  onDeleteReservation,
}: {
  data: AppData;
  currentDriver?: Driver | null;
  onRequestDriverLogin: () => void;
  onSaveReservation: (r: Reservation) => Promise<unknown>;
  onDeleteReservation: (id: string) => Promise<unknown>;
}) {
  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="card-title" style={{ marginBottom: 4 }}>
          📅 カレンダー
        </h3>
        <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
          日報の使用実績と、車両・レンタカーの予約を、月ごとに確認できます。日付を押すと、その日の使用実績と予約が出ます（予約の追加・変更・取消には、運転者としてのログインが必要です）。
        </div>
      </div>
      <UsageCalendar
        data={data}
        currentDriver={currentDriver}
        onRequestDriverLogin={onRequestDriverLogin}
        onSaveReservation={onSaveReservation}
        onDeleteReservation={onDeleteReservation}
      />
    </div>
  );
}
