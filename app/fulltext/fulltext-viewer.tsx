'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type FullTextSection = {
  id: string;
  title: string;
  paragraphs: string[];
};

type FullTextClaim = {
  number: number;
  text: string;
};

type FullTextPayload = {
  applicationNumber: string;
  title: string;
  abstract: string[];
  sections: FullTextSection[];
  claims: FullTextClaim[];
  figureCount: number;
  sourceFileName: string;
  isDemo: boolean;
  fetchedAt?: string | null;
};

function formatApplicationNumber(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 13
    ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
    : value;
}

function isIndependentClaim(claim: FullTextClaim) {
  return !claim.text.trim().startsWith('제');
}

function splitTitle(value: string) {
  const englishMatch = value.match(/\{([^}]+)\}\s*$/);
  return {
    korean: value.replace(/\s*\{[^}]+\}\s*$/, '').trim(),
    english: englishMatch?.[1]?.trim() ?? '',
  };
}

function Highlight({ text, query }: { text: string; query: string }) {
  const normalized = query.trim();
  if (!normalized) return text;

  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`(${escaped})`, 'gi');
  return text.split(expression).map((part, index) =>
    part.toLocaleLowerCase('ko-KR') === normalized.toLocaleLowerCase('ko-KR') ? (
      <mark key={`${part}-${index}`}>{part}</mark>
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

  const visibleClaims = useMemo(() => {
    if (!payload) return [];
    return claimMode === 'independent'
      ? payload.claims.filter(isIndependentClaim)
      : payload.claims;
  }, [claimMode, payload]);

  const matchCount = useMemo(() => {
    if (!payload || !query.trim()) return 0;
    const needle = query.trim().toLocaleLowerCase('ko-KR');
    const texts = [
      ...payload.abstract,
      ...payload.sections.flatMap((section) => section.paragraphs),
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

  return (
    <>
      <a className="skip-link" href="#fulltext-main">본문 바로가기</a>
      <div className="krds-masthead">
        <div><span className="krds-flag" aria-hidden="true" />이 누리집은 대한민국 공식 전자정부 누리집의 디자인 원칙을 참고한 MVP입니다.</div>
      </div>
      <header className="fulltext-site-header">
        <div className="fulltext-site-header-inner">
          <Link className="service-identity" href="/">
            <span className="service-mark" aria-hidden="true">특허</span>
            <span><strong>심사데스크</strong><small>특허 사건 검토 지원</small></span>
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
                <section id="abstract" className="fulltext-section abstract-section">
                  <header><span>01</span><div><p>ABSTRACT</p><h2>초록</h2></div></header>
                  <div className="fulltext-prose">
                    {payload.abstract.map((paragraph, index) => <p key={index}><Highlight text={paragraph} query={query} /></p>)}
                  </div>
                </section>

                {payload.sections.map((section, sectionIndex) => (
                  <section id={section.id} className="fulltext-section" key={section.id}>
                    <header><span>{String(sectionIndex + 2).padStart(2, '0')}</span><div><p>DESCRIPTION</p><h2>{section.title}</h2></div></header>
                    <div className="fulltext-prose numbered">
                      {section.paragraphs.map((paragraph, index) => (
                        <p key={index}><span>{String(index + 1).padStart(3, '0')}</span><span><Highlight text={paragraph} query={query} /></span></p>
                      ))}
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
                      <article className={isIndependentClaim(claim) ? 'independent' : ''} key={claim.number}>
                        <div><strong>청구항 {claim.number}</strong>{isIndependentClaim(claim) && <span>독립항</span>}</div>
                        <p><Highlight text={claim.text} query={query} /></p>
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
