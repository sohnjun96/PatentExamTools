'use client';

import PdfDownloadButton from './pdf-download';

/** Always download this target application's published gazette, independently of search results. */
export default function TargetPublicationDownload({ applicationNumber, disabled = false, context = 'list', showContext = true }: {
  applicationNumber: string;
  disabled?: boolean;
  context?: 'list' | 'detail';
  showContext?: boolean;
}) {
  return <span className={`pd-target-publication is-${context}`}>
    {showContext && <span className="pd-target-publication-context">대상 출원 {applicationNumber}</span>}
    <PdfDownloadButton
      applicationNumber={applicationNumber}
      numberType="application"
      kind="publication"
      quickDownload
      disabled={disabled}
      label={context === 'list' ? '공개공보 PDF 받기' : '대상 출원 공개공보 PDF'}
      ariaLabel={`대상 출원 ${applicationNumber} 공개공보 PDF 받기`}
    />
  </span>;
}
