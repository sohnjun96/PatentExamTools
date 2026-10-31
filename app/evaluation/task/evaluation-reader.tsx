'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import AppIcon from '@/app/components/app-icon';
import { caseMethods, caseStatus, isOperationStageOpen, literatureDetailsFor, OVERALL_COMMENT_MAX_LENGTH, rankingComplete, rankingIsCurrent, resultFor, validEvaluation, type DocumentEvaluation, type EvaluationAction, type EvaluationCase, type EvaluationState, type OperationMonth, type RankValue } from '@/app/lib/evaluation';
import { rankOptionsFor, rankingGuidance } from '@/app/lib/evaluation-guidance';
import { literatureLink } from '@/app/lib/literature-link';
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
  const [view, setView] = useState<'documents' | 'results'>(() => caseStatus(state, item).complete ? 'results' : 'documents');
  const [ended, setEnded] = useState(() => caseStatus(state, item).complete);
  const [rankAttention, setRankAttention] = useState(false);
  const [dockHeight, setDockHeight] = useState(88);
  const [contentTop, setContentTop] = useState(236);
  const dock = useRef<HTMLElement>(null);
  const layout = useRef<HTMLDivElement>(null);
  const resultsTitle = useRef<HTMLHeadingElement>(null);
  const saving = useRef(false);
  const finalizing = useRef(false);
  const versions = useRef(Object.fromEntries(ai.map(method => [method.id, resultFor(state, item.id, method.id)?.publishedVersion || 0])));
  const phaseLocked = !isOperationStageOpen(month, 'evaluation');
  const disabled = busy || pending || phaseLocked || ended;
  const ordered = ai.flatMap(method => (documents[method.id] || []).map((document, position) => ({ methodId: method.id, index: position, document })));
  const selected = documents[methodId]?.[index];
  const detail = literatureDetailsFor(resultFor(state, item.id, methodId)).find(entry => selected && identity(entry.number) === identity(selected.number));
  const selectedPosition = ordered.findIndex(entry => entry.methodId === methodId && entry.index === index);
  const completed = ordered.filter(({ document }) => document.score !== null && document.cited !== null).length;
  const documentsReady = ordered.length > 0 && completed === ordered.length;
  const rankable = methods.map(method => ({ id: method.id, available: method.kind === 'baseline' ? ai.length > 0 : Boolean(versions.current[method.id]) }));
  const ranksReady = rankingComplete(state, item, ranks);
  const rankCount = rankable.filter(method => method.available && ranks[method.id] != null).length;
  const rankTotal = rankable.filter(method => method.available).length;
  const rankTitleId = `tw-rank-title-${item.id}`;
  useEffect(() => {
    const element = dock.current;
    if (!element) return;
    const measure = () => {
      setDockHeight(Math.ceil(element.getBoundingClientRect().height));
      setContentTop(Math.max(0, Math.ceil(layout.current?.getBoundingClientRect().top || 0)));
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    window.addEventListener('scroll', measure, { passive: true }); window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [view]);
  useEffect(() => { if (view === 'results') resultsTitle.current?.focus(); else layout.current?.focus(); }, [view]);
  function mark() { dirty(true); setSaved(false); }
  function chooseRank(id: string, value: Exclude<RankValue, null>) {
    if (disabled || saving.current) return;
    setRanks(previous => {
      const option = rankOptionsFor(id, rankable, previous).find(entry => entry.value === value);
      const occupied = typeof value === 'number' ? rankable.find(method => method.id !== id && method.available && previous[method.id] === value) : undefined;
      if (!option || option.disabled && !occupied) return previous;
      const next = { ...previous, [id]: value };
      if (occupied) next[occupied.id] = typeof previous[id] === 'number' || previous[id] === 'unranked' ? previous[id] : null;
      return next;
    });
    mark();
  }
  function update(patch: Partial<DocumentEvaluation>) {
    if (disabled || saving.current) return;
    setDocuments(previous => ({ ...previous, [methodId]: previous[methodId].map((document, position) => position === index ? { ...document, ...patch } : document) })); mark();
  }
  function showResults() {
    if (documentsReady && !busy && !pending && !saving.current) setView('results');
  }
  function editEvaluation() {
    if (busy || pending || saving.current || phaseLocked) return;
    setEnded(false); setSaved(false); setView('documents');
  }
  async function submit(finalize = false) {
    if (disabled || saving.current) return;
    if (finalize && (view !== 'results' || !documentsReady || !ranksReady)) { setRankAttention(true); return; }
    saving.current = true; finalizing.current = finalize; setPending(true); setSaved(false);
    try {
      const ok = await save({ type: 'saveEvaluation', caseId: item.id, evaluations: ai.filter(method => versions.current[method.id] > 0).map(method => ({ methodId: method.id, version: versions.current[method.id], documents: documents[method.id] || [] })), rankings: ranks, versions: versions.current, overallComment: comment, finalize });
      if (ok) { dirty(false); setSaved(true); if (finalize) setEnded(true); }
    } finally { saving.current = false; finalizing.current = false; setPending(false); }
  }
  return <div className="tw-review" style={{ '--tw-evaluation-footer-height': `${dockHeight}px`, '--tw-review-content-top': `${contentTop}px` } as CSSProperties}>
    {caseStatus(state, item).stale && <div className="ev-notice warning tw-feedback">평가 후 AI 검색 결과 또는 선행기술조사 보고서 유무가 변경되었습니다. 바뀐 문헌과 품질 순위를 다시 확인해 주세요.</div>}
    {view === 'documents' ? <>
    <div className="tw-methods"><nav aria-label="납품된 AI 검색결과">{ai.map(method => <button type="button" key={method.id} aria-pressed={methodId === method.id} disabled={pending} onClick={() => { setMethodId(method.id); setIndex(0); }}>{method.name}<span>{documents[method.id]?.length || 0}문헌</span></button>)}</nav></div>
    {ordered.length ? <div className="tw-review-layout" ref={layout} tabIndex={-1} aria-label="AI 검색 문헌 평가">
      <aside className="tw-docnav" aria-label="평가할 검색 문헌"><h2>{ai.find(method => method.id === methodId)?.name} 검색 문헌</h2><ol>{(documents[methodId] || []).map((document, position) => {
        const entry = literatureDetailsFor(resultFor(state, item.id, methodId))[position];
        const done = document.score !== null && document.cited !== null;
        return <li key={document.number}><button type="button" className="tw-doc-choice" aria-pressed={index === position} disabled={pending} onClick={() => setIndex(position)}><small>{String(position + 1).padStart(2, '0')} · {entry?.kind === 'non-patent' ? '비특허' : entry?.kind === 'patent' ? '특허' : '문헌'}<span className={done ? 'is-done' : ''}>{done ? '평가됨' : '미평가'}</span></small><strong>{entry?.kind === 'non-patent' ? entry.title || document.number : document.number}</strong>{entry?.authors && <span>{entry.authors}</span>}</button></li>;
      })}</ol></aside>
      <LiteratureReader document={detail || (selected ? { kind: 'legacy', number: selected.number } : undefined)} />
      {selected && <aside className="tw-inspector" aria-label="선택한 문헌 평가 입력"><h2>이 문헌 평가</h2>
        <div className="tw-inspector-field"><div className="tw-field-heading">문헌 점수 <span>{selected.score === null ? '미선택' : `${selected.score}점`}</span></div><div className="tw-score" role="group" aria-label="문헌 점수">{[0, 1, 2, 3, 4, 5].map(score => <button type="button" key={score} aria-pressed={selected.score === score} disabled={disabled} onClick={() => update({ score })}>{score}</button>)}</div><p className="tw-help">3점: 평균적인 선행기술조사 보고서 수준</p></div>
        <div className="tw-inspector-field"><div className="tw-field-heading">인용 여부 <span>{selected.cited || '미선택'}</span></div><div className="tw-cited" role="group" aria-label="인용 여부">{(['O', 'X'] as const).map(cited => <button type="button" key={cited} aria-pressed={selected.cited === cited} disabled={disabled} onClick={() => update({ cited })}>{cited === 'O' ? '인용 O' : '미인용 X'}</button>)}</div></div>
        <label className="tw-inspector-field">문헌별 피드백(선택)<textarea aria-label="문헌별 피드백(선택)" value={selected.note} maxLength={4000} rows={5} disabled={disabled} onChange={event => update({ note: event.target.value })} /></label>
        <button type="button" className="ev-button tw-next" disabled={pending || selectedPosition < 0 || selectedPosition === ordered.length - 1} onClick={() => { const next = ordered[selectedPosition + 1]; if (next) { setMethodId(next.methodId); setIndex(next.index); } }}>다음 문헌<AppIcon name="arrow-right" /></button>
      </aside>}
    </div> : <div className="tw-empty">공개된 AI 검색 결과를 기다리고 있습니다.</div>}
    </> : <main className="tw-evaluation-results">
      <div className="tw-results-heading"><h2 ref={resultsTitle} tabIndex={-1}>문헌 평가 결과</h2><button type="button" className="ev-button" disabled={busy || pending} onClick={() => setView('documents')}><AppIcon name="arrow-left" />문헌 평가로 돌아가기</button></div>
      {ended && <p className="tw-completed-notice" role="status">평가가 종료되었습니다.</p>}
      <div className="ev-table-scroll tw-results-table-scroll" role="region" aria-label="문헌 평가 결과 표" tabIndex={0}><table className="ev-table tw-results-table">
        <caption className="sr-only">{item.applicationNumber} AI 검색 문헌 평가 결과</caption>
        <colgroup><col className="tw-result-ai-column" /><col className="tw-result-kind-column" /><col /><col className="tw-result-score-column" /><col className="tw-result-cited-column" /></colgroup>
        <thead><tr><th scope="col">AI 종류</th><th scope="col">특허 여부</th><th scope="col">인용문헌 명</th><th scope="col">문헌 점수</th><th scope="col">인용 여부</th></tr></thead>
        <tbody>{ordered.map(row => {
          const entry = literatureDetailsFor(resultFor(state, item.id, row.methodId)).find(document => identity(document.number) === identity(row.document.number));
          const kind = entry?.kind === 'patent' || entry?.kind === 'legacy' && literatureLink(entry.number).kind === 'patent' ? '특허' : entry?.kind === 'non-patent' || entry?.kind === 'legacy' && literatureLink(entry.number).kind === 'paper' ? '비특허' : '미확인';
          const name = entry?.kind === 'non-patent' ? entry.title || row.document.number : row.document.number;
          return <tr key={`${row.methodId}:${row.document.number}`}><td>{ai.find(method => method.id === row.methodId)?.name}</td><td>{kind}</td><td className="tw-result-citation"><button type="button" className="tw-result-document" disabled={busy || pending} aria-label={`${ai.find(method => method.id === row.methodId)?.name} ${name} 문헌 평가 보기`} onClick={() => { setMethodId(row.methodId); setIndex(row.index); setView('documents'); }}>{name}</button></td><td>{row.document.score ?? '미선택'}</td><td>{row.document.cited ?? '미선택'}</td></tr>;
        })}</tbody>
      </table></div>
      <section className="tw-rank-section" aria-labelledby={rankTitleId}>
      <div className="tw-rank-dock-head"><h2 id={rankTitleId}><strong>{item.applicationNumber}</strong> 건에 대한 조사 방식별 검색 품질 순위</h2><span className={`tw-rank-progress${ranksReady ? '' : ' is-incomplete'}`} role="status">순위 선택 {rankCount}/{rankTotal}<strong>{ranksReady ? '선택 완료' : '미완료 · 확인 필요'}</strong></span></div>
      <div className="tw-rank-grid">{methods.map(method => {
        const options = rankOptionsFor(method.id, rankable, ranks);
        const available = Boolean(rankable.find(entry => entry.id === method.id)?.available);
        const invalid = Boolean(options.find(option => option.value === ranks[method.id])?.disabled);
        const missing = available && (ranks[method.id] == null || invalid);
        return <div key={method.id} className={`tw-rank-row${missing ? ' is-missing' : ''}`}><div className="tw-rank-row-title"><h3>{method.kind === 'baseline' && !method.name.includes('보고서') ? `${method.name} 보고서` : method.name}</h3>{missing && <small>{invalid ? '다시 선택' : '선택 필요'}</small>}</div><div className="tw-rank-buttons" role="group" aria-label={`${method.name} 품질 순위`} aria-invalid={invalid || rankAttention && missing}>{options.map(option => {
          const occupied = typeof option.value === 'number' && rankable.some(entry => entry.id !== method.id && entry.available && ranks[entry.id] === option.value);
          return <button type="button" key={String(option.value)} className={option.value === 'excluded' ? 'tw-rank-excluded' : undefined} aria-pressed={ranks[method.id] === option.value} aria-label={`${method.name} ${typeof option.value === 'number' ? `${option.value}위` : option.label}`} title={occupied ? '선택하면 두 방식의 순위를 바꿉니다.' : option.disabled ? option.label : undefined} disabled={disabled || !available || Boolean(option.disabled && !occupied)} onClick={() => chooseRank(method.id, option.value)}>{typeof option.value === 'number' ? option.value : option.label}</button>;
        })}</div></div>;
      })}</div>
      <p className={`tw-rank-help${rankAttention && !ranksReady ? ' is-warning' : ''}`} role={rankAttention && !ranksReady ? 'status' : undefined}>{rankAttention && !ranksReady ? '검색 품질 순위를 모두 선택해 주세요. ' : ''}{rankingGuidance(rankable, ranks)[0]}</p>
      </section>
      <section className="tw-case-feedback"><h2><label htmlFor={`tw-comment-${item.id}`}><strong>{item.applicationNumber}</strong> 건 관련 피드백(선택)</label></h2><textarea id={`tw-comment-${item.id}`} aria-label={`${item.applicationNumber} 건 관련 피드백(선택)`} rows={2} maxLength={OVERALL_COMMENT_MAX_LENGTH} value={comment} disabled={disabled} onChange={event => { if (!disabled && !saving.current) { setComment(event.target.value); mark(); } }} /></section>
    </main>}
    <footer className="tw-footer tw-evaluation-footer" ref={dock}>
      <div className="tw-evaluation-progress" role="status">{view === 'documents' ? <><div>검색 문헌 평가 <strong>{completed}/{ordered.length}</strong>{documentsReady && <span>모든 문헌 평가 완료</span>}</div><progress aria-label="검색 문헌 평가 진행 상황" max={Math.max(1, ordered.length)} value={completed} /></> : <div>{ended ? '최종 평가 완료' : ranksReady ? '평가를 종료할 수 있습니다.' : <a href={`#${rankTitleId}`}>검색 품질 순위를 선택해 주세요.</a>}</div>}</div>
      <div className="ev-actions">
        {ended ? !phaseLocked && <button type="button" className="ev-button" disabled={busy || pending} onClick={editEvaluation}>평가 수정</button> : <button type="button" className="ev-button" disabled={disabled} onClick={() => void submit(false)}>{pending && !finalizing.current ? '저장 중…' : saved ? '임시저장됨' : '임시저장'}</button>}
        {view === 'documents' ? documentsReady && <button type="button" className="ev-button primary" disabled={busy || pending} onClick={showResults}>평가 결과 보기<AppIcon name="arrow-right" /></button> : <button type="button" className="ev-button primary" disabled={disabled || !documentsReady || !ranksReady} onClick={() => void submit(true)}>{pending && finalizing.current ? '평가 종료 중…' : ended ? '평가 종료됨' : '평가 종료'}<AppIcon name="clipboard-list" /></button>}
      </div>
    </footer>
  </div>;
}
