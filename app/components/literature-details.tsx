import type { LiteratureDocument } from '@/app/lib/evaluation';
import { literatureLink } from '@/app/lib/literature-link';
import NoticeMarkdown from './notice-markdown';
import AppIcon from './app-icon';
import './literature-details.css';

const bibliographyFields = [
  ['authors', '저자명'], ['title', '논문명·문서명'], ['publication', '간행물명'],
  ['publicationPlace', '발행장소'], ['publisher', '발행처'], ['publicationDate', '발행연월일'],
  ['volume', '권수'], ['issue', '호수'], ['pages', '페이지'], ['acquiredDate', '입수일'], ['dateNote', '날짜 비고'],
] as const;

/** Published content only: callers choose the published result's detail record. */
export default function LiteratureDetails({ document }: { document?: LiteratureDocument }) {
  if (!document) return null;
  const url = document.url ? literatureLink(document.url) : null;
  const fields = bibliographyFields.filter(([key]) => document[key]);
  return <div className="literature-details">
    <span className="literature-details-kind">{document.kind === 'patent' ? '특허문헌' : document.kind === 'non-patent' ? '비특허문헌' : '기존 문헌'}</span>
    {fields.length > 0 && <details className="literature-bibliography">
      <summary>서지정보 보기</summary>
      <dl>{fields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{document[key]}</dd></div>)}</dl>
    </details>}
    {url?.kind === 'url' && <a className="literature-source-url" href={url.href} target="_blank" rel="noopener noreferrer" aria-label={`${document.title || document.number} 원문 URL (새 창)`}>
      <span>원문 URL</span> {document.url} <AppIcon name="arrow-right-up" size={16} />
    </a>}
    {document.reportMarkdown ? <details className="literature-report">
      <summary>보고서 보기</summary>
      <NoticeMarkdown markdown={document.reportMarkdown} tableLabel="선행기술 문헌 보고서 표" />
    </details> : <span className="literature-no-report">보고서 미등록</span>}
  </div>;
}
