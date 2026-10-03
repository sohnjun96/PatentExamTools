'use client';

import { useEffect, useRef, useState } from 'react';
import { useModalBehavior } from '@/app/lib/use-modal-behavior';
import type { NoticeAnalysis } from '@/app/lib/notice-analysis';
import { splitTableRow, isTableSeparator, normalizeNoticeMarkdown } from '@/app/lib/notice-postprocess';
import { exactEvidenceExpression, type OriginalTarget } from '@/app/lib/evidence-location';
import { OriginalHighlight } from '@/app/original-document-viewer';
import { formatAnalysisDate } from '@/app/lib/analysis-provenance';

type Notice = {
  documentNumber: string;
  date: string;
};

type Tab = 'markdown' | 'pdf';

function formatDate(value: string) {
  const number = value.replace(/\D/g, '');
  return number.length === 8
    ? `${number.slice(0, 4)}.${number.slice(4, 6)}.${number.slice(6)}.`
    : value || '—';
}

async function fetchAnalysis(
  applicationNumber: string,
  sendNumber: string,
) {
  const parameters = new URLSearchParams({ applicationNumber, sendNumber });
  const response = await fetch(`/api/patent/notice-analysis?${parameters}`, { cache: 'no-store' });
  const payload = await response.json() as NoticeAnalysis;
  if (response.status === 404) throw new Error('텍스트 변환 결과가 없습니다. 대시보드에서 AI 분석을 실행하세요.');
  if (!response.ok) throw new Error(payload.error || '저장된 통지서 텍스트를 불러오지 못했습니다.');
  return payload;
}

function InlineText({ text, excerpt = '' }: { text: string; excerpt?: string }) {
  const plain = text.replace(/<br\s*\/?\s*>/gi, '\n').replace(/\*\*/g, '');
  if (excerpt && exactEvidenceExpression(plain, excerpt)) return <span className="notice-inline-text"><OriginalHighlight text={plain} excerpt={excerpt}/></span>;
  return <>{text.split(/(<br\s*\/?\s*>|\*\*[^*]+\*\*)/gi).filter(Boolean).map((part, index) =>
    /^<br/i.test(part) ? <br key={index}/> : part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}><OriginalHighlight text={part.slice(2, -2)} excerpt={excerpt}/></strong>
      : <span key={index}><OriginalHighlight text={part} excerpt={excerpt}/></span>,
  )}</>;
}

function MarkdownDocument({ markdown, target }: { markdown: string; target?: OriginalTarget | null }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cleaned = normalizeNoticeMarkdown(markdown);
  const lines = cleaned.markdown.split('\n');
  useEffect(() => {
    if (!target?.excerpt) return;
    const nodes = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('p, td, th, li, h2, h3, h4, h5') ?? []);
    const node = nodes.find((element) => exactEvidenceExpression(element.textContent || '', target.excerpt));
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (node) { node.tabIndex = -1; node.focus({ preventScroll: true }); }
  }, [target, markdown]);
  const nodes: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const Heading = `h${Math.min(level + 1, 5)}` as 'h2' | 'h3' | 'h4' | 'h5';
      nodes.push(<Heading key={`h-${index}`}><InlineText text={heading[2]} excerpt={target?.excerpt}/></Heading>);
      index += 1;
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      nodes.push(
        <div className="notice-table-wrap" key={`table-${index}`}>
          <table>
            <thead><tr>{headers.map((header, cell) => <th key={cell}><InlineText text={header} excerpt={target?.excerpt}/></th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.length === headers.length ? row.map((cell, cellIndex) => <td key={cellIndex}><InlineText text={cell} excerpt={target?.excerpt}/></td>) : <td colSpan={headers.length} className="notice-ambiguous-row"><strong>열 대응 확인 필요</strong><ol>{row.map((cell, cellIndex) => <li key={cellIndex}><InlineText text={cell} excerpt={target?.excerpt}/></li>)}</ol></td>}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ''));
        index += 1;
      }
      nodes.push(<ul key={`ul-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}><InlineText text={item} excerpt={target?.excerpt}/></li>)}</ul>);
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ''));
        index += 1;
      }
      nodes.push(<ol key={`ol-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}><InlineText text={item} excerpt={target?.excerpt}/></li>)}</ol>);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4})\s+/.test(lines[index].trim()) &&
      !/^[-*+]\s+/.test(lines[index].trim()) &&
      !/^\d+[.)]\s+/.test(lines[index].trim()) &&
      !(lines[index].includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1]))
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    nodes.push(<p key={`p-${index}`}><InlineText text={paragraph.join(' ')} excerpt={target?.excerpt}/></p>);
  }
  return <div className="notice-markdown-document" ref={rootRef}>{nodes}</div>;
}

export default function NoticeDialog({
  applicationNumber,
  notice,
  pdfUrl,
  target,
  onClose,
}: {
  applicationNumber: string;
  notice: Notice;
  pdfUrl: string;
  target?: OriginalTarget | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('markdown');
  const [analysis, setAnalysis] = useState<NoticeAnalysis | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const dialogRef = useModalBehavior<HTMLElement>(onClose);

  useEffect(() => {
    let cancelled = false;
    window.queueMicrotask(() => { if (!cancelled) { setBusy(true); setError(''); setAnalysis(null); setTab('markdown'); setCopyStatus(''); } });
    void fetchAnalysis(applicationNumber, notice.documentNumber)
      .then((payload) => { if (!cancelled) setAnalysis(payload); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '통지서 텍스트를 불러오지 못했습니다.'); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [applicationNumber, notice.documentNumber]);

  const tableWarnings = analysis ? [...new Set([...(analysis.tableWarnings ?? []), ...normalizeNoticeMarkdown(analysis.markdown).warnings])] : [];
  const excerptFound = analysis && target?.excerpt ? !!exactEvidenceExpression(analysis.markdown.replace(/<br\s*\/?\s*>/gi, ' ').replace(/\*\*/g, ''), target.excerpt) : false;

  async function copyMarkdown() {
    if (!analysis?.markdown) return;
    try { await navigator.clipboard.writeText(analysis.markdown); setCopyStatus('복사했습니다.'); }
    catch { setCopyStatus('복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.'); }
  }

  return <div className="exam-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} className="exam-dialog notice" role="dialog" aria-modal="true" aria-label="의견제출통지서" tabIndex={-1}>
      <header><div><small>통지서 텍스트·PDF</small><h2>의견제출통지서</h2><p>{formatDate(notice.date)} · {notice.documentNumber}</p></div><button type="button" onClick={onClose}>닫기 ×</button></header>
      <nav className="notice-dialog-tabs" aria-label="통지서 보기 방식">
        <button className={tab === 'markdown' ? 'active' : ''} type="button" onClick={() => setTab('markdown')}>텍스트</button>
        <button className={tab === 'pdf' ? 'active' : ''} type="button" onClick={() => setTab('pdf')}>PDF 원문</button>
      </nav>
      {tab === 'pdf' ? <iframe src={pdfUrl} title={`${formatDate(notice.date)} 의견제출통지서 PDF`}/> : <div className="notice-dialog-body">
        {busy && <div className="notice-analysis-status"><span>원문 불러오는 중</span><h3>저장된 통지서 텍스트를 확인하고 있습니다.</h3></div>}
        {!busy && error && <div className="notice-analysis-status error"><span>텍스트 없음</span><h3>변환된 통지서 텍스트를 표시할 수 없습니다.</h3><p>{error}</p><button type="button" onClick={() => setTab('pdf')}>PDF 원문 보기</button></div>}
        {!busy && analysis && tab === 'markdown' && <div className="notice-markdown"><div className="notice-markdown-actions"><span>표를 포함해 복원한 통지서 텍스트</span><button type="button" onClick={copyMarkdown}>마크다운 복사</button></div>{target && <div className="original-evidence-guide" role="status"><strong>{target.locator}</strong><span>{excerptFound ? '관련 문언으로 이동하고 일치 부분을 강조했습니다.' : '요약문과 일치하는 인용문이 없어 정확한 강조 위치를 확인하지 못했습니다. 아래 원문에서 확인해 주세요.'}</span></div>}{tableWarnings.length > 0 && <details className="notice-table-warning" open><summary>표 {tableWarnings.length}개 행의 열 대응 확인 필요</summary><p>개행은 복원했지만 누락된 셀을 임의로 채우지 않았습니다. 해당 행은 추출 순서대로 표시합니다.</p><ul>{tableWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><button type="button" onClick={() => setTab('pdf')}>PDF에서 표 확인</button></details>}<MarkdownDocument markdown={analysis.markdown} target={target}/></div>}
      </div>}
      <footer><span>{copyStatus || (analysis ? `${analysis.parser === 'kordoc' ? 'kordoc 변환' : 'AI 텍스트 변환 · 원문 대조 필요'} · ${formatAnalysisDate(analysis.generatedAt)}` : 'PDF_V2 원문')}</span><div><a href={pdfUrl} target="_blank" rel="noreferrer">PDF 새 창 ↗</a></div></footer>
    </section>
  </div>;
}
