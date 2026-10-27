'use client';

import { useState } from 'react';
import { chooseSaveFile, writeChosenFile } from '../lib/save-file';
import './pdf-download.css';

export type PdfNumberType = 'application' | 'publication' | 'registration';
export type PdfKind = 'publication' | 'registration';

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
    throw new Error(payload?.error ?? `PDF 조회에 실패했습니다 (${response.status}).`);
  }
  const blob = await response.blob();
  const signature = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
  if (signature !== '%PDF-') throw new Error('정상적인 PDF 파일이 반환되지 않았습니다.');
  return blob;
}

export default function PdfDownloadButton({ applicationNumber, label = '전문 PDF ↓', kind = 'publication', numberType = 'application' }: {
  applicationNumber: string; label?: string; kind?: PdfKind; numberType?: PdfNumberType;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function download() {
    setMessage('');
    setBusy(true);
    try {
      const destination = await chooseSaveFile(`${applicationNumber.replace(/[^A-Za-z0-9-]/g, '')}_${kind === 'publication' ? '공개' : '등록'}전문.pdf`, 'application/pdf', 'pdf');
      if (!destination) return;
      const blob = await fetchPdf(applicationNumber, kind, numberType);
      setMessage(await writeChosenFile(destination, blob) ?? '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'PDF를 내려받지 못했습니다.');
    } finally { setBusy(false); }
  }
  return <span className="pd-download"><button type="button" className="pd-button" onClick={() => void download()} disabled={busy}>{busy ? 'PDF 불러오는 중…' : label}</button>{message && <span className="pd-message" role="status">{message}</span>}</span>;
}
