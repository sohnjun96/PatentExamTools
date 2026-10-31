'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import AppIcon from '@/app/components/app-icon';
import { LITERATURE_FORMAT_PROMPT, LITERATURE_IMPORT_EXAMPLE, LITERATURE_REPORT_MAX_LENGTH, LITERATURE_REPORT_TABLE_TEMPLATE, normalizeLiteratureDocuments, parseLiteratureImport, type LiteratureDocument, type ResultDraftEditorState } from '@/app/lib/evaluation';
import LiteratureReader from './literature-reader';
import './result-editor.css';

export type { ResultDraftEditorState } from '@/app/lib/evaluation';
type Props = { initialDocuments: LiteratureDocument[]; initialBulkInput?: string; disabled: boolean; dirty: (value: boolean) => void; onSave: (documents: LiteratureDocument[], publish: boolean) => Promise<boolean>; onAutoSave?: (snapshot: ResultDraftEditorState) => Promise<boolean>; deadline?: string; published?: boolean };
type Row = { id: number; document: LiteratureDocument; previousKinds?: Partial<Record<LiteratureDocument['kind'], LiteratureDocument>> };
type AutoSaveStatus = 'idle' | 'waiting' | 'saving' | 'saved' | 'error';
const autoSaveLabels: Record<AutoSaveStatus, string> = {
  idle: '입력 내용이 자동 저장됩니다.', waiting: '입력 내용 저장 대기 중', saving: '자동 저장 중…', saved: '자동 저장됨', error: '자동 저장하지 못했습니다. 입력 내용은 유지됩니다.',
};
const fields: { key: keyof LiteratureDocument; label: string; wide?: boolean }[] = [
  { key: 'authors', label: '저자명', wide: true }, { key: 'title', label: '논문명·문서 제목', wide: true }, { key: 'publication', label: '간행물명', wide: true },
  { key: 'publicationPlace', label: '발행장소' }, { key: 'publisher', label: '발행처' }, { key: 'publicationDate', label: '발행연월일' },
  { key: 'volume', label: '권수' }, { key: 'issue', label: '호수' }, { key: 'pages', label: '페이지' }, { key: 'acquiredDate', label: '입수일' }, { key: 'dateNote', label: '입수일 기재 사유', wide: true },
];
const message = (error: unknown) => error instanceof Error ? error.message : '입력한 문헌 정보를 확인해 주세요.';

export default function LiteratureEditor({ initialDocuments, initialBulkInput = '', disabled, dirty, onSave, onAutoSave }: Props) {
  const editorId = useId();
  const nextId = useRef(initialDocuments.length);
  const saving = useRef(false);
  const reportInput = useRef<HTMLTextAreaElement>(null);
  const [rows, setRows] = useState<Row[]>(() => initialDocuments.map((document, id) => ({ id, document: { ...document } })));
  const rowsRef = useRef(rows);
  const [bulkInput, setBulkInput] = useState(initialBulkInput);
  const latestDraft = useRef<ResultDraftEditorState>({ documents: initialDocuments.map(document => ({ ...document })), bulkInput: initialBulkInput });
  const callbacks = useRef({ onSave, onAutoSave, dirty });
  const mounted = useRef(true);
  const lifecycle = useRef(0);
  const disabledRef = useRef(disabled);
  const editVersion = useRef(0);
  const savedVersion = useRef(0);
  const autoRequest = useRef<Promise<boolean> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoReady = useRef(false);
  const autoFailed = useRef(false);
  const [draftRevision, setDraftRevision] = useState(0);
  const [autoStatus, setAutoStatus] = useState<AutoSaveStatus>('idle');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(initialDocuments.length ? 0 : null);
  const [mode, setMode] = useState<'bulk' | 'single'>('bulk');
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const autosaveEnabled = Boolean(onAutoSave);
  const blocked = disabled || pending;
  const selected = rows.find(row => row.id === selectedId) || rows[0];
  let imported: LiteratureDocument[] = [], importError = '';
  if (bulkInput.trim()) {
    try { imported = parseLiteratureImport(bulkInput); normalizeLiteratureDocuments([...rows.map(row => row.document), ...imported], true); }
    catch (cause) { importError = message(cause); }
  }
  useEffect(() => { callbacks.current = { onSave, onAutoSave, dirty }; }, [onSave, onAutoSave, dirty]);
  useEffect(() => {
    mounted.current = true;
    lifecycle.current += 1;
    return () => {
      mounted.current = false;
      lifecycle.current += 1;
      autoReady.current = false;
      if (autoTimer.current !== null) clearTimeout(autoTimer.current);
      autoTimer.current = null;
    };
  }, []);
  useEffect(() => {
    disabledRef.current = disabled;
    if (disabled || !autosaveEnabled) {
      autoReady.current = false;
      if (autoTimer.current !== null) clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
  }, [disabled, autosaveEnabled]);

  const runAutoSave = useCallback(function run(force = false): Promise<boolean> {
    if (autoRequest.current) return autoRequest.current;
    const callback = callbacks.current.onAutoSave;
    if (!mounted.current || disabledRef.current || saving.current || !callback || editVersion.current <= savedVersion.current || autoFailed.current && !force) return Promise.resolve(false);
    const version = editVersion.current, epoch = lifecycle.current;
    const snapshot: ResultDraftEditorState = { documents: latestDraft.current.documents.map(document => ({ ...document })), bulkInput: latestDraft.current.bulkInput };
    autoReady.current = false;
    setAutoStatus('saving');
    function fail() {
      if (!mounted.current || lifecycle.current !== epoch) return;
      autoFailed.current = true;
      autoReady.current = false;
      if (autoTimer.current !== null) clearTimeout(autoTimer.current);
      autoTimer.current = null;
      setAutoStatus('error');
    }
    const request = Promise.resolve().then(() => callback(snapshot)).then(ok => {
      if (!mounted.current || lifecycle.current !== epoch) return ok;
      if (!ok) { fail(); return false; }
      savedVersion.current = Math.max(savedVersion.current, version);
      autoFailed.current = false;
      if (editVersion.current === version) { callbacks.current.dirty(false); setAutoStatus('saved'); }
      else setAutoStatus('waiting');
      return true;
    }, () => { fail(); return false; }).finally(() => {
      if (autoRequest.current === request) autoRequest.current = null;
      if (mounted.current && lifecycle.current === epoch && autoReady.current && !autoFailed.current && !saving.current && !disabledRef.current && editVersion.current > savedVersion.current) void run();
    });
    autoRequest.current = request;
    return request;
  }, []);

  useEffect(() => {
    if (!autosaveEnabled || disabled || draftRevision === 0 || editVersion.current <= savedVersion.current || autoFailed.current || saving.current) return;
    const timer = setTimeout(() => {
      if (autoTimer.current === timer) autoTimer.current = null;
      autoReady.current = true;
      void runAutoSave();
    }, 800);
    autoTimer.current = timer;
    return () => { clearTimeout(timer); if (autoTimer.current === timer) autoTimer.current = null; };
  }, [draftRevision, disabled, autosaveEnabled, runAutoSave]);

  function mark(nextRows = rowsRef.current, nextBulkInput = latestDraft.current.bulkInput) {
    rowsRef.current = nextRows;
    latestDraft.current = { documents: nextRows.map(row => ({ ...row.document })), bulkInput: nextBulkInput };
    editVersion.current += 1;
    autoFailed.current = false;
    autoReady.current = false;
    if (autoTimer.current !== null) clearTimeout(autoTimer.current);
    autoTimer.current = null;
    setDraftRevision(editVersion.current);
    setAutoStatus(callbacks.current.onAutoSave ? 'waiting' : 'idle');
    setError(''); callbacks.current.dirty(true);
  }
  function changeRows(nextRows: Row[]) { setRows(nextRows); mark(nextRows); }
  function changeBulkInput(value: string) {
    if (blocked || saving.current) return;
    setBulkInput(value); mark(rowsRef.current, value);
  }
  function retryAutoSave() {
    if (blocked || saving.current || autoRequest.current) return;
    autoFailed.current = false;
    autoReady.current = true;
    if (autoTimer.current !== null) clearTimeout(autoTimer.current);
    autoTimer.current = null;
    void runAutoSave(true);
  }
  function insertReportTable() {
    if (blocked || saving.current || !selected) return;
    const textarea = reportInput.current;
    const value = selected.document.reportMarkdown || '';
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? start;
    const before = value.slice(0, start), after = value.slice(end);
    const prefix = before && !before.endsWith('\n\n') ? before.endsWith('\n') ? '\n' : '\n\n' : '';
    const suffix = after && !after.startsWith('\n\n') ? after.startsWith('\n') ? '\n' : '\n\n' : '';
    const next = `${before}${prefix}${LITERATURE_REPORT_TABLE_TEMPLATE}${suffix}${after}`;
    if (next.length > LITERATURE_REPORT_MAX_LENGTH) { setError('표를 추가하면 보고서의 30,000자 제한을 넘습니다. 내용을 줄인 뒤 다시 추가해 주세요.'); return; }
    update(selected.id, { reportMarkdown: next });
    if (textarea && typeof requestAnimationFrame === 'function') requestAnimationFrame(() => {
      if (reportInput.current !== textarea) return;
      textarea.focus();
      const cursor = before.length + prefix.length + LITERATURE_REPORT_TABLE_TEMPLATE.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }
  function update(id: number, patch: Partial<LiteratureDocument>) {
    if (blocked || saving.current) return;
    changeRows(rowsRef.current.map(row => row.id === id ? { ...row, document: { ...row.document, ...patch } } : row));
  }
  function add() {
    if (blocked || saving.current || rowsRef.current.length >= 7) return;
    const id = nextId.current++;
    changeRows([...rowsRef.current, { id, document: { kind: 'patent', number: '' } }]); setSelectedId(id); setMode('single');
  }
  function openAutomaticAdd() {
    if (blocked || saving.current || rows.length >= 7) return;
    setMode('bulk');
  }
  function remove(id: number) {
    if (blocked || saving.current) return;
    const index = rowsRef.current.findIndex(row => row.id === id), next = rowsRef.current.filter(row => row.id !== id);
    changeRows(next); if (selected?.id === id) setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? null);
  }
  function changeKind(id: number, kind: LiteratureDocument['kind']) {
    if (blocked || saving.current) return;
    changeRows(rowsRef.current.map(row => {
      if (row.id !== id) return row;
      const previousKinds = { ...row.previousKinds, [row.document.kind]: row.document };
      const restored = previousKinds[kind] || { kind, number: kind === 'patent' && row.document.kind === 'legacy' ? row.document.number : '', ...(kind === 'non-patent' && row.document.kind === 'legacy' ? { title: row.document.number } : {}) };
      return { ...row, previousKinds, document: { ...restored, url: row.document.url, reportMarkdown: row.document.reportMarkdown } };
    }));
  }
  function appendImport() {
    if (blocked || saving.current || !bulkInput.trim() || importError) return;
    try {
      const existing = rowsRef.current;
      const documents = normalizeLiteratureDocuments([...existing.map(row => row.document), ...imported], true);
      const next = documents.map((document, index) => ({ ...existing[index], id: existing[index]?.id ?? nextId.current++, document }));
      setRows(next); setSelectedId(next[existing.length]?.id ?? null); setBulkInput(''); setMode('single'); mark(next, '');
    } catch (cause) { setError(message(cause)); }
  }
  async function save(publish: boolean) {
    if (blocked || saving.current) return;
    if (latestDraft.current.bulkInput.trim()) { setMode('bulk'); setError('입력한 일괄 결과를 목록에 추가하거나 입력란을 비운 뒤 저장해 주세요.'); return; }
    try {
      const documents = normalizeLiteratureDocuments(latestDraft.current.documents, !publish);
      saving.current = true; setPending(true); setError('');
      autoReady.current = false;
      if (autoTimer.current !== null) clearTimeout(autoTimer.current);
      autoTimer.current = null;
      if (autoRequest.current) await autoRequest.current;
      if (!mounted.current || disabledRef.current) return;
      if (await callbacks.current.onSave(documents, publish) && mounted.current) {
        const next = documents.map((document, index) => ({ ...rowsRef.current[index], id: rowsRef.current[index]?.id ?? nextId.current++, document }));
        rowsRef.current = next; setRows(next); setBulkInput('');
        latestDraft.current = { documents: documents.map(document => ({ ...document })), bulkInput: '' };
        savedVersion.current = editVersion.current;
        autoFailed.current = false; setAutoStatus('saved'); callbacks.current.dirty(false);
      }
    } catch (cause) { if (mounted.current) setError(message(cause)); }
    finally { saving.current = false; if (mounted.current) setPending(false); }
  }
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(LITERATURE_FORMAT_PROMPT); setCopied(true); }
    catch { setPromptOpen(true); }
  }
  const prefix = `${editorId}-document-${selected?.id ?? 'empty'}`;
  const document = selected?.document;
  return <div className="lit-editor tw-input">
    <div className="tw-input-layout"><aside className="tw-docnav" aria-label="입력 문헌"><h2>검색 문헌 <span className="tw-doc-count">{rows.length}/7</span></h2><ol>{rows.map((row, index) => <li key={row.id} className="tw-editable-doc"><button type="button" className="tw-doc-choice" aria-pressed={selected?.id === row.id && mode === 'single'} disabled={pending} onClick={() => { setSelectedId(row.id); setMode('single'); }}><small>{String(index + 1).padStart(2, '0')} · {row.document.kind === 'non-patent' ? '비특허' : row.document.kind === 'patent' ? '특허' : '문헌'}</small><strong>{row.document.kind === 'non-patent' ? row.document.title || row.document.number || '새 문헌' : row.document.number || '새 문헌'}</strong>{row.document.authors && <span>{row.document.authors}</span>}</button><button className="tw-remove" type="button" aria-label={`${row.document.number || `문헌 ${index + 1}`} 삭제`} disabled={blocked} onClick={() => remove(row.id)}>삭제</button></li>)}</ol>{!rows.length && <p className="tw-empty">등록된 문헌이 없습니다.</p>}<div className="tw-add-actions"><button className="ev-button tw-add" type="button" disabled={blocked || rows.length >= 7} onClick={add}><AppIcon name="document-text" />수동 추가</button><button className="ev-button tw-add" type="button" disabled={blocked || rows.length >= 7} onClick={openAutomaticAdd}><AppIcon name="clipboard-list" />자동 추가</button></div></aside>
      <main className="tw-input-work"><div className="tw-input-toolbar"><button type="button" className="tw-prompt-toggle" aria-expanded={promptOpen} disabled={pending} onClick={() => setPromptOpen(value => !value)}>포맷팅 프롬프트</button></div>
        {promptOpen && <section className="tw-panel tw-prompt"><h2>결과 포맷팅 프롬프트</h2><textarea aria-label="결과 포맷팅 프롬프트" readOnly rows={8} value={LITERATURE_FORMAT_PROMPT} /><button type="button" className="ev-button tiny" onClick={() => void copyPrompt()}>{copied ? '복사됨' : '프롬프트 복사'}</button></section>}
        <section className="tw-panel tw-import" hidden={mode !== 'bulk'} aria-label="한꺼번에 입력"><h2>AI 검색 결과 붙여넣기</h2><div className="tw-bulk-columns"><label htmlFor={`${editorId}-bulk`}>AI 검색 결과 JSON<textarea id={`${editorId}-bulk`} className="lit-code" rows={15} value={bulkInput} placeholder={LITERATURE_IMPORT_EXAMPLE} spellCheck={false} disabled={blocked} maxLength={600000} onChange={event => changeBulkInput(event.target.value)} /></label><section aria-label="자동 입력 미리보기"><h3>추가할 문헌 미리보기{imported.length > 0 && ` · ${imported.length}건`}</h3>{imported.length ? <ol className="tw-import-preview">{imported.map((entry, index) => <li key={index}><small>{String(index + 1).padStart(2, '0')} · {entry.kind === 'patent' ? '특허문헌' : '비특허문헌'}</small><strong>{entry.kind === 'non-patent' ? entry.title : entry.number}</strong>{entry.authors && <span>{entry.authors}</span>}{entry.reportMarkdown && <small>문헌별 보고서 포함</small>}</li>)}</ol> : <p className="tw-empty">미리볼 문헌이 없습니다.</p>}</section></div>{importError && <p className="lit-error" role="alert">{importError}</p>}<div className="tw-import-actions">{bulkInput && <button type="button" className="ev-button" disabled={blocked} onClick={() => changeBulkInput('')}>입력란 비우기</button>}<button type="button" className="ev-button primary" disabled={blocked || !imported.length || Boolean(importError)} onClick={appendImport}>기존 목록에{imported.length ? ` ${imported.length}문헌` : ''} 추가</button></div></section>
        <section hidden={mode !== 'single'} aria-label="하나씩 입력">{selected && document ? <><h2 className="tw-single-heading">문헌 {rows.findIndex(row => row.id === selected.id) + 1} 편집</h2><div className="tw-edit-columns"><section className="tw-panel tw-edit-form"><h3>문헌 정보</h3><fieldset className="lit-document" key={selected.id} disabled={blocked}><legend className="sr-only">문헌 정보 입력</legend><label htmlFor={`${prefix}-kind`}>문헌 종류<select id={`${prefix}-kind`} value={document.kind} disabled={blocked} onChange={event => changeKind(selected.id, event.target.value as LiteratureDocument['kind'])}><option value="patent">특허문헌</option><option value="non-patent">비특허문헌</option>{(document.kind === 'legacy' || selected.previousKinds?.legacy) && <option value="legacy">기존 문헌</option>}</select></label>
          {document.kind !== 'non-patent' && <label htmlFor={`${prefix}-number`}>{document.kind === 'patent' ? '특허 문헌번호' : '문헌·서지정보'}<input id={`${prefix}-number`} value={document.number} maxLength={2000} disabled={blocked} placeholder="KR20100001234A" onChange={event => update(selected.id, { number: event.target.value })} /></label>}
          {document.kind === 'non-patent' && <><label htmlFor={`${prefix}-title`}>논문명·문서 제목<input id={`${prefix}-title`} value={document.title || ''} maxLength={2000} disabled={blocked} onChange={event => update(selected.id, { title: event.target.value })} /></label><details><summary>서지정보 입력</summary><div className="lit-field-grid">{fields.filter(field => field.key !== 'title').map(field => <label className={field.wide ? 'lit-field-wide' : undefined} key={field.key} htmlFor={`${prefix}-${field.key}`}>{field.label}<input id={`${prefix}-${field.key}`} value={document[field.key] || ''} maxLength={2000} disabled={blocked} onChange={event => update(selected.id, { [field.key]: event.target.value })} /></label>)}</div></details></>}
          <label htmlFor={`${prefix}-url`}>원문 URL<input id={`${prefix}-url`} type="url" value={document.url || ''} maxLength={2000} disabled={blocked} placeholder="https://…" spellCheck={false} onChange={event => update(selected.id, { url: event.target.value })} /></label><div className="lit-report-heading"><label htmlFor={`${prefix}-report`}>문헌별 보고서 (마크다운)</label><button type="button" className="ev-button tiny" disabled={blocked} onClick={insertReportTable}>표 삽입</button></div><p id={`${prefix}-report-help`} className="lit-report-help">제목·목록·마크다운 표를 지원합니다. 표는 헤더 다음 줄에 | --- | 구분선을 넣고 앞뒤를 빈 줄로 띄워 주세요. 오른쪽 미리보기에서 확인할 수 있으며, 넓은 표는 가로로 스크롤합니다.</p><textarea ref={reportInput} id={`${prefix}-report`} aria-describedby={`${prefix}-report-help`} className="lit-code" rows={14} value={document.reportMarkdown || ''} maxLength={LITERATURE_REPORT_MAX_LENGTH} disabled={blocked} placeholder={LITERATURE_REPORT_TABLE_TEMPLATE} onChange={event => update(selected.id, { reportMarkdown: event.target.value })} /></fieldset></section><section className="tw-panel tw-live-preview" aria-label="심사관 화면 미리보기"><h3>심사관 화면 미리보기</h3><LiteratureReader preview document={document} /></section></div></> : <div className="tw-empty">문헌 목록이 비어 있습니다.</div>}</section>
      </main></div>
    <footer className="tw-footer">{error && <p className="lit-error" role="alert">{error}</p>}{autosaveEnabled && <div className={`lit-autosave lit-autosave-${autoStatus}`}><p role={autoStatus === 'error' ? 'alert' : 'status'} aria-live="polite">{autoSaveLabels[autoStatus]}</p>{autoStatus === 'error' && <button type="button" className="ev-button tiny" disabled={blocked} onClick={retryAutoSave}>자동 저장 다시 시도</button>}</div>}<div className="ev-actions">{!autosaveEnabled && <button type="button" className="ev-button" disabled={blocked} onClick={() => void save(false)}>{pending ? '저장 중…' : '임시저장'}</button>}<button type="button" className="ev-button primary" disabled={blocked || !rows.length} onClick={() => void save(true)}>{pending ? '저장 중…' : '입력 완료'}</button></div></footer>
  </div>;
}
