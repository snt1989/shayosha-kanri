'use client';

import { Driver, Report } from '@/lib/types';

// 整備依頼を出した運転者へ、整備担当者（整備士・管理者）が連絡するためのボタン。
// 連絡先は運転者台帳に登録した電話番号。登録が無いときは、その旨だけ表示する。
export default function ContactRequester({ report, drivers, show }: { report: Report; drivers: Driver[]; show: boolean }) {
  if (!show) return null;
  const d = drivers.find((x) => x.id === report.driverId);
  const phone = (d?.phone || '').trim();
  const tel = phone.replace(/[^\d+]/g, '');
  if (!tel) {
    return <span className="contact-none">連絡先未登録（運転者台帳で登録できます）</span>;
  }
  const body = encodeURIComponent(
    `${report.driver} さん、整備担当です。${report.date}の整備依頼（${report.vehicleName}・${report.maintRequestType || '整備'}）の件でご連絡しました。`
  );
  return (
    <span className="contact-btns" onClick={(e) => e.stopPropagation()}>
      <a className="btn btn-sm" href={`tel:${tel}`} aria-label={`${report.driver}さんに電話する`}>
        📞 電話（{phone}）
      </a>
      <a className="btn btn-sm" href={`sms:${tel}?&body=${body}`} aria-label={`${report.driver}さんにSMSを送る`}>
        ✉️ SMS
      </a>
    </span>
  );
}
