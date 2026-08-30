'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { analyzeClaims } from '@/app/lib/examination-model';

type FullTextParagraph = {
  number: string | null;
  text: string;
};

type FullTextSection = {
  id: string;
  title: string;
  paragraphs: FullTextParagraph[];
};

type FullTextClaim = {
  number: number;
  text: string;
  referenceNumbers?: number[];
  multipleDependent?: boolean;
};

type FullTextPayload = {
  applicationNumber: string;
  title: string;
  abstract: FullTextParagraph[];
  sections: FullTextSection[];
  claims: FullTextClaim[];
  figureCount: number;
  sourceFileName: string;
  isDemo: boolean;
  fetchedAt?: string | null;
};

function numberKey(value: string | null | undefined) {
  const numeric = (value ?? '').replace(/\D/g, '');
  return numeric ? String(Number(numeric)) : '';
}

function canonicalEvidenceTarget(id: string, payload: FullTextPayload) {
  const paragraphMatch = id.match(/^paragraph-(.+)$/u);
  if (paragraphMatch) {
    const key = numberKey(paragraphMatch[1]);
    const paragraph = payload.sections
      .flatMap((section) => section.paragraphs)
      .find((item) => numberKey(item.number) === key);
    return paragraph?.number ? `paragraph-${paragraph.number}` : id;
  }

  const abstractMatch = id.match(/^abstract-(.+)$/u);
  if (abstractMatch) {
    const key = numberKey(abstractMatch[1]);
    const paragraph = payload.abstract.find((item) => numberKey(item.number) === key);
    return paragraph?.number ? `abstract-${paragraph.number}` : id;
  }
  return id;
}

function formatApplicationNumber(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 13
    ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
    : value;
}

function isIndependentClaim(claim: FullTextClaim) {
  return analyzeClaims([claim])[0]?.isIndependent ?? true;
}

function splitTitle(value: string) {
  const englishMatch = value.match(/\{([^}]+)\}\s*$/);
  return {
    korean: value.replace(/\s*\{[^}]+\}\s*$/, '').trim(),
    english: englishMatch?.[1]?.trim() ?? '',
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchingExpression(text: string, value: string, flexibleWhitespace = false) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  const tokens = normalized.split(' ').filter(Boolean);
  const candidateTokens = [tokens];
  for (const length of [16, 12, 8, 5]) {
    if (tokens.length > length) candidateTokens.push(tokens.slice(0, length));
  }

  for (const candidate of candidateTokens) {
    const source = candidate.map(escapeRegExp).join(flexibleWhitespace ? '\\s+' : ' ');
    const expression = new RegExp(`(${source})`, 'giu');
    if (expression.test(text)) return new RegExp(`(${source})`, 'giu');
  }
  return null;
}

function Highlight({
  text,
  query,
  evidence,
}: {
  text: string;
  query: string;
  evidence?: string;
}) {
  const evidenceExpression = matchingExpression(text, evidence ?? '', true);
  const expression = evidenceExpression ?? matchingExpression(text, query);
  if (!expression) return text;

  return text.split(expression).map((part, index) =>
    index % 2 === 1 ? (
      <mark className={evidenceExpression ? 'evidence-highlight' : 'search-highlight'} key={`${part}-${index}`}>{part}</mark>
    ) : (
      <Fragment key={`${part}-${index}`}>{part}</Fragment>
    ),
  );
}

export default function FullTextViewer({
  initialApplicationNumber,
}: {
  initialApplicationNumber: string;
}) {
  const applicationNumber = /^(10|20)\d{11}$/.test(initialApplicationNumber)
    ? initialApplicationNumber
    : '1020200093844';
  const [payload, setPayload] = useState<FullTextPayload | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [claimMode, setClaimMode] = useState<'all' | 'independent'>('all');
  const [evidenceExcerpt, setEvidenceExcerpt] = useState('');
  const [evidenceTargetId, setEvidenceTargetId] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `/api/patent/fulltext?applicationNumber=${encodeURIComponent(applicationNumber)}`,
          { signal: controller.signal },
        );
        const result = (await response.json()) as FullTextPayload & { error?: string };
        if (!response.ok) throw new Error(result.error || '전문파일을 불러오지 못했습니다.');
        setPayload(result);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(
          caught instanceof Error ? caught.message : '전문파일을 불러오지 못했습니다.',
        );
      }
    }
    load();
    return () => controller.abort();
  }, [applicationNumber]);

  useEffect(() => {
    if (!payload) return;
    const syncEvidenceLocation = () => {
      const id = window.location.hash
        ? decodeURIComponent(window.location.hash.slice(1))
        : '';
      setEvidenceTargetId(canonicalEvidenceTarget(id, payload));
      setEvidenceExcerpt(new URLSearchParams(window.location.search).get('evidence') ?? '');
    };
    syncEvidenceLocation();
    window.addEventListener('hashchange', syncEvidenceLocation);
    return () => window.removeEventListener('hashchange', syncEvidenceLocation);
  }, [payload]);

  useEffect(() => {
    if (!payload || !evidenceTargetId) return;
    window.requestAnimationFrame(() => {
      const target = document.getElementById(evidenceTargetId);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.focus({ preventScroll: true });
    });
  }, [evidenceTargetId, payload]);

  const visibleClaims = useMemo(() => {
    if (!payload) return [];
    const analyzedClaims = analyzeClaims(payload.claims);
    return claimMode === 'independent'
      ? analyzedClaims.filter((claim) => claim.isIndependent)
      : analyzedClaims;
  }, [claimMode, payload]);

  const matchCount = useMemo(() => {
    if (!payload || !query.trim()) return 0;
    const needle = query.trim().toLocaleLowerCase('ko-KR');
    const texts = [
      ...payload.abstract.map((paragraph) => paragraph.text),
      ...payload.sections.flatMap((section) =>
        section.paragraphs.map((paragraph) => paragraph.text),
      ),
      ...payload.claims.map((claim) => claim.text),
    ];
    return texts.filter((value) => value.toLocaleLowerCase('ko-KR').includes(needle))
      .length;
  }, [payload, query]);

  const totalParagraphs = payload
    ? payload.abstract.length +
      payload.sections.reduce((sum, section) => sum + section.paragraphs.length, 0)
    : 0;
  const title = splitTitle(payload?.title || '전문 명세서');
  const formattedNumber = formatApplicationNumber(applicationNumber);
  const evidenceClassName = (id: string) => evidenceTargetId === id ? 'evidence-target' : undefined;

  function clearEvidenceHighlight() {
    setEvidenceExcerpt('');
    setEvidenceTargetId('');
    const url = new URL(window.location.href);
    url.searchParams.delete('evidence');
    url.hash = '';
    window.history.replaceState(null, '', url);
  }

  return (
    <>
      <a className="skip-link" href="#fulltext-main">본문 바로가기</a>
      <div className="krds-masthead">
        <div><span className="krds-flag" aria-hidden="true" />대한민국 디지털 정부 디자인 시스템(KRDS)을 참고한 특허심사 지원 도구입니다.</div>
      </div>
      <header className="fulltext-site-header">
        <div className="fulltext-site-header-inner">
          <Link className="service-identity" href="/">
            <span className="service-mark" aria-hidden="true">특허</span>
            <span><strong>특허심사 지원서비스</strong><small>KIPRIS Plus 연계 · 심사데스크</small></span>
          </Link>
          <nav aria-label="주요 메뉴">
            <Link href={`/?applicationNumber=${applicationNumber}`}>사건 대시보드</Link>
            <Link className="active" href={`/fulltext?applicationNumber=${applicationNumber}`} aria-current="page">전문 명세서</Link>
          </nav>
        </div>
      </header>

      <main id="fulltext-main" className="fulltext-main" tabIndex={-1}>
        <nav className="breadcrumb fulltext-breadcrumb" aria-label="현재 위치">
          <Link href="/">홈</Link><span>›</span><Link href={`/?applicationNumber=${applicationNumber}`}>심사 사건</Link><span>›</span><strong>전문 명세서</strong>
        </nav>

        {error ? (
          <section className="fulltext-error" role="alert">
            <span>전문파일정보</span>
            <h1>전문을 표시할 수 없습니다</h1>
            <p>{error}</p>
            <Link className="krds-button primary" href="/">사건 대시보드로 돌아가기</Link>
          </section>
        ) : !payload ? (
          <section className="fulltext-loading" role="status" aria-live="polite">
            <div className="loader-ring" />
            <strong>전문 XML을 읽고 있습니다</strong>
            <span>명세서의 장·문단과 전체 청구항을 구성하는 중입니다.</span>
          </section>
        ) : (
          <>
            <section className="fulltext-hero">
              <div className="fulltext-hero-copy">
                <div className="fulltext-badges">
                  <span className="krds-tag primary">전문파일정보</span>
                  <span className="krds-tag neutral">{payload.isDemo ? '샘플 사건' : 'KIPRIS Plus 실시간'}</span>
                </div>
                <p className="fulltext-number">출원번호 {formattedNumber}</p>
                <h1>{title.korean}</h1>
                {title.english && <p className="fulltext-english-title">{title.english}</p>}
                <dl className="fulltext-stats">
                  <div><dt>명세서 문단</dt><dd>{totalParagraphs}개</dd></div>
                  <div><dt>청구항</dt><dd>{payload.claims.length}개</dd></div>
                  <div><dt>도면</dt><dd>{payload.figureCount}개</dd></div>
                  <div><dt>원문 파일</dt><dd>{payload.sourceFileName}</dd></div>
                </dl>
              </div>
              <div className="fulltext-actions">
                <Link className="krds-button secondary" href={`/?applicationNumber=${applicationNumber}`}>사건 개요</Link>
                <button className="krds-button primary" type="button" onClick={() => window.print()}>인쇄·PDF 저장</button>
              </div>
            </section>

            <section className="fulltext-toolbar" aria-label="전문 내 검색">
              <label htmlFor="fulltext-search">전문 내 검색</label>
              <div>
                <input id="fulltext-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="구성요소, 도면부호, 용어 검색" />
                <span aria-live="polite">{query.trim() ? `${matchCount}개 문단에서 일치` : '명세서와 청구항 전체 검색'}</span>
              </div>
            </section>

            {evidenceTargetId && (
              <aside className="fulltext-evidence-guide" role="status">
                <div><strong>AI 요약 근거</strong><span>원문에서 연결된 근거 구절을 파란색으로 강조했습니다.</span></div>
                <button type="button" onClick={clearEvidenceHighlight}>강조 지우기</button>
              </aside>
            )}

            <div className="fulltext-layout">
              <aside className="fulltext-toc" aria-label="페이지 내부 목차">
                <strong>페이지 목차</strong>
                <a href="#abstract">초록</a>
                {payload.sections.map((section) => (
                  <a key={section.id} href={`#${section.id}`}>{section.title}<span>{section.paragraphs.length}</span></a>
                ))}
                <a href="#claims">청구범위<span>{payload.claims.length}</span></a>
                <div className="fulltext-source-note"><strong>데이터 출처</strong><p>KIPRIS Plus 전문파일정보 XML을 읽기 화면으로 가공했습니다.</p></div>
              </aside>

              <article className="fulltext-document">
                <section id="abstract" className="fulltext-section abstract-section" tabIndex={evidenceTargetId === 'abstract' ? -1 : undefined}>
                  <header><span>01</span><div><p>ABSTRACT</p><h2>초록</h2></div></header>
                  <div className="fulltext-prose">
                    {payload.abstract.map((paragraph, index) => {
                      const paragraphId = paragraph.number ? `abstract-${paragraph.number}` : '';
                      const isEvidenceTarget = evidenceTargetId === 'abstract' || evidenceTargetId === paragraphId;
                      return <p className={isEvidenceTarget ? 'evidence-target' : undefined} id={paragraphId || undefined} key={paragraph.number ?? index} tabIndex={evidenceTargetId === paragraphId ? -1 : undefined}><Highlight text={paragraph.text} query={query} evidence={isEvidenceTarget ? evidenceExcerpt : ''} /></p>;
                    })}
                  </div>
                </section>

                {payload.sections.map((section, sectionIndex) => (
                  <section id={section.id} className="fulltext-section" key={section.id}>
                    <header><span>{String(sectionIndex + 2).padStart(2, '0')}</span><div><p>DESCRIPTION</p><h2>{section.title}</h2></div></header>
                    <div className="fulltext-prose numbered">
                      {section.paragraphs.map((paragraph, index) => {
                        const paragraphId = paragraph.number ? `paragraph-${paragraph.number}` : `${section.id}-paragraph-${index}`;
                        return <p className={evidenceClassName(paragraphId)} id={paragraphId} key={paragraph.number ?? index} tabIndex={evidenceTargetId === paragraphId ? -1 : undefined}><span>{paragraph.number ? `[${paragraph.number}]` : ''}</span><span><Highlight text={paragraph.text} query={query} evidence={evidenceTargetId === paragraphId ? evidenceExcerpt : ''} /></span></p>;
                      })}
                    </div>
                  </section>
                ))}

                <section id="claims" className="fulltext-section claims-section">
                  <header className="claims-section-header">
                    <span>{String(payload.sections.length + 2).padStart(2, '0')}</span>
                    <div><p>CLAIMS</p><h2>청구범위</h2></div>
                    <div className="krds-segmented" role="group" aria-label="청구항 필터">
                      <button className={claimMode === 'all' ? 'active' : ''} type="button" onClick={() => setClaimMode('all')}>전체 {payload.claims.length}</button>
                      <button className={claimMode === 'independent' ? 'active' : ''} type="button" onClick={() => setClaimMode('independent')}>독립항 {payload.claims.filter(isIndependentClaim).length}</button>
                    </div>
                  </header>
                  <div className="fulltext-claims">
                    {visibleClaims.map((claim) => (
                      <article id={`claim-${claim.number}`} className={[isIndependentClaim(claim) ? 'independent' : '', evidenceClassName(`claim-${claim.number}`) ?? ''].filter(Boolean).join(' ')} key={claim.number} tabIndex={evidenceTargetId === `claim-${claim.number}` ? -1 : undefined}>
                        <div><strong>청구항 {claim.number}</strong>{isIndependentClaim(claim) && <span>독립항</span>}</div>
                        <p><Highlight text={claim.text} query={query} evidence={evidenceTargetId === `claim-${claim.number}` ? evidenceExcerpt : ''} /></p>
                      </article>
                    ))}
                  </div>
                </section>
              </article>
            </div>
          </>
        )}
      </main>

      <footer className="krds-footer">
        <div><strong>심사데스크</strong><p>KIPRIS Plus 데이터를 심사 흐름에 맞게 정리하는 검토용 MVP</p></div>
        <span>전문 원문은 KIPRIS Plus API 응답을 기준으로 표시합니다.</span>
      </footer>
    </>
  );
}
