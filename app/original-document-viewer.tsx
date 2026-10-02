'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchFullText, type FullTextDocument } from '@/app/lib/patent-document-client';
import { canonicalOriginalId, exactEvidenceExpression, type OriginalTarget } from '@/app/lib/evidence-location';
import { formatAnalysisDate } from '@/app/lib/analysis-provenance';

export function OriginalHighlight({ text, excerpt = '', query = '' }: { text: string; excerpt?: string; query?: string }) {
  const expression = exactEvidenceExpression(text, excerpt) ?? exactEvidenceExpression(text, query);
  if (!expression) return <>{text}</>;
  return <>{text.split(expression).map((part, index) => index % 2 ? <mark key={index} className={excerpt ? 'evidence-highlight' : 'search-highlight'}>{part}</mark> : part)}</>;
}

export default function OriginalDocumentViewer({ applicationNumber, target, claimsOnly = false, fallbackClaims = [], onLoaded }: {
  applicationNumber: string; target?: OriginalTarget | null; claimsOnly?: boolean;
  fallbackClaims?: FullTextDocument['claims']; onLoaded?: (document: FullTextDocument) => void;
}) {
  const [payload, setPayload] = useState<FullTextDocument | null>(null);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(onLoaded);
  useEffect(() => { loadedRef.current = onLoaded; }, [onLoaded]);
  useEffect(() => {
    let cancelled = false;
    window.queueMicrotask(() => { if (!cancelled) { setBusy(true); setError(''); } });
    void fetchFullText(applicationNumber).then((document) => {
      if (cancelled) return;
      setPayload(document); loadedRef.current?.(document); setError('');
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '원문 조회 실패'); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [applicationNumber, retryCount]);
  const abstractIndex = payload && target?.sourceId === 'abstract' && target.excerpt ? payload.abstract.findIndex((paragraph) => exactEvidenceExpression(paragraph.text, target.excerpt)) : -1;
  const canonicalId = payload && target ? abstractIndex >= 0 ? `abstract-${payload.abstract[abstractIndex].number || abstractIndex + 1}` : canonicalOriginalId(target.sourceId, payload) : target?.sourceId || '';
  const entries = useMemo(() => payload ? [
    ...(!claimsOnly ? payload.abstract.map((paragraph, index) => ({ id: `abstract-${paragraph.number || index + 1}`, text: paragraph.text })) : []),
    ...(!claimsOnly ? payload.sections.flatMap((section) => section.paragraphs.map((paragraph, index) => ({ id: paragraph.number ? `paragraph-${paragraph.number}` : `${section.id}-${index}`, text: paragraph.text }))) : []),
    ...payload.claims.map((claim) => ({ id: `claim-${claim.number}`, text: claim.text })),
  ] : [], [payload, claimsOnly]);
  const matched = query.trim() ? entries.filter((entry) => exactEvidenceExpression(entry.text, query)) : [];
  const targetEntry = entries.find((entry) => entry.id === canonicalId);
  const excerptMatched = targetEntry && target?.excerpt ? !!exactEvidenceExpression(targetEntry.text, target.excerpt) : false;
  function navigate(id: string) {
    const element = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-original-id]') ?? []).find((node) => node.dataset.originalId === id);
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    element?.focus({ preventScroll: true });
  }
  useEffect(() => { if (payload && canonicalId) { const frame = requestAnimationFrame(() => navigate(canonicalId)); return () => cancelAnimationFrame(frame); } }, [canonicalId, payload, target?.excerpt, claimsOnly]);
  function moveMatch(direction: number) {
    if (!matched.length) return;
    const next = matchIndex < 0 ? direction > 0 ? 0 : matched.length - 1 : (matchIndex + direction + matched.length) % matched.length;
    setMatchIndex(next); navigate(matched[next].id);
  }
  const paragraph = (id: string, number: string | null, text: string) => <article className={`original-paragraph${id === canonicalId ? ' evidence-target' : ''}`} key={id} data-original-id={id} tabIndex={-1}>
    {number && <strong className="original-paragraph-number">{number}</strong>}<p><OriginalHighlight text={text} excerpt={id === canonicalId ? target?.excerpt : ''} query={query}/></p>
  </article>;
  return <div className="original-document-viewer" ref={rootRef}>
    {busy && <p role="status">전문 원문을 불러오는 중입니다.</p>}
    {error && <div className="inline-warning" role="alert">{error}{fallbackClaims.length > 0 && <p>아래에는 기존 조회 청구항을 표시합니다. 전문 XML과의 일치 여부는 확인되지 않았습니다.</p>}<button type="button" disabled={busy} onClick={() => setRetryCount((count) => count + 1)}>원문 다시 조회</button></div>}
    {target && !busy && <div className={`original-evidence-guide ${targetEntry ? 'located' : 'missing'}`} role="status"><strong>{target.locator}</strong><span>{!targetEntry ? '해당 위치를 찾지 못했습니다. 원문 기준을 확인해 주세요.' : !target.excerpt ? '관련 위치로 이동했습니다. 인용문이 제공되지 않아 문언 강조는 하지 않습니다.' : excerptMatched ? '인용문과 일치하는 부분을 강조했습니다.' : '위치는 찾았으나 인용문이 일치하지 않습니다. 문단 전체를 확인해 주세요.'}</span></div>}
    {payload && <>
      <div className="original-document-meta"><span>{payload.isDemo ? '데모 원문' : payload.cached ? '저장된 XML 원문' : '조회한 XML 원문'}</span><small>원문 조회 {formatAnalysisDate(payload.fetchedAt)}</small>{payload.sourceFileUrl && <a href={payload.sourceFileUrl}>XML 내려받기</a>}</div>
      <div className="original-search"><label>원문 내 검색<input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setMatchIndex(-1); }} placeholder="단어나 문구"/></label><span aria-live="polite">{matchIndex >= 0 && matched.length ? `${matchIndex + 1} / ` : ''}{matched.length}개 위치</span><button type="button" disabled={!matched.length} onClick={() => moveMatch(-1)} aria-label="이전 검색 위치">↑</button><button type="button" disabled={!matched.length} onClick={() => moveMatch(1)} aria-label="다음 검색 위치">↓</button></div>
      {!claimsOnly && <nav className="original-section-nav" aria-label="명세서 영역"><button type="button" onClick={() => navigate(entries.find((entry) => entry.id.startsWith('abstract-'))?.id || '')}>초록</button>{payload.sections.map((section) => <button key={section.id} type="button" onClick={() => navigate(section.paragraphs[0]?.number ? `paragraph-${section.paragraphs[0].number}` : `${section.id}-0`)}>{section.title}</button>)}<button type="button" onClick={() => navigate(`claim-${payload.claims[0]?.number}`)}>청구항</button></nav>}
      {!claimsOnly && <><section><h3>초록</h3>{payload.abstract.map((item, index) => paragraph(`abstract-${item.number || index + 1}`, item.number ? `[${item.number}]` : null, item.text))}</section>{payload.sections.map((section) => <section key={section.id}><h3>{section.title}</h3>{section.paragraphs.map((item, index) => paragraph(item.number ? `paragraph-${item.number}` : `${section.id}-${index}`, item.number ? `[${item.number}]` : null, item.text))}</section>)}</>}
      <section><h3>청구항</h3>{payload.claims.map((claim) => paragraph(`claim-${claim.number}`, `청구항 ${claim.number}`, claim.text))}</section>
    </>}
    {!payload && !busy && fallbackClaims.map((claim) => paragraph(`claim-${claim.number}`, `청구항 ${claim.number} · 서지`, claim.text))}
  </div>;
}
