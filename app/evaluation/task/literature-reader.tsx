'use client';

import { useRef, useState } from 'react';
import { formatNonPatentCitation, type LiteratureDocument } from '@/app/lib/evaluation';
import NoticeMarkdown from '@/app/components/notice-markdown';
import LiteratureLink from '@/app/components/literature-link';

function CitationCopy({ citation }: { citation: string }) {
  const [copyStatus, setCopyStatus] = useState<'ready' | 'copied' | 'manual'>('ready');
  const citationText = useRef<HTMLParagraphElement>(null);

  async function copyCitation() {
    try {
      await navigator.clipboard.writeText(citation);
      setCopyStatus('copied');
    } catch {
      const text = citationText.current;
      const selection = text?.ownerDocument.getSelection();
      if (text && selection) {
        const range = text.ownerDocument.createRange();
        range.selectNodeContents(text);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setCopyStatus('manual');
    }
  }

  return <>
    <div className="tw-citation">
      <p ref={citationText}>{citation}</p>
      <button type="button" className="tw-citation-copy" aria-label="인용문 복사" onClick={copyCitation}>
        {copyStatus === 'copied' ? '복사됨' : '복사'}
      </button>
    </div>
    <p role="status" className={copyStatus === 'manual' ? 'tw-citation-feedback' : 'sr-only'}>
      {copyStatus === 'copied' && '인용문을 복사했습니다.'}
      {copyStatus === 'manual' && '인용문을 선택한 뒤 Ctrl+C 또는 ⌘C로 복사해 주세요.'}
    </p>
  </>;
}

export default function LiteratureReader({ document, preview = false }: { document?: LiteratureDocument; preview?: boolean }) {
  if (!document) return <div className="tw-empty">표시할 문헌이 없습니다.</div>;
  const title = document.kind === 'non-patent' ? document.title || document.number : document.number;
  const bibliography = [document.authors, document.publication, document.publicationDate || document.acquiredDate].filter(Boolean).join(' · ');
  const citation = document.kind === 'non-patent' && !preview ? formatNonPatentCitation(document) : '';
  return <article className="tw-reader">
    <div className="tw-reader-top"><span>{document.kind === 'patent' ? '특허문헌' : document.kind === 'non-patent' ? '비특허문헌' : '기존 문헌'}</span>{!preview && <LiteratureLink reference={document.number} url={document.url} className="tw-source">원문 열기</LiteratureLink>}</div>
    <h2>{title || '문헌번호를 입력하세요.'}</h2>
    {bibliography && <p className="tw-bibliography">{bibliography}</p>}
    {document.kind === 'non-patent' && <details className="tw-bibliographic-details">
      <summary>서지정보</summary>
      {citation && <CitationCopy key={citation} citation={citation} />}
      <dl>{[
        ['발행장소', document.publicationPlace], ['발행처', document.publisher], ['권수', document.volume], ['호수', document.issue], ['페이지', document.pages], ['입수일', document.acquiredDate], ['날짜 비고', document.dateNote],
      ].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </details>}
    <div className="tw-report">{document.reportMarkdown?.trim() ? <NoticeMarkdown markdown={document.reportMarkdown} tableLabel="AI 검색 문헌 보고서 표" /> : <p className="tw-empty">{preview ? '문헌별 보고서를 입력하세요.' : '등록된 문헌별 보고서가 없습니다.'}</p>}</div>
  </article>;
}
