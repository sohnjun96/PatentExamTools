'use client';

import { useRef, useState } from 'react';
import AppIcon from '@/app/components/app-icon';
import { caseMethods, caseStatus, isOperationStageOpen, literatureDetailsFor, OVERALL_COMMENT_MAX_LENGTH, rankingIsCurrent, resultFor, validEvaluation, type DocumentEvaluation, type EvaluationAction, type EvaluationCase, type EvaluationState, type OperationMonth, type RankValue } from '@/app/lib/evaluation';
import { rankOptionsFor, rankingGuidance } from '@/app/lib/evaluation-guidance';
import LiteratureReader from './literature-reader';

type Props = { state: EvaluationState; month: OperationMonth; item: EvaluationCase; busy: boolean; dirty: (value: boolean) => void; save: (action: EvaluationAction) => Promise<boolean> };
const identity = (value: string) => value.replace(/[\s\-.,]/g, '').toUpperCase();
export default function EvaluationReader({ state, month, item, busy, dirty, save }: Props) {
  const methods = caseMethods(state, item);
  const ai = methods.filter(method => method.kind === 'ai');
  const [documents, setDocuments] = useState<Record<string, DocumentEvaluation[]>>(() => Object.fromEntries(ai.map(method => {
    const current = validEvaluation(state, item.id, method.id);
    return [method.id, (resultFor(state, item.id, method.id)?.publishedDocuments || []).map(number => current?.documents.find(entry => identity(entry.number) === identity(number)) || { number, score: null, cited: null, note: '' })];
  })));
  const [ranks, setRanks] = useState<Record<string, RankValue>>(() => {
    const current = state.rankings.find(entry => entry.caseId === item.id);
    return rankingIsCurrent(state, item, current) ? { ...current!.values } : {};
  });
  const [comment, setComment] = useState(() => state.rankings.find(entry => entry.caseId === item.id)?.overallComment || '');
  const [methodId, setMethodId] = useState(ai[0]?.id || '');
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const saving = useRef(false);
  const versions = useRef(Object.fromEntries(ai.map(method => [method.id, resultFor(state, item.id, method.id)?.publishedVersion || 0])));
  const disabled = busy || pending || !isOperationStageOpen(month, 'evaluation');
  const ordered = ai.flatMap(method => (documents[method.id] || []).map((document, position) => ({ methodId: method.id, index: position, document })));
  const selected = documents[methodId]?.[index];
  const detail = literatureDetailsFor(resultFor(state, item.id, methodId)).find(entry => selected && identity(entry.number) === identity(selected.number));
  const selectedPosition = ordered.findIndex(entry => entry.methodId === methodId && entry.index === index);
  const completed = ordered.filter(({ document }) => document.score !== null && document.cited !== null).length;
  const rankable = methods.map(method => ({ id: method.id, available: method.kind === 'baseline' ? ai.length > 0 : Boolean(versions.current[method.id]) }));
  function mark() { dirty(true); setSaved(false); }
  function update(patch: Partial<DocumentEvaluation>) {
    if (disabled || saving.current) return;
    setDocuments(previous => ({ ...previous, [methodId]: previous[methodId].map((document, position) => position === index ? { ...document, ...patch } : document) })); mark();
  }
  async function submit() {
    if (disabled || saving.current) return;
    saving.current = true; setPending(true); setSaved(false);
    try {
      const ok = await save({ type: 'saveEvaluation', caseId: item.id, evaluations: ai.filter(method => versions.current[method.id] > 0).map(method => ({ methodId: method.id, version: versions.current[method.id], documents: documents[method.id] || [] })), rankings: ranks, versions: versions.current, overallComment: comment });
      if (ok) { dirty(false); setSaved(true); }
    } finally { saving.current = false; setPending(false); }
  }
  return <div className="tw-review">
    {caseStatus(state, item).stale && <div className="ev-notice warning tw-feedback">평가 후 AI 검색 결과가 변경되었습니다. 바뀐 문헌과 품질 순위를 다시 확인해 주세요.</div>}
    <div className="tw-methods"><nav aria-label="납품된 AI 검색결과">{ai.map(method => <button type="button" key={method.id} aria-pressed={methodId === method.id} disabled={pending} onClick={() => { setMethodId(method.id); setIndex(0); }}>{method.name}<span>{documents[method.id]?.length || 0}문헌</span></button>)}</nav><span className="tw-progress" aria-live="polite">문헌 평가 <strong>{completed}/{ordered.length}</strong></span></div>
    {ordered.length ? <div className="tw-review-layout">
      <aside className="tw-docnav" aria-label="평가할 검색 문헌"><h2>{ai.find(method => method.id === methodId)?.name} 검색 문헌</h2><ol>{(documents[methodId] || []).map((document, position) => {
        const entry = literatureDetailsFor(resultFor(state, item.id, methodId))[position];
        const done = document.score !== null && document.cited !== null;
        return <li key={document.number}><button type="button" className="tw-doc-choice" aria-pressed={index === position} disabled={pending} onClick={() => setIndex(position)}><small>{String(position + 1).padStart(2, '0')} · {entry?.kind === 'non-patent' ? '비특허' : entry?.kind === 'patent' ? '특허' : '문헌'}<span className={done ? 'is-done' : ''}>{done ? '평가됨' : '미평가'}</span></small><strong>{entry?.kind === 'non-patent' ? entry.title || document.number : document.number}</strong>{entry?.authors && <span>{entry.authors}</span>}</button></li>;
      })}</ol></aside>
      <LiteratureReader document={detail || (selected ? { kind: 'legacy', number: selected.number } : undefined)} />
      {selected && <aside className="tw-inspector" aria-label="선택한 문헌 평가 입력"><h2>이 문헌 평가</h2>
        <div className="tw-inspector-field"><div className="tw-field-heading">문헌 점수 <span>{selected.score === null ? '미선택' : `${selected.score}점`}</span></div><div className="tw-score" role="group" aria-label="문헌 점수">{[0, 1, 2, 3, 4, 5].map(score => <button type="button" key={score} aria-pressed={selected.score === score} disabled={disabled} onClick={() => update({ score })}>{score}</button>)}</div><p className="tw-help">3점: 평균적인 선행기술조사 보고서 수준</p><button type="button" className="tw-clear" disabled={disabled} onClick={() => update({ score: null })}>미선택으로 변경</button></div>
        <div className="tw-inspector-field"><div className="tw-field-heading">인용 여부 <span>{selected.cited || '미선택'}</span></div><div className="tw-cited" role="group" aria-label="인용 여부">{(['O', 'X'] as const).map(cited => <button type="button" key={cited} aria-pressed={selected.cited === cited} disabled={disabled} onClick={() => update({ cited })}>{cited === 'O' ? '인용 O' : '미인용 X'}</button>)}</div><button type="button" className="tw-clear" disabled={disabled} onClick={() => update({ cited: null })}>미선택으로 변경</button></div>
        <label className="tw-inspector-field">문헌별 비고 <textarea aria-label="선택한 문헌 비고" value={selected.note} maxLength={4000} rows={5} disabled={disabled} placeholder="선택 입력" onChange={event => update({ note: event.target.value })} /></label>
        <button type="button" className="ev-button tw-next" disabled={pending || selectedPosition < 0 || selectedPosition === ordered.length - 1} onClick={() => { const next = ordered[selectedPosition + 1]; if (next) { setMethodId(next.methodId); setIndex(next.index); } }}>다음 문헌<AppIcon name="arrow-right" /></button>
      </aside>}
    </div> : <div className="tw-empty">공개된 AI 검색 결과를 기다리고 있습니다.</div>}
    <div className="tw-review-summary"><section><h2>조사 방식별 품질 순위</h2><div className="tw-rankings">{methods.map(method => {
      const options = rankOptionsFor(method.id, rankable, ranks);
      return <label key={method.id}>{method.kind === 'baseline' && !method.name.includes('보고서') ? `${method.name} 보고서` : method.name}<select aria-label={`${method.name} 품질 순위`} value={ranks[method.id] ?? ''} disabled={disabled || !rankable.find(entry => entry.id === method.id)?.available} aria-invalid={Boolean(options.find(option => option.value === ranks[method.id])?.disabled)} onChange={event => { if (disabled) return; const value = event.target.value; setRanks(previous => ({ ...previous, [method.id]: value === '' ? null : /^[123]$/.test(value) ? Number(value) as 1 | 2 | 3 : value as RankValue })); mark(); }}><option value="">미선택</option>{options.map(option => <option key={String(option.value)} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select></label>;
    })}</div><ul className="tw-help">{rankingGuidance(rankable, ranks).map(line => <li key={line}>{line}</li>)}</ul></section><section><h2><label htmlFor={`tw-comment-${item.id}`}>총평</label></h2><textarea id={`tw-comment-${item.id}`} aria-label="총평" rows={6} maxLength={OVERALL_COMMENT_MAX_LENGTH} value={comment} disabled={disabled} placeholder="AI 검색 결과와 선행기술조사 보고서를 비교한 의견을 작성하세요. (선택)" onChange={event => { if (!disabled) { setComment(event.target.value); mark(); } }} /></section></div>
    <footer className="tw-footer"><button type="button" className="ev-button primary" disabled={disabled} onClick={() => void submit()}>{pending || busy ? '저장 중…' : saved ? '저장됨' : '평가 저장'}<AppIcon name="clipboard-list" /></button></footer>
  </div>;
}
