'use client';

import { useEffect, useState } from 'react';
import { Report } from '@/lib/types';

// 整備依頼を出した運転者へ、整備担当者（整備士・管理者）が連絡するためのボタン。
// 電話番号は運転者台帳の登録。管理者・整備士以外には送られない（サーバーが /api/drivers/[id]/contact で確認する）。
export default function ContactRequester({ report, mechanic, show }: { report: Report; mechanic: string | null; show: boolean }) {
  const [phone, setPhone] = useState<string | null>(null);
  const did = report.driverId;

  useEffect(() => {
    if (!show || !did) {
      setPhone(null);
      return;
    }
    let off = false;
    fetch(`/api/drivers/${encodeURIComponent(did)}/contact`, {
      cache: 'no-store',
      headers: mechanic ? { 'x-mechanic': encodeURIComponent(mechanic) } : {},
    })
      .then((r) => r.json().catch(() => ({})))
      .then((j) => {
        if (!off) setPhone(j?.success ? String(j.phone || '') : '');
      })
      .catch(() => {
        if (!off) setPhone('');
      });
    return () => {
      off = true;
    };
  }, [show, did, mechanic]);

  if (!show || phone === null) return null;
  const tel = phone.replace(/[^\d+]/g, '');
  if (!tel) return <span className="contact-none">連絡先未登録（運転者台帳で登録できます）</span>;
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
