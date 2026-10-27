'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import PdfDownloadButton, { fetchPdf, type PdfKind, type PdfNumberType } from '../components/pdf-download';
import { chooseSaveFile, writeChosenFile } from '../lib/save-file';
import './documents.css';

type Job = { number: string; state: 'waiting' | 'loading' | 'complete' | 'error'; error?: string };
export default function DocumentDownloads() {
  const [input, setInput] = useState('');
  const [numberType, setNumberType] = useState<PdfNumberType>('application');
  const [kind, setKind] = useState<PdfKind>('publication');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [needsNumberType, setNeedsNumberType] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const prefill = query.get('numbers');
    const type = query.get('numberType');
    if (prefill) {
      setInput(prefill);
      if (type === 'application' || type === 'publication' || type === 'registration') setNumberType(type);
      else { setNeedsNumberType(true); setMessage('검색 문헌을 가져왔습니다. 입력 번호 종류를 선택해 주세요. 공개번호와 출원번호는 서로 다릅니다.'); }
    }
  }, []);
  const abort = useRef<AbortController | null>(null);
  const numbers = useMemo(() => [...new Set(input.split(/[\n,;\t]+/).map(value => value.trim()).filter(Boolean))], [input]);
  const effectiveKind = numberType === 'application' ? kind : numberType;
  function update(number: string, patch: Partial<Job>) { setJobs(current => current.map(job => job.number === number ? { ...job, ...patch } : job)); }
  async function downloadBundle() {
    setMessage('');
    if (needsNumberType) { setMessage('입력 번호 종류를 먼저 선택해 주세요.'); return; }
    if (!numbers.length || numbers.length > 50) { setMessage('번호를 1~50건 입력해 주세요.'); return; }
    if (numbers.some(number => !/^(?:KR\s*)?(?:10|20)[\d\s-]{5,20}[ABCUY]?\d?$/i.test(number))) { setMessage('국내 특허·실용신안 번호만 입력해 주세요. 번호 종류를 구분해 한 줄에 하나씩 입력합니다.'); return; }
    setBusy(true); setCancelled(false);
    try {
      const destination = await chooseSaveFile('심사데스크_전문PDF.zip', 'application/zip', 'zip');
      if (!destination) return;
      const controller = new AbortController(); abort.current = controller;
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      setJobs(numbers.map(number => ({ number, state: 'waiting' })));
      const outcomes: { number: string; status: string; message: string }[] = [];
      for (const number of numbers) {
        if (controller.signal.aborted) { setCancelled(true); break; }
        update(number, { state: 'loading' });
        try {
          const blob = await fetchPdf(number, effectiveKind, numberType, AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]));
          zip.file(`${number.replace(/[^A-Za-z0-9-]/g, '')}_${effectiveKind}.pdf`, blob);
          outcomes.push({ number, status: '성공', message: '' });
          update(number, { state: 'complete' });
        } catch (error) {
          if (controller.signal.aborted) { update(number, { state: 'error', error: '사용자 중단' }); setCancelled(true); break; }
          const detail = error instanceof Error ? error.message : 'PDF 조회 실패';
          outcomes.push({ number, status: '실패', message: detail });
          update(number, { state: 'error', error: detail });
        }
      }
      if (controller.signal.aborted) { setMessage('다운로드를 중단했습니다. ZIP 파일은 저장하지 않았습니다.'); return; }
      const successful = outcomes.filter(outcome => outcome.status === '성공').length;
      if (!successful) { setMessage('받을 수 있는 PDF가 없어 ZIP 파일을 저장하지 않았습니다. 각 번호의 실패 이유를 확인해 주세요.'); return; }
      zip.file('다운로드 결과.txt', `번호 종류: ${numberType}\n공보 종류: ${effectiveKind}\n\n${outcomes.map(outcome => `${outcome.number}\t${outcome.status}\t${outcome.message}`).join('\n')}`);
      const saved = await writeChosenFile(destination, await zip.generateAsync({ type: 'blob', compression: 'STORE' }));
      setMessage(`${successful}/${numbers.length}건 PDF 포함 · ${saved}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '다운로드에 실패했습니다.'); }
    finally { setBusy(false); abort.current = null; }
  }
  return <main className="docs-page"><header className="docs-top"><a href="/" className="docs-brand"><span>심</span> 심사데스크 <small>AI 검색 결과 평가</small></a><nav><a href="/">평가 업무로 돌아가기 ↗</a><a href="/patent">기존 사건 조회 ↗</a></nav></header><div className="docs-content"><div className="docs-intro"><span className="docs-eyebrow">DOCUMENT WORKSPACE</span><h1>검색에 필요한 전문,<br/>한곳에서 내려받으세요.</h1><p>대상 출원과 AI가 찾은 국내 문헌의 공개·등록공보 PDF를 모읍니다.</p></div><div className="docs-layout"><section className="docs-panel"><div className="docs-panel-title"><span>01</span><h2>문헌 번호 입력</h2></div><p>번호 종류를 먼저 선택한 다음, 한 줄에 하나씩 붙여 넣으세요.</p><div className="docs-fields"><label>입력 번호 종류<select value={needsNumberType ? "" : numberType} disabled={busy} onChange={event => { setNumberType(event.target.value as PdfNumberType); setNeedsNumberType(false); setJobs([]); }}><option value="" disabled>번호 종류를 선택하세요</option><option value="application">출원번호</option><option value="publication">공개번호</option><option value="registration">등록번호</option></select></label><label>받을 전문<select value={effectiveKind} disabled={busy || numberType !== 'application'} onChange={event => { setKind(event.target.value as PdfKind); setJobs([]); }}><option value="publication">공개공보 PDF</option><option value="registration">등록공보 PDF</option></select></label></div><textarea aria-label="내려받을 문헌 번호" rows={11} disabled={busy} value={input} onChange={event => { setInput(event.target.value); setJobs([]); }} placeholder={numberType === 'application' ? '예: 10-2020-0093844\n출원번호를 한 줄에 하나씩 입력' : numberType === 'publication' ? '예: KR10-2022-0014141A\n공개번호를 한 줄에 하나씩 입력' : '등록번호를 한 줄에 하나씩 입력'} /><div className="docs-input-foot"><span>{numbers.length}건 · 최대 50건</span><small>중복 번호는 한 번만 요청합니다.</small></div><div className="docs-actions"><button disabled={busy || !numbers.length} onClick={() => void downloadBundle()}>{busy ? 'PDF를 모으는 중…' : '전문 PDF ZIP 다운로드 ↓'}</button>{busy && <button className="secondary" onClick={() => abort.current?.abort()}>중단</button>}</div>{message && <p role="status" className="docs-feedback">{message}</p>}<p className="docs-note">공개·등록번호는 해당 번호의 공보를 받습니다. 공개되지 않았거나 PDF가 제공되지 않는 문헌은 실패 이유를 표시합니다. 해외 문헌은 해당 관청 서비스를 이용해 주세요.</p></section><section className="docs-panel docs-results"><div className="docs-panel-title"><span>02</span><h2>다운로드 목록</h2><small>{jobs.filter(job => job.state === 'complete').length} / {numbers.length}</small></div>{!numbers.length ? <div className="docs-empty"><span>↓</span><h3>문헌 번호를 입력하면<br/>다운로드 목록이 표시됩니다.</h3><p>출원 1건은 개별 PDF로,<br/>여러 문헌은 ZIP으로 받을 수 있습니다.</p></div> : <div className="docs-job-list">{numbers.slice(0, 50).map((number, index) => { const job = jobs.find(item => item.number === number); return <article key={number}><div><span className="docs-job-index">{String(index + 1).padStart(2, '0')}</span><strong>{number}</strong></div><div>{job && <small className={`docs-job-${job.state}`}>{job.state === 'complete' ? '수집 완료' : job.state === 'loading' ? '조회 중' : job.state === 'error' ? '조회 실패' : cancelled ? '중단됨' : '대기'}</small>}{!needsNumberType && <PdfDownloadButton applicationNumber={number} numberType={numberType} kind={numberType === 'application' ? kind : numberType} label="개별 PDF ↓" />}</div>{job?.error && <p className="docs-job-error">{job.error}</p>}</article>; })}</div>}</section></div><footer>PDF는 KIPRIS Plus가 제공하는 원문 파일입니다. 번호 종류를 정확히 선택하면 다른 문헌의 다운로드를 예방할 수 있습니다.</footer></div></main>;
}
