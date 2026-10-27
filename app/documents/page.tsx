'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import PdfDownloadButton, { fetchPdf, type PdfDownloadStatus, type PdfKind, type PdfNumberType } from '../components/pdf-download';
import { chooseSaveFile, fileErrorMessage, SaveFileError, writeChosenFile } from '../lib/save-file';
import {
  canCancelArchive, classifyDocumentRows, documentErrorMessage, documentFilename, documentKindLabels,
  DocumentTaskCancelled, ensureDocumentTaskActive, numberTypeLabels, packAndSaveArchive,
  type ArchiveStage, type DocumentRow,
} from '../lib/document-jobs';
import './documents.css';

type JobStatus = 'waiting' | 'loading' | 'collected' | 'saved' | 'requested' | 'error' | 'cancelled';
type Job = { state: JobStatus; error?: string; source?: 'individual' };
const jobLabels: Record<JobStatus, string> = { waiting: '조회 대기', loading: '조회 중', collected: 'PDF 수집 완료', saved: '파일 저장 완료', requested: '다운로드 요청 완료', error: '조회 실패', cancelled: '중단됨' };
const rowLabels: Record<DocumentRow['classification'], string> = { ready: '조회 전', foreign: '해외 문헌', invalid: '번호 확인 필요', 'needs-type': '번호 종류 선택 필요', duplicate: '중복 제외' };

export default function DocumentDownloads() {
  const [input, setInput] = useState('');
  const [numberType, setNumberType] = useState<PdfNumberType | ''>('');
  const [kind, setKind] = useState<PdfKind>('publication');
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'info' | 'success' | 'error'>('info');
  const [messageTitle, setMessageTitle] = useState('안내');
  const [stage, setStage] = useState<ArchiveStage>('idle');
  const [progress, setProgress] = useState(0);
  const stageRef = useRef<ArchiveStage>('idle');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const prefill = query.get('numbers');
    const type = query.get('numberType');
    if (prefill) {
      setInput(prefill);
      if (type === 'application' || type === 'publication' || type === 'registration') setNumberType(type);
      else setMessage('검색 문헌을 가져왔습니다.');
    }
    return () => abort.current?.abort();
  }, []);
  const rows = useMemo(() => classifyDocumentRows(input, numberType), [input, numberType]);
  const ready = rows.filter(row => row.classification === 'ready');
  const foreignCount = rows.filter(row => row.classification === 'foreign').length;
  const invalidCount = rows.filter(row => row.classification === 'invalid').length;
  const duplicateCount = rows.filter(row => row.classification === 'duplicate').length;
  const effectiveKind = numberType === 'registration' ? 'registration' : numberType === 'publication' ? 'publication' : kind;
  const busy = stage !== 'idle';
  const individualBusy = !busy && Object.values(jobs).some(job => job.state === 'loading');
  const jobCounts = {
    collected: Object.values(jobs).filter(job => job.state === 'collected').length,
    saved: Object.values(jobs).filter(job => job.state === 'saved').length,
    requested: Object.values(jobs).filter(job => job.state === 'requested').length,
    failed: Object.values(jobs).filter(job => job.state === 'error').length,
  };
  const resultCounts = [
    jobCounts.collected ? `PDF 수집 ${jobCounts.collected}건` : '',
    jobCounts.saved ? `개별 파일 저장 ${jobCounts.saved}건` : '',
    jobCounts.requested ? `개별 다운로드 요청 ${jobCounts.requested}건` : '',
    jobCounts.failed ? `조회 실패 ${jobCounts.failed}건` : '',
  ].filter(Boolean).join(' · ');
  function setCurrentStage(value: ArchiveStage) { stageRef.current = value; setStage(value); }
  function feedback(value: string, tone: typeof messageKind = 'info', title = tone === 'error' ? '다운로드를 확인해 주세요' : '안내') { setMessage(value); setMessageKind(tone); setMessageTitle(title); }
  function clearResults() { setJobs({}); setMessage(''); setProgress(0); }
  function update(key: string, patch: Job) { setJobs(current => ({ ...current, [key]: patch })); }
  function singleStatus(row: DocumentRow, value: PdfDownloadStatus, detail?: string) { update(row.key, { state: value, error: value === 'error' ? detail : undefined, source: 'individual' }); }

  async function downloadBundle() {
    if (stageRef.current !== 'idle' || individualBusy) return;
    if (!numberType) { feedback('입력한 문헌이 출원번호·공개번호·등록번호 중 어느 종류인지 선택해 주세요.', 'error'); return; }
    if (!ready.length) { feedback('조회할 국내 문헌이 없습니다. 문헌번호와 번호 종류를 확인해 주세요.', 'error'); return; }
    if (ready.length > 50) { feedback('한 번에 국내 문헌 50건까지 받을 수 있습니다. 목록을 나누어 다시 시도해 주세요.', 'error'); return; }
    setCurrentStage('choosing'); feedback(''); setProgress(0);
    const controller = new AbortController(); abort.current = controller;
    const outcomes = new Map<string, { state: 'success' | 'error'; detail: string }>();
    let savingStarted = false;
    try {
      const destination = await chooseSaveFile('심사데스크_전문PDF.zip', 'application/zip', 'zip');
      if (!destination) { feedback('저장을 취소했습니다. PDF를 조회하지 않았습니다.'); return; }
      ensureDocumentTaskActive(controller.signal);
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      setJobs(Object.fromEntries(ready.map(row => [row.key, { state: 'waiting' }])));
      setCurrentStage('collecting');
      for (const [index, row] of ready.entries()) {
        ensureDocumentTaskActive(controller.signal);
        update(row.key, { state: 'loading' });
        try {
          const blob = await fetchPdf(row.canonical, effectiveKind, numberType, AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]));
          ensureDocumentTaskActive(controller.signal);
          zip.file(documentFilename(row, numberType, effectiveKind), blob);
          outcomes.set(row.key, { state: 'success', detail: '' });
          update(row.key, { state: 'collected' });
        } catch (error) {
          if (controller.signal.aborted) { update(row.key, { state: 'cancelled' }); throw new DocumentTaskCancelled(); }
          const detail = documentErrorMessage(error);
          outcomes.set(row.key, { state: 'error', detail });
          update(row.key, { state: 'error', error: detail });
        }
        setProgress(index + 1);
      }
      ensureDocumentTaskActive(controller.signal);
      const successful = [...outcomes.values()].filter(outcome => outcome.state === 'success').length;
      if (!successful) { feedback('받을 수 있는 PDF가 없어 ZIP 파일을 저장하지 않았습니다. 각 문헌의 안내를 확인한 뒤 다시 시도해 주세요.', 'error'); return; }
      const report = rows.map(row => {
        const outcome = outcomes.get(row.key);
        const status = row.classification === 'ready' ? outcome?.state === 'success' ? 'ZIP에 포함' : '조회 실패' : rowLabels[row.classification];
        return `${row.original}\t${status}\t${row.classification === 'duplicate' ? row.detail : outcome?.detail || row.detail}`;
      });
      zip.file('다운로드 결과.txt', `입력 번호 종류: ${numberTypeLabels[numberType]}\n받을 전문: ${documentKindLabels[effectiveKind]}\n국내 문헌 ${ready.length}건 중 PDF ${successful}건 포함\n\n문헌번호\t처리 결과\t안내\n${report.join('\n')}`);
      const saved = await packAndSaveArchive({
        signal: controller.signal,
        pack: onProgress => zip.generateAsync({ type: 'blob', compression: 'STORE' }, onProgress),
        save: blob => { savingStarted = true; return writeChosenFile(destination, blob); },
        onStage: setCurrentStage,
      });
      const failed = ready.length - successful;
      feedback(`PDF ${successful}건을 ZIP에 담았습니다.${failed ? ` ${failed}건은 제외했습니다. 각 문헌의 안내를 확인해 주세요.` : ''} ${saved ?? ''}`, destination.handle ? 'success' : 'info', destination.handle ? 'ZIP 파일 저장 완료' : 'ZIP 다운로드 요청 완료');
    } catch (error) {
      if (controller.signal.aborted && !savingStarted) {
        setJobs(current => Object.fromEntries(Object.entries(current).map(([key, job]) => [key, job.state === 'loading' || job.state === 'waiting' ? { state: 'cancelled' } : job])));
        feedback('PDF 수집을 중단했습니다. ZIP 파일을 저장하지 않았습니다. 다시 받으려면 ZIP으로 받기를 눌러 주세요.');
      } else feedback(error instanceof SaveFileError || savingStarted ? fileErrorMessage(error) : documentErrorMessage(error), 'error');
    } finally { setCurrentStage('idle'); abort.current = null; }
  }
  function cancel() {
    if (canCancelArchive(stageRef.current)) { abort.current?.abort(); feedback('수집을 중단하는 중입니다. ZIP 파일을 저장하지 않습니다.'); }
  }
  const progressLabel = stage === 'choosing' ? '저장 위치를 선택해 주세요.' : stage === 'collecting' ? `국내 문헌 ${ready.length}건 중 ${progress}건을 조회했습니다.` : stage === 'packing' ? 'ZIP 파일을 만드는 중입니다.' : stage === 'saving' ? 'ZIP 파일을 저장하는 중입니다. 저장이 끝날 때까지 기다려 주세요.' : '';
  const buttonLabel = stage === 'choosing' ? '저장 위치 선택 중' : stage === 'collecting' ? `PDF 수집 중 ${progress}/${ready.length}` : stage === 'packing' ? 'ZIP 파일 생성 중' : stage === 'saving' ? 'ZIP 파일 저장 중' : numberType ? `국내 문헌 ${ready.length}건 ZIP으로 받기` : '국내 문헌 ZIP으로 받기';

  return <div className="docs-page">
    <a className="docs-skip" href="#documents-main">본문 바로가기</a>
    <header className="docs-top">
      <a href="/" className="docs-brand"><span aria-hidden="true">심</span><strong>심사데스크</strong><small>AI 검색 결과 평가</small></a>
      <nav aria-label="업무 화면"><a href="/">평가 업무로 돌아가기</a><a href="/patent">기존 사건 조회</a></nav>
    </header>
    <main id="documents-main" className="docs-content">
      <div className="docs-intro"><p className="docs-breadcrumb">심사데스크 <span aria-hidden="true">/</span> 전문 PDF</p><h1>전문 PDF 다운로드</h1><p>출원과 검색 문헌의 공보를 개별 PDF 또는 ZIP으로 받습니다.</p></div>
      <div className="docs-layout">
        <section className="docs-panel" aria-labelledby="docs-input-title">
          <div className="docs-panel-title"><span aria-hidden="true">1</span><h2 id="docs-input-title">문헌번호 입력</h2></div>
          <ul className="docs-input-guide"><li>국내 특허·실용신안 문헌을 지원합니다.</li><li>ZIP은 중복을 제외한 국내 문헌 50건까지 한 번에 받습니다.</li><li>해외 문헌은 목록의 문헌 검색에서 확인해 주세요.</li></ul>
          <div className="docs-fields">
            <label htmlFor="docs-number-type">입력 번호 종류 <span className="docs-required">필수</span><select id="docs-number-type" className="krds-form-select medium" value={numberType} disabled={busy || individualBusy} onChange={event => { setNumberType(event.target.value as PdfNumberType); clearResults(); }}><option value="" disabled>번호 종류 선택</option><option value="application">출원번호</option><option value="publication">공개번호</option><option value="registration">등록번호</option></select></label>
            <label htmlFor="docs-kind">받을 전문<select id="docs-kind" className="krds-form-select medium" value={effectiveKind} disabled={busy || individualBusy || !numberType || numberType !== 'application'} aria-describedby="docs-kind-help" onChange={event => { setKind(event.target.value as PdfKind); clearResults(); }}><option value="publication">공개공보 PDF</option><option value="registration">등록공보 PDF</option></select></label>
          </div>
          <p id="docs-kind-help" className="docs-help">공개번호와 등록번호는 각각 해당 공보를 받습니다. 서로 다른 번호 종류는 나누어 입력해 주세요.</p>
          <label className="docs-input-label" htmlFor="docs-numbers">문헌번호 <span className="docs-required">필수</span></label>
          <p id="docs-paste-help" className="docs-help">문헌번호를 한 줄에 하나씩 붙여 넣어 주세요.</p>
          <textarea id="docs-numbers" className="krds-input" rows={8} maxLength={20000} disabled={busy || individualBusy} value={input} onChange={event => { setInput(event.target.value); clearResults(); }} aria-describedby="docs-paste-help docs-number-help docs-count" placeholder={numberType === 'registration' ? '예: 10-2345678' : numberType === 'publication' ? '예: KR10-2022-0014141A' : numberType === 'application' ? '예: 10-2020-0093844' : '먼저 입력 번호 종류를 선택해 주세요.'} />
          <div className="docs-input-foot" id="docs-count"><strong>{numberType ? `조회할 국내 문헌 ${ready.length}건` : '번호 종류 선택 전'}</strong></div>
          <p id="docs-number-help" className="docs-help">같은 번호는 공백·붙임표 표기가 달라도 한 번만 조회합니다.</p>
          {rows.length > 0 && <div className="docs-summary" aria-live="polite"><span>입력 {rows.length}건</span>{foreignCount > 0 && <span>해외 {foreignCount}건</span>}{invalidCount > 0 && <span>번호 확인 {invalidCount}건</span>}{duplicateCount > 0 && <span>중복 제외 {duplicateCount}건</span>}</div>}
          {!numberType && rows.length > 0 && <p className="docs-inline-note">번호 종류를 선택하면 국내 문헌 수와 PDF 받기 버튼이 표시됩니다.</p>}
          {ready.length > 50 && <p className="docs-inline-error" role="alert">국내 문헌이 50건을 넘었습니다. 입력 목록을 나누어 받아 주세요.</p>}
          <div className="docs-actions"><button className="krds-btn medium primary" disabled={busy || individualBusy || !numberType || !ready.length || ready.length > 50} onClick={() => void downloadBundle()}>{buttonLabel}</button>{canCancelArchive(stage) && <button className="krds-btn medium secondary" onClick={cancel}>수집 중단</button>}</div>
          <p className="docs-progress" role="status" aria-live="polite" aria-atomic="true">{progressLabel}</p>
          {message && <div role={messageKind === 'error' ? 'alert' : 'status'} className={`docs-feedback ${messageKind}`}><strong>{messageTitle}</strong><p>{message}</p></div>}
          <div className="docs-note"><h3>조회·저장 안내</h3><ul><li>PDF가 제공되지 않는 문헌은 ZIP에서 제외하고 결과 파일에 사유를 남깁니다.</li><li>저장 창을 지원하지 않는 브라우저에서는 다운로드 설정에 따라 저장됩니다.</li></ul></div>
        </section>
        <section className="docs-panel docs-results" aria-labelledby="docs-results-title">
          <div className="docs-panel-title"><span aria-hidden="true">2</span><h2 id="docs-results-title">문헌별 다운로드</h2></div>
          <p className="docs-results-count" role="status" aria-live="polite">{!rows.length ? '번호 형식과 다운로드 진행 상태를 확인합니다.' : !numberType ? `입력 ${rows.length}건 · 번호 종류 선택 전` : resultCounts || (ready.length ? `국내 문헌 ${ready.length}건 · 조회 전` : '조회할 국내 문헌이 없습니다. 목록의 안내를 확인해 주세요.')}</p>
          {!rows.length ? <div className="docs-empty"><span aria-hidden="true">PDF</span><h3>입력한 문헌이 없습니다.</h3><p>문헌번호 입력란에 번호를 붙여 넣어 주세요.</p></div> : <ol className="docs-job-list">{rows.map((row, index) => {
            const job = row.classification === 'ready' ? jobs[row.key] : undefined;
            const statusTone = job?.state === 'error' || row.classification === 'invalid' ? 'error' : job?.state === 'saved' ? 'success' : row.classification === 'foreign' || row.classification === 'duplicate' || job?.state === 'cancelled' ? 'neutral' : 'primary';
            return <li key={row.id}><div className="docs-job-head"><span className="docs-job-index" aria-hidden="true">{index + 1}</span><strong>{row.original}</strong><span className={`docs-status ${statusTone}`}>{job ? jobLabels[job.state] : rowLabels[row.classification]}</span></div>
              {row.detail && row.classification !== 'needs-type' && <p className="docs-job-detail">{row.detail}</p>}
              {job?.error && job.source !== 'individual' && <p className="docs-job-error" role="alert">{job.error}</p>}
              <div className="docs-job-actions">{row.classification === 'ready' && numberType && <PdfDownloadButton key={`${row.key}:${effectiveKind}`} applicationNumber={row.canonical} numberType={numberType} kind={effectiveKind} disabled={busy || individualBusy} label="PDF 받기" onStatusChange={(value, detail) => singleStatus(row, value, detail)} />}
                {row.classification !== 'duplicate' && row.classification !== 'needs-type' && <a className="docs-source-link" href={`https://patents.google.com/?q=${encodeURIComponent(row.original)}`} target="_blank" rel="noreferrer" aria-label={`${row.original} 문헌 검색, 새 창`}>문헌 검색 <span aria-hidden="true">↗</span><span className="docs-sr-only"> (새 창)</span></a>}
              </div>
            </li>;
          })}</ol>}
        </section>
      </div>
      <footer>전문 PDF 제공: KIPRIS Plus</footer>
    </main>
  </div>;
}
