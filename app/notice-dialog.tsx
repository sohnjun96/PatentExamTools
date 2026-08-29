'use client';

import { useEffect, useState } from 'react';
import { useModalBehavior } from '@/app/lib/use-modal-behavior';
import type { NoticeAnalysis } from '@/app/lib/notice-analysis';

type Notice = {
  documentNumber: string;
  date: string;
};

type Tab = 'summary' | 'markdown' | 'pdf';

const analysisRequests = new Map<string, Promise<NoticeAnalysis>>();

function formatDate(value: string) {
  const number = value.replace(/\D/g, '');
  return number.length === 8
    ? `${number.slice(0, 4)}.${number.slice(4, 6)}.${number.slice(6)}.`
    : value || '—';
}

async function fetchAnalysis(
  applicationNumber: string,
  sendNumber: string,
  force = false,
) {
  const parameters = new URLSearchParams({ applicationNumber, sendNumber });
  if (force) parameters.set('force', 'true');
  if (!force) {
    const cached = await fetch(`/api/patent/notice-analysis?${parameters}`, {
      cache: 'no-store',
    });
    const cachedPayload = await cached.json() as NoticeAnalysis;
    if (cached.ok) return cachedPayload;
    if (cached.status !== 404) {
      throw new Error(cachedPayload.error || '통지서 분석 캐시를 불러오지 못했습니다.');
    }
  }
  const response = await fetch(`/api/patent/notice-analysis?${parameters}`, {
    method: 'POST',
  });
  const payload = await response.json() as NoticeAnalysis;
  if (!response.ok) throw new Error(payload.error || '통지서를 분석하지 못했습니다.');
  return payload;
}

function sharedAnalysisRequest(
  applicationNumber: string,
  sendNumber: string,
  force = false,
) {
  const key = `${applicationNumber}:${sendNumber}:${force ? 'force' : 'normal'}`;
  const current = analysisRequests.get(key);
  if (current) return current;
  const request = fetchAnalysis(applicationNumber, sendNumber, force)
    .finally(() => analysisRequests.delete(key));
  analysisRequests.set(key, request);
  return request;
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

function SummaryGroup({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return <section><h3>{title}</h3><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></section>;
}

function formatClaimNumbers(numbers: number[]) {
  return numbers.length ? `청구항 ${numbers.join(', ')}` : '해당 청구항 없음';
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
  const [tab, setTab] = useState<Tab>('summary');
  const [analysis, setAnalysis] = useState<NoticeAnalysis | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const dialogRef = useModalBehavior<HTMLElement>(onClose);

  useEffect(() => {
    let cancelled = false;
    window.queueMicrotask(() => { if (!cancelled) { setBusy(true); setError(''); } });
    void sharedAnalysisRequest(applicationNumber, notice.documentNumber)
      .then((payload) => { if (!cancelled) setAnalysis(payload); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '통지서 분석에 실패했습니다.'); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [applicationNumber, notice.documentNumber]);

  async function regenerate() {
    setBusy(true); setError('');
    try { setAnalysis(await sharedAnalysisRequest(applicationNumber, notice.documentNumber, true)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '통지서 재분석에 실패했습니다.'); }
    finally { setBusy(false); }
  }

  async function copyMarkdown() {
    if (!analysis?.markdown) return;
    await navigator.clipboard.writeText(analysis.markdown);
  }

  return <div className="exam-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} className="exam-dialog notice" role="dialog" aria-modal="true" aria-label="의견제출통지서" tabIndex={-1}>
      <header><div><small>통지서 텍스트·PDF</small><h2>의견제출통지서</h2><p>{formatDate(notice.date)} · {notice.documentNumber}</p></div><button type="button" onClick={onClose}>닫기 ×</button></header>
      <nav className="notice-dialog-tabs" aria-label="통지서 보기 방식">
        <button className={tab === 'summary' ? 'active' : ''} type="button" onClick={() => setTab('summary')}>AI 요약</button>
        <button className={tab === 'markdown' ? 'active' : ''} type="button" onClick={() => setTab('markdown')}>텍스트·마크다운</button>
        <button className={tab === 'pdf' ? 'active' : ''} type="button" onClick={() => setTab('pdf')}>PDF 원문</button>
      </nav>
      {tab === 'pdf' ? <iframe src={pdfUrl} title={`${formatDate(notice.date)} 의견제출통지서 PDF`}/> : <div className="notice-dialog-body">
        {busy && <div className="notice-analysis-status"><span>통지서 분석 중</span><h3>통지서의 본문과 표를 읽고 있습니다.</h3><p>최초 분석 후에는 저장된 결과를 사용합니다.</p></div>}
        {!busy && error && <div className="notice-analysis-status error"><span>분석 오류</span><h3>통지서 분석을 완료하지 못했습니다.</h3><p>{error}</p><button type="button" onClick={regenerate}>다시 분석</button></div>}
        {!busy && analysis && tab === 'summary' && <div className="notice-summary">
          <article className="notice-summary-lead"><span>통지 요지</span><h3>{analysis.summary.oneLine}</h3><small>{analysis.parser === 'kordoc' ? 'kordoc 표·문서 파싱' : 'OpenAI PDF 문서 분석'} · {analysis.cached ? '저장된 분석' : '새 분석'}</small></article>
          <div className="notice-summary-grid">
            <SummaryGroup title="법조항별 거절 청구항" items={analysis.summary.rejectionGrounds.map((ground) => `${ground.provision} : ${formatClaimNumbers(ground.claimNumbers)}`)}/>
            {analysis.summary.allowableClaims.length > 0 && <SummaryGroup title="등록가능항" items={[formatClaimNumbers(analysis.summary.allowableClaims)]}/>}
            <SummaryGroup title="주요 쟁점" items={analysis.summary.keyIssues}/>
            <SummaryGroup title="대상 청구항" items={analysis.summary.affectedClaims}/>
            <SummaryGroup title="인용문헌" items={analysis.summary.citedReferences}/>
            <SummaryGroup title="제출기한" items={analysis.summary.deadlines}/>
            <SummaryGroup title="요구된 대응" items={analysis.summary.requiredActions}/>
            <SummaryGroup title="판독·해석 유의사항" items={analysis.summary.cautions}/>
          </div>
        </div>}
        {!busy && analysis && tab === 'markdown' && <div className="notice-markdown"><div className="notice-markdown-actions"><span>표를 포함해 복원한 통지서 텍스트</span><button type="button" onClick={copyMarkdown}>마크다운 복사</button></div><MarkdownDocument markdown={analysis.markdown}/></div>}
      </div>}
      <footer><span>{analysis ? `${analysis.model} · ${analysis.parser}` : 'PDF_V2 원문 분석'}</span><div><button type="button" onClick={regenerate} disabled={busy}>재분석</button><a href={pdfUrl} target="_blank" rel="noreferrer">PDF 새 창 ↗</a></div></footer>
    </section>
  </div>;
}
