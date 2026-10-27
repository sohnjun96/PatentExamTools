'use client';

import { useEffect, useRef, useState } from 'react';
import { chooseSaveFile, fileErrorMessage, SaveFileError, writeChosenFile } from '../lib/save-file';
import { DocumentDownloadError, documentErrorMessage, documentKindLabels, documentResponseMessage } from '../lib/document-jobs';
import './pdf-download.css';

export type PdfNumberType = 'application' | 'publication' | 'registration';
export type PdfKind = 'publication' | 'registration';
export type PdfDownloadStatus = 'loading' | 'saved' | 'requested' | 'error' | 'cancelled';
export function pdfUrl(number: string, kind: PdfKind = 'publication', numberType: PdfNumberType = 'application') {
  const query = new URLSearchParams({ kind, download: '1' });
  if (numberType === 'application') query.set('applicationNumber', number);
  else { query.set('documentNumber', number); query.set('numberType', numberType); }
  return '/api/patent/document?' + query;
}

export async function fetchPdf(number: string, kind: PdfKind, numberType: PdfNumberType = 'application', signal?: AbortSignal) {
  const response = await fetch(pdfUrl(number, kind, numberType), { signal: signal ?? AbortSignal.timeout(90_000) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new DocumentDownloadError(documentResponseMessage(response.status, payload?.error ?? '', kind));
  }
  const blob = await response.blob();
  const signature = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
  if (signature !== '%PDF-') throw new DocumentDownloadError('PDF 원문을 확인할 수 없습니다. 다시 시도해 주세요. 계속되면 관리자에게 문헌번호를 알려 주세요.');
  return blob;
}

export default function PdfDownloadButton({ applicationNumber, label = 'PDF 받기', kind = 'publication', numberType = 'application', disabled = false, onStatusChange }: {
  applicationNumber: string; label?: string; kind?: PdfKind; numberType?: PdfNumberType; disabled?: boolean;
  onStatusChange?: (status: PdfDownloadStatus, message?: string) => void;
}) {
  const [stage, setStage] = useState<'idle' | 'choosing' | 'loading' | 'saving'>('idle');
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'info' | 'success' | 'error'>('info');
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  async function download() {
    setMessage(''); setMessageKind('info'); setStage('choosing'); onStatusChange?.('loading');
    let saving = false;
    try {
      const destination = await chooseSaveFile(`${applicationNumber.replace(/[^A-Za-z0-9-]/g, '')}_${documentKindLabels[kind]}.pdf`, 'application/pdf', 'pdf');
      if (!destination) { if (mounted.current) { setMessage('다운로드를 취소했습니다.'); onStatusChange?.('cancelled'); } return; }
      const abort = new AbortController(); controller.current = abort;
      if (!mounted.current) { abort.abort(); return; }
      setStage('loading');
      const blob = await fetchPdf(applicationNumber, kind, numberType, AbortSignal.any([abort.signal, AbortSignal.timeout(90_000)]));
      if (!mounted.current) return;
      setStage('saving'); saving = true;
      const result = await writeChosenFile(destination, blob);
      if (!mounted.current) return;
      setMessage(result ?? ''); setMessageKind(destination.handle ? 'success' : 'info'); onStatusChange?.(destination.handle ? 'saved' : 'requested', result ?? '');
    } catch (error) {
      if (!mounted.current) return;
      const detail = saving || error instanceof SaveFileError ? fileErrorMessage(error) : documentErrorMessage(error);
      setMessage(detail); setMessageKind('error'); onStatusChange?.('error', detail);
    } finally { if (mounted.current) setStage('idle'); controller.current = null; }
  }
  const loadingLabel = stage === 'choosing' ? '저장 위치 선택 중' : stage === 'saving' ? '저장 중…' : 'PDF 불러오는 중…';
  return <span className="pd-download">
    <button type="button" className="pd-button krds-btn medium tertiary" onClick={() => void download()} disabled={disabled || stage !== 'idle'} aria-label={`${applicationNumber} ${documentKindLabels[kind]} PDF 받기`}>{stage !== 'idle' ? loadingLabel : label}</button>
    {message && <span className={`pd-message is-${messageKind}`} role={messageKind === 'error' ? 'alert' : 'status'}>{message}</span>}
  </span>;
}
