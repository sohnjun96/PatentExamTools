'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PdfDownloadButton from '../components/pdf-download';
import { applicationNumberLabel, normalizeApplicationNumber, SAMPLE_APPLICATION_NUMBER } from '../lib/patent-number';
import { patentFeedback } from '../lib/patent-feedback';

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
  explicitDemo = false,
}: {
  initialApplicationNumber: string;
  explicitDemo?: boolean;
}) {
  const applicationNumber = normalizeApplicationNumber(initialApplicationNumber);
  const [payload, setPayload] = useState<FullTextPayload | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [claimMode, setClaimMode] = useState<'all' | 'independent'>('all');

  useEffect(() => {
    if (!applicationNumber) return;
    const requestedNumber = applicationNumber;
    const controller = new AbortController();
    setError(''); setPayload(null);
    async function load() {
      try {
        const response = await fetch(
          `/api/patent/fulltext?applicationNumber=${encodeURIComponent(requestedNumber)}${explicitDemo ? '&demo=1' : ''}`,
          { signal: controller.signal },
        );
        const result = (await response.json()) as FullTextPayload & { error?: string };
        if (!response.ok) throw new Error(result.error || '전문파일을 불러오지 못했습니다.');
        if (result.applicationNumber !== requestedNumber) throw new Error('응답의 출원번호가 요청과 다릅니다. 출원번호를 다시 확인해 주세요.');
        setPayload(result);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(patentFeedback(caught, 'fulltext'));
      }
    }
    load();
    return () => controller.abort();
  }, [applicationNumber, explicitDemo, retry]);

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
  const formattedNumber = applicationNumberLabel(initialApplicationNumber);
  const caseUrl = `/patent?applicationNumber=${encodeURIComponent(initialApplicationNumber)}${explicitDemo ? '&demo=1' : ''}`;

  return (
    <>
      <a className="skip-link" href="#fulltext-main">본문 바로가기</a>
      <div className="krds-masthead">
        <div><span className="krds-flag" aria-hidden="true" />특허 사건과 AI 검색 결과를 검토하는 업무 공간입니다.</div>
      </div>
      <header className="fulltext-site-header">
        <div className="fulltext-site-header-inner">
          <Link className="service-identity" href="/">
            <span className="service-mark" aria-hidden="true">AI</span>
            <span><strong>AI 선행기술 검색 포털</strong><small>특허 사건 검토 지원</small></span>
          </Link>
          <nav aria-label="주요 메뉴">
            <Link href={caseUrl}>사건 조회</Link>
            <Link href="/documents">전문 PDF 내려받기</Link>
          </nav>
        </div>
      </header>

      <main id="fulltext-main" className="fulltext-main" tabIndex={-1}>
        <nav className="breadcrumb fulltext-breadcrumb" aria-label="현재 위치">
          <Link href="/">AI 평가 업무</Link><span>›</span><Link href={caseUrl}>사건 조회</Link><span>›</span><strong>전문 명세서</strong>
        </nav>

        {!applicationNumber ? (
          <section className="fulltext-error" role={initialApplicationNumber ? 'alert' : undefined}>
            <h1>{initialApplicationNumber ? '출원번호를 확인해 주세요.' : '출원번호로 전문을 조회하세요.'}</h1>
            {initialApplicationNumber && <p>입력한 번호: <strong>{initialApplicationNumber}</strong></p>}
            <p>특허·실용신안 출원번호 13자리를 입력하면 명세서와 청구항을 볼 수 있습니다.</p>
            <div className="fulltext-actions"><Link className="krds-button primary" href={caseUrl}>출원번호 다시 조회</Link>{!initialApplicationNumber && <Link className="krds-button secondary" href={`/fulltext?applicationNumber=${SAMPLE_APPLICATION_NUMBER}&demo=1`}>샘플 전문 보기</Link>}</div>
          </section>
        ) : error ? (
          <section className="fulltext-error" role="alert">
            <span>출원번호 {formattedNumber}</span>
            <h1>전문을 불러오지 못했습니다.</h1>
            <p>{error}</p>
            <p>잠시 후 다시 불러오거나 사건 조회에서 출원번호를 확인해 주세요.</p>
            <div className="fulltext-actions"><button className="krds-button primary" type="button" onClick={() => setRetry(value => value + 1)}>전문 다시 불러오기</button><Link className="krds-button secondary" href={caseUrl}>출원번호 다시 조회</Link></div>
          </section>
        ) : !payload ? (
          <section className="fulltext-loading" role="status" aria-live="polite">
            <div className="loader-ring" />
            <strong>명세서와 청구항을 불러오는 중입니다.</strong>
            <span>출원번호 {formattedNumber}</span>
          </section>
        ) : (
          <>
            <section className="fulltext-hero">
              <div className="fulltext-hero-copy">
                <div className="fulltext-badges">
                  <span className="krds-tag primary">전문 읽기</span>
                  <span className="krds-tag neutral">{payload.isDemo ? '샘플 사건' : 'KIPRIS Plus 제공 자료'}</span>
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
                <Link className="krds-button secondary" href={caseUrl}>사건 조회</Link>
                <button className="krds-button primary" type="button" onClick={() => window.print()}>읽기 화면 인쇄·PDF 저장</button>
              </div>
            </section>

            <section className="panel detail-panel" aria-label="공보 원문 PDF 안내" style={{ marginTop: 24 }}>
              <h2>공보 원문 PDF 내려받기</h2><p>이 화면은 명세서와 청구항을 읽기 쉽게 정리한 자료입니다. 원문 공보가 필요하면 아래 PDF를 내려받으세요.</p>
              <div className="fulltext-actions" style={{ marginTop: 16, flexWrap: 'wrap' }}><PdfDownloadButton applicationNumber={applicationNumber} label="공개공보 PDF 내려받기" /><PdfDownloadButton applicationNumber={applicationNumber} kind="registration" label="등록공보 PDF 내려받기" /></div>
            </section>

            <section className="fulltext-toolbar" aria-label="전문 내 검색">
              <label htmlFor="fulltext-search">전문 내 검색</label>
              <div>
                <input id="fulltext-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="구성요소, 도면부호, 용어 검색" />
                <span aria-live="polite">{query.trim() ? `초록·명세서·청구항 전체에서 ${matchCount}개 항목 일치` : '초록·명세서·청구항 전체에서 찾습니다.'}<br />청구항 필터와 관계없이 전체 문단과 청구항을 각각 한 항목으로 셉니다.{query.trim() && matchCount === 0 && ' 다른 용어나 짧은 단어로 검색해 주세요.'}</span>
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
                <div className="fulltext-source-note"><strong>자료 출처</strong><p>KIPRIS Plus에서 제공한 명세서와 청구항을 읽기 쉽게 정리했습니다.</p></div>
              </aside>

              <article className="fulltext-document">
                <section id="abstract" className="fulltext-section abstract-section">
                  <header><span>01</span><div><h2>초록</h2></div></header>
                  <div className="fulltext-prose">
                    {payload.abstract.map((paragraph, index) => <p key={paragraph.number ?? index}><Highlight text={paragraph.text} query={query} /></p>)}
                  </div>
                </section>

                {payload.sections.map((section, sectionIndex) => (
                  <section id={section.id} className="fulltext-section" key={section.id}>
                    <header><span>{String(sectionIndex + 2).padStart(2, '0')}</span><div><h2>{section.title}</h2></div></header>
                    <div className="fulltext-prose numbered">
                      {section.paragraphs.map((paragraph, index) => (
                        <p key={paragraph.number ?? index}><span>{paragraph.number ? `[${paragraph.number}]` : ''}</span><span><Highlight text={paragraph.text} query={query} /></span></p>
                      ))}
                    </div>
                  </section>
                ))}

                <section id="claims" className="fulltext-section claims-section">
                  <header className="claims-section-header">
                    <span>{String(payload.sections.length + 2).padStart(2, '0')}</span>
                    <div><h2>청구범위</h2></div>
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
        <div><strong>AI 선행기술 검색 포털</strong><p>특허 사건 검토</p></div>
        <span>명세서와 청구항은 KIPRIS Plus에서 제공한 자료입니다.</span>
      </footer>
    </>
  );
}
