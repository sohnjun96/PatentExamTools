'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { chooseSaveFile, cleanFilename, fileErrorMessage, SaveFileError, writeChosenFile } from '../lib/save-file';
import { DocumentDownloadError, documentErrorMessage, documentKindLabels, documentResponseMessage } from '../lib/document-jobs';
import { fetchPdfResponse, PdfTransferFailure, transferPdf } from '../lib/pdf-transfer';
import { useErrorToast } from './error-toast';
import './pdf-download.css';

export type PdfNumberType = 'application' | 'publication' | 'registration';
export type PdfKind = 'publication' | 'registration';
export type PdfDownloadStatus = 'loading' | 'saved' | 'requested' | 'error' | 'cancelled';
export function pdfUrl(number: string, kind: PdfKind = 'publication', numberType: PdfNumberType = 'application', refresh = false) {
  const query = new URLSearchParams({ kind, numberType, download: '1' });
  if (numberType === 'application') query.set('applicationNumber', number);
  else { query.set('documentNumber', number); query.set('numberType', numberType); }
  if (refresh) query.set('refresh', '1');
  return '/api/patent/document?' + query;
}

export async function fetchPdf(number: string, kind: PdfKind, numberType: PdfNumberType = 'application', signal?: AbortSignal, refresh = false) {
  return fetchPdfResponse(pdfUrl(number, kind, numberType, refresh), {
    signal,
    responseError: (status, message) => new DocumentDownloadError(documentResponseMessage(status, message, kind)),
    invalidPdfError: () => new DocumentDownloadError('PDF 원문을 확인할 수 없습니다. 다시 시도해 주세요. 계속되면 관리자에게 문헌번호를 알려 주세요.'),
  });
}

/** List actions use browser download settings directly; other buttons keep choose-save. */
export function choosePdfDestination(applicationNumber: string, kind: PdfKind, quickDownload = false) {
  const filename = cleanFilename(`${applicationNumber.replace(/[^A-Za-z0-9-]/g, '')}_${documentKindLabels[kind]}.pdf`);
  return quickDownload ? Promise.resolve({ handle: null, filename }) : chooseSaveFile(filename, 'application/pdf', 'pdf');
}

export default function PdfDownloadButton({ applicationNumber, label = 'PDF 받기', ariaLabel, kind = 'publication', numberType = 'application', disabled = false, quickDownload = false, onStatusChange }: {
  applicationNumber: string; label?: string; kind?: PdfKind; numberType?: PdfNumberType; disabled?: boolean;
  ariaLabel?: string;
  quickDownload?: boolean;
  onStatusChange?: (status: PdfDownloadStatus, message?: string) => void;
}) {
  const [stage, setStage] = useState<'idle' | 'choosing' | 'loading' | 'saving'>('idle');
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'info' | 'success' | 'error'>('info');
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const button = useRef<HTMLButtonElement | null>(null);
  const messageId = useId();
  const { enabled: hasErrorToast, showError } = useErrorToast();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  async function download() {
    setMessage(''); setMessageKind('info'); setStage('choosing'); onStatusChange?.('loading');
    try {
      const result = await transferPdf({
        choose: () => choosePdfDestination(applicationNumber, kind, quickDownload),
        fetch: () => {
          const abort = new AbortController(); controller.current = abort;
          return fetchPdf(applicationNumber, kind, numberType, AbortSignal.any([abort.signal, AbortSignal.timeout(90_000)]));
        },
        save: writeChosenFile,
        onStage: setStage,
        isActive: () => mounted.current,
      });
      if (!mounted.current) return;
      setMessage(result.message); setMessageKind(result.status === 'saved' ? 'success' : 'info'); onStatusChange?.(result.status, result.message);
    } catch (error) {
      if (!mounted.current) return;
      const original = error instanceof PdfTransferFailure ? error.originalError : error;
      const detail = (error instanceof PdfTransferFailure && error.stage !== 'loading') || original instanceof SaveFileError ? fileErrorMessage(original) : documentErrorMessage(original);
      setMessage(detail); setMessageKind('error'); onStatusChange?.('error', detail);
      showError({ documentNumber: applicationNumber, documentKind: documentKindLabels[kind], message: detail, returnFocus: button.current });
    } finally { if (mounted.current) setStage('idle'); controller.current = null; }
  }
  const loadingLabel = stage === 'choosing' && !quickDownload ? '저장 위치 선택 중' : stage === 'saving' ? '저장 중…' : 'PDF 불러오는 중…';
  return <span className="pd-download">
    <button type="button" ref={button} className="pd-button krds-btn medium tertiary" onClick={() => void download()} disabled={disabled || stage !== 'idle'} aria-describedby={message ? messageId : undefined} aria-busy={stage !== 'idle'} aria-label={ariaLabel ?? `${applicationNumber} ${documentKindLabels[kind]} PDF 받기`}>{stage !== 'idle' ? loadingLabel : label}</button>
    {message && <span id={messageId} className={`pd-message is-${messageKind}`} role={messageKind === 'error' ? hasErrorToast ? undefined : 'alert' : 'status'}>{message}</span>}
  </span>;
}
