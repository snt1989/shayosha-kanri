import { requestTypeState } from '@/lib/utils';

// 整備依頼の項目の表示。項目が複数あって、一部が終わっているときは、終わったものに「✓済」を付ける。
export default function ReqTypes({ r }: { r: { maintRequestType?: string; maintRequestDoneTypes?: string[] } }) {
  const st = requestTypeState(r);
  if (st.all.length === 0) return <>整備</>;
  if (st.done.length === 0) return <>{st.all.join('、')}</>;
  return (
    <span className="req-types">
      {st.all.map((t) =>
        st.done.includes(t) ? (
          <span key={t} className="req-type done">
            ✓ {t}（済）
          </span>
        ) : (
          <span key={t} className="req-type left">
            {t}
          </span>
        )
      )}
      <span className="pill pill-amber">残り {st.left.length}項目</span>
    </span>
  );
}
