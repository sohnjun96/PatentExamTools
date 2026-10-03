'use client';
import { useRef, useState } from 'react';
import { classifyAmendmentDocument, type ExaminationRound, type HistoryLike, type RoundDocumentLink } from '@/app/lib/examination-model';
import { caseHistoryKey } from '@/app/lib/analysis-provenance';
export default function RoundLinkEditor({ round, history, verifiedNumbers, onSave }: {
  round: ExaminationRound; history: HistoryLike[]; verifiedNumbers: string[]; onSave: (link: RoundDocumentLink) => Promise<void>;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [selected, setSelected] = useState({
    opinionNumbers: round.opinions.map((item) => item.documentNumber),
    amendmentNumbers: round.amendments.map((item) => item.documentNumber),
    decisionNumbers: round.decisions.map((item) => item.documentNumber),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const groups = [
    { key: 'opinionNumbers' as const, label: '의견서', items: history.filter((item) => /의견서|답변서|소명서/.test(item.title)) },
    { key: 'amendmentNumbers' as const, label: '청구항 보정서', items: history.filter((item) => classifyAmendmentDocument(item) === 'claims' || (classifyAmendmentDocument(item) === 'unknown' && verifiedNumbers.includes(item.documentNumber))) },
    { key: 'decisionNumbers' as const, label: '후속 결정', items: history.filter((item) => /거절결정|특허결정|등록결정|심결|결정서/.test(item.title)) },
  ];
  return <details className="round-link-editor" ref={detailsRef}><summary>{round.connectionStatus === 'linked' ? '문서 연결 수정' : '문서 연결 확인'}</summary>
    <p>{round.number}차 통지에 대응하는 문서를 선택하세요. 절차 보완 문서는 청구항 보정에서 제외됩니다.</p>
    {groups.map((group) => <fieldset key={group.key}><legend>{group.label}</legend>{group.items.length ? group.items.map((item) => <label key={item.documentNumber}><input type="checkbox" checked={selected[group.key].includes(item.documentNumber)} onChange={(event) => setSelected((current) => ({ ...current, [group.key]: event.target.checked ? [...current[group.key], item.documentNumber] : current[group.key].filter((number) => number !== item.documentNumber) }))}/><span><strong>{item.title}</strong><small>{item.date} · {item.documentNumber}</small></span></label>) : <small>선택할 문서 없음</small>}</fieldset>)}
    {error && <p className="inline-warning" role="alert">{error}</p>}
    <button className="exam-primary" type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { await onSave({ noticeNumber: round.notice.documentNumber, ...selected, historyKey: caseHistoryKey(history) }); if (detailsRef.current) detailsRef.current.open = false; }
      catch (reason) { setError(reason instanceof Error ? reason.message : '문서 연결을 저장하지 못했습니다.'); }
      finally { setBusy(false); }
    }}>{busy ? '저장 중…' : '선택한 연결 저장'}</button>
  </details>;
}
