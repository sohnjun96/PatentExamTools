'use client';

import { useEffect, useState } from 'react';
import { useModalBehavior } from '@/app/lib/use-modal-behavior';
import type { NoticeAnalysis } from '@/app/lib/notice-analysis';

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
  if (response.status === 404) throw new Error('텍스트 변환 결과가 없습니다. AI 사전검토를 실행하면 함께 생성됩니다.');
  if (!response.ok) throw new Error(payload.error || '저장된 통지서 텍스트를 불러오지 못했습니다.');
  return payload;
}

function splitTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cell = '';
  let escaped = false;
  for (const character of trimmed) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function isTableSeparator(line: string) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function InlineText({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <span key={index}>{part}</span>,
  )}</>;
}

function MarkdownDocument({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const nodes: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const Heading = `h${Math.min(level + 1, 5)}` as 'h2' | 'h3' | 'h4' | 'h5';
      nodes.push(<Heading key={`h-${index}`}><InlineText text={heading[2]}/></Heading>);
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
            <thead><tr>{headers.map((header, cell) => <th key={cell}><InlineText text={header}/></th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cell) => <td key={cell}><InlineText text={row[cell] || ''}/></td>)}</tr>)}</tbody>
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
      nodes.push(<ul key={`ul-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}><InlineText text={item}/></li>)}</ul>);
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ''));
        index += 1;
      }
      nodes.push(<ol key={`ol-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}><InlineText text={item}/></li>)}</ol>);
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
    nodes.push(<p key={`p-${index}`}><InlineText text={paragraph.join(' ')}/></p>);
  }
  return <div className="notice-markdown-document">{nodes}</div>;
}

export default function NoticeDialog({
  applicationNumber,
  notice,
  pdfUrl,
  onClose,
}: {
  applicationNumber: string;
  notice: Notice;
  pdfUrl: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('markdown');
  const [analysis, setAnalysis] = useState<NoticeAnalysis | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const dialogRef = useModalBehavior<HTMLElement>(onClose);

  useEffect(() => {
    let cancelled = false;
    window.queueMicrotask(() => { if (!cancelled) { setBusy(true); setError(''); } });
    void fetchAnalysis(applicationNumber, notice.documentNumber)
      .then((payload) => { if (!cancelled) setAnalysis(payload); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '통지서 텍스트를 불러오지 못했습니다.'); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [applicationNumber, notice.documentNumber]);

  async function copyMarkdown() {
    if (!analysis?.markdown) return;
    await navigator.clipboard.writeText(analysis.markdown);
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
        {!busy && analysis && tab === 'markdown' && <div className="notice-markdown"><div className="notice-markdown-actions"><span>표를 포함해 복원한 통지서 텍스트</span><button type="button" onClick={copyMarkdown}>마크다운 복사</button></div><MarkdownDocument markdown={analysis.markdown}/></div>}
      </div>}
      <footer><span>{analysis ? `${analysis.parser === 'kordoc' ? 'kordoc 변환' : '문서 텍스트 변환'} · 저장된 결과` : 'PDF_V2 원문'}</span><div><a href={pdfUrl} target="_blank" rel="noreferrer">PDF 새 창 ↗</a></div></footer>
    </section>
  </div>;
}
