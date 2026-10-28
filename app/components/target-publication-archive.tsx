'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { fetchPdf } from './pdf-download';
import { chooseSaveFile, cleanFilename, fileErrorMessage, SaveFileError, writeChosenFile } from '../lib/save-file';
import { canCancelArchive, documentErrorMessage, ensureDocumentTaskActive, packAndSaveArchive, type ArchiveStage } from '../lib/document-jobs';
import { collectTargetPublications, uniquePublicationTargets, type PublicationOutcome } from '../lib/target-publication-archive';
import './target-publication-archive.css';

export default function TargetPublicationArchive({ applicationNumbers, monthId, bureau, disabled = false }: {
  applicationNumbers: string[]; monthId: string; bureau?: string; disabled?: boolean;
}) {
  const targets = uniquePublicationTargets(applicationNumbers);
  const [refresh, setRefresh] = useState(false);
  const [stage, setStage] = useState<ArchiveStage>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState<PublicationOutcome[]>([]);
  const stageRef = useRef<ArchiveStage>('idle');
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const messageId = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort(); }; }, []);
  function changeStage(value: ArchiveStage) { stageRef.current = value; if (mounted.current) setStage(value); }
  async function download() {
    if (disabled || !targets.length || stageRef.current !== 'idle') return;
    changeStage('choosing'); setMessage(''); setFailed([]); setProgress(0);
    const controller = new AbortController(); abort.current = controller;
    let saving = false;
    try {
      const filename = cleanFilename(`${bureau ? bureau + '_' : ''}${monthId}_담당출원_공개공보.zip`);
      const destination = await chooseSaveFile(filename, 'application/zip', 'zip');
      if (!destination) { if (mounted.current) setMessage('다운로드를 취소했습니다.'); return; }
      ensureDocumentTaskActive(controller.signal);
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      changeStage('collecting');
      const outcomes = await collectTargetPublications({
        applicationNumbers: targets, signal: controller.signal,
        fetchPdf: (number, signal) => fetchPdf(number, 'publication', 'application', AbortSignal.any([signal, AbortSignal.timeout(90_000)]), refresh),
        addFile: (name, blob) => { zip.file(name, blob); },
        onProgress: completed => { if (mounted.current) setProgress(completed); },
      });
      const failures = outcomes.filter(outcome => !outcome.success);
      const successful = outcomes.length - failures.length;
      if (mounted.current) setFailed(failures);
      if (!successful) { if (mounted.current) setMessage('받을 수 있는 공개공보가 없습니다. 아래 실패 사유를 확인해 주세요.'); return; }
      zip.file('다운로드 결과.txt', `운영월: ${monthId}\n담당 출원 ${targets.length}건 중 공개공보 ${successful}건 포함\n\n출원번호\t처리 결과\t안내\n${outcomes.map(outcome => `${outcome.applicationNumber}\t${outcome.success ? 'ZIP에 포함' : '조회 실패'}\t${outcome.message}`).join('\n')}`);
      const result = await packAndSaveArchive({
        signal: controller.signal,
        pack: onProgress => zip.generateAsync({ type: 'blob', compression: 'STORE' }, onProgress),
        save: blob => { saving = true; return writeChosenFile(destination, blob); },
        onStage: changeStage,
      });
      if (mounted.current) setMessage(`공개공보 ${successful}건을 ZIP에 담았습니다.${failures.length ? ` 조회 실패 ${failures.length}건은 제외했습니다.` : ''} ${result ?? ''}`);
    } catch (error) {
      if (mounted.current) setMessage(controller.signal.aborted && !saving ? '수집을 중단했습니다. ZIP 파일을 저장하지 않았습니다.' : error instanceof SaveFileError || saving ? fileErrorMessage(error) : documentErrorMessage(error));
    } finally { changeStage('idle'); abort.current = null; }
  }
  const busy = stage !== 'idle';
  const label = stage === 'choosing' ? '저장 위치 선택 중' : stage === 'collecting' ? `공개공보 수집 중 ${progress}/${targets.length}` : stage === 'packing' ? 'ZIP 생성 중…' : stage === 'saving' ? 'ZIP 저장 중…' : `전체 공개공보 ZIP 받기 (${targets.length}건)`;
  return <section className="target-publication-archive" aria-label="담당 출원 공개공보 일괄 다운로드" aria-busy={busy}>
    <div className="target-publication-archive-actions">
      <button type="button" className="krds-btn medium ev-button primary" disabled={disabled || busy || !targets.length} aria-describedby={message ? messageId : undefined} onClick={() => void download()}>{label}</button>
      <label><input type="checkbox" checked={refresh} disabled={disabled || busy || !targets.length} onChange={event => setRefresh(event.target.checked)} />원본 다시 조회</label>
      {canCancelArchive(stage) && <button type="button" className="krds-btn medium ev-button" onClick={() => abort.current?.abort()}>중단</button>}
    </div>
    {message && <p id={messageId} role="status">{message}</p>}
    {failed.length > 0 && <details><summary>조회 실패 {failed.length}건</summary><ul>{failed.map(outcome => <li key={outcome.applicationNumber}><strong>{outcome.applicationNumber}</strong> {outcome.message}</li>)}</ul></details>}
  </section>;
}
