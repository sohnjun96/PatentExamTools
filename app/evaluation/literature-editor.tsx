'use client';

import { useId, useRef, useState } from 'react';
import NoticeMarkdown from '@/app/components/notice-markdown';
import {
  LITERATURE_FORMAT_PROMPT, LITERATURE_IMPORT_EXAMPLE, LITERATURE_REPORT_MAX_LENGTH,
  normalizeLiteratureDocuments, parseLiteratureImport, type LiteratureDocument,
} from '@/app/lib/evaluation';
import './literature-editor.css';

type Props = {
  initialDocuments: LiteratureDocument[];
  disabled: boolean;
  dirty: (value: boolean) => void;
  onSave: (documents: LiteratureDocument[], publish: boolean) => Promise<boolean>;
  deadline?: string;
  published?: boolean;
};
type Row = { id: number; document: LiteratureDocument; previousKinds?: Partial<Record<LiteratureDocument['kind'], LiteratureDocument>> };
type BibliographicField = {
  key: keyof LiteratureDocument;
  label: string;
  placeholder?: string;
  wide?: boolean;
};

const fields: BibliographicField[] = [
  { key: 'authors', label: '저자명', placeholder: '원문 표기로 입력 (예: Kim, J.; Lee, S.)', wide: true },
  { key: 'title', label: '논문명·문서 제목', placeholder: '문헌의 원문 제목', wide: true },
  { key: 'publication', label: '간행물명', placeholder: '학술지·책·보고서 이름', wide: true },
  { key: 'publicationPlace', label: '발행장소', placeholder: '예: 서울' },
  { key: 'publisher', label: '발행처', placeholder: '출판사·학회·발행기관' },
  { key: 'publicationDate', label: '발행연월일', placeholder: '예: 2024-03-15 또는 2024-03' },
  { key: 'volume', label: '권수', placeholder: '예: 제10권 또는 Vol. 10' },
  { key: 'issue', label: '호수', placeholder: '예: 제3호 또는 No. 3' },
  { key: 'pages', label: '페이지', placeholder: '예: 101–125 또는 pp 1–8' },
  { key: 'acquiredDate', label: '입수일', placeholder: '발행일 불명 시 예: 2024-04-01' },
  { key: 'dateNote', label: '입수일 기재 사유', placeholder: '예: 발행연월일 불명으로 입수일 기재' },
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '입력한 문헌 정보를 확인해 주세요.';
}

export default function LiteratureEditor({ initialDocuments, disabled, dirty, onSave, deadline, published }: Props) {
  const editorId = useId();
  const nextId = useRef(initialDocuments.length);
  const saving = useRef(false);
  const [rows, setRows] = useState<Row[]>(() => initialDocuments.map((document, id) => ({ id, document: { ...document } })));
  const [bulkInput, setBulkInput] = useState('');
  const [error, setError] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [pending, setPending] = useState(false);
  const blocked = disabled || pending;
  let imported: LiteratureDocument[] = [];
  let importError = '';
  if (bulkInput.trim()) {
    try { imported = parseLiteratureImport(bulkInput); }
    catch (cause) { importError = errorMessage(cause); }
  }

  function update(id: number, patch: Partial<LiteratureDocument>) {
    if (blocked) return;
    setRows((previous) => previous.map((row) => row.id === id ? { ...row, document: { ...row.document, ...patch } } : row));
    setError('');
    dirty(true);
  }

  function add(kind: 'patent' | 'non-patent') {
    if (blocked || rows.length >= 7) return;
    setRows((previous) => [...previous, { id: nextId.current++, document: { kind, number: '' } }]);
    setError('');
    dirty(true);
  }

  function changeKind(id: number, kind: LiteratureDocument['kind']) {
    if (blocked) return;
    setRows((previous) => previous.map((row) => {
      if (row.id !== id) return row;
      const previousKinds = { ...row.previousKinds, [row.document.kind]: row.document };
      const restored = previousKinds[kind] || {
        kind, number: kind === 'patent' && row.document.kind === 'legacy' ? row.document.number : '',
        ...(kind === 'non-patent' && row.document.kind === 'legacy' ? { title: row.document.number } : {}),
      };
      return { ...row, previousKinds, document: { ...restored, url: row.document.url, reportMarkdown: row.document.reportMarkdown } };
    }));
    setError('');
    dirty(true);
  }

  function appendImport() {
    if (blocked || !bulkInput.trim() || importError) return;
    try {
      const documents = normalizeLiteratureDocuments([...rows.map((row) => row.document), ...imported], true);
      setRows(documents.map((document, index) => ({ ...rows[index], id: rows[index]?.id ?? nextId.current++, document })));
      setImportMessage(`${imported.length}문헌을 입력 목록에 추가했습니다. 아래 내용을 확인한 뒤 저장해 주세요.`);
      setBulkInput('');
      setError('');
      dirty(true);
    } catch (cause) { setError(errorMessage(cause)); }
  }

  async function save(publish: boolean) {
    if (blocked || saving.current) return;
    if (bulkInput.trim()) {
      setError('자동 입력란에 적용하지 않은 내용이 있습니다. 문헌을 목록에 추가하거나 자동 입력란을 비운 뒤 저장해 주세요.');
      return;
    }
    try {
      const documents = normalizeLiteratureDocuments(rows.map((row) => row.document), !publish);
      saving.current = true;
      setPending(true);
      setError('');
      if (await onSave(documents, publish)) {
        setRows(documents.map((document, index) => ({ ...rows[index], id: rows[index]?.id ?? nextId.current++, document })));
      }
    } catch (cause) { setError(errorMessage(cause)); }
    finally { saving.current = false; setPending(false); }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(LITERATURE_FORMAT_PROMPT);
      setCopyMessage('결과 포맷팅 프롬프트를 복사했습니다. 검색 프롬프트 끝에 붙여 넣으세요.');
    } catch { setCopyMessage('자동 복사를 사용할 수 없습니다. 아래 프롬프트를 선택해 직접 복사해 주세요.'); }
  }

  return <div className="lit-editor">
    <div className="lit-editor-heading">
      <div><h3>선행기술 문헌 입력</h3><p className="ev-muted">특허와 비특허문헌을 최대 7건까지 등록하고, 문헌별 URL과 마크다운 보고서를 함께 저장합니다.</p></div>
      <span className={`ev-badge${rows.length > 7 ? ' red' : ''}`}>{rows.length} / 7문헌</span>
    </div>

    <details className="lit-tool" open={rows.length === 0 ? true : undefined}>
      <summary>자동 입력 · AI 검색 결과 붙여 넣기</summary>
      <div className="lit-tool-body">
        <p className="ev-muted" id={`${editorId}-bulk-help`}>아래 포맷으로 받은 JSON을 붙여 넣으면 여러 문헌을 한꺼번에 입력할 수 있습니다. 미리보기를 확인한 뒤 ‘목록에 추가’를 누르세요.</p>
        <label htmlFor={`${editorId}-bulk`}>AI 검색 결과 JSON</label>
        <textarea id={`${editorId}-bulk`} className="krds-input lit-code" rows={8} spellCheck={false} value={bulkInput}
          disabled={blocked} aria-describedby={`${editorId}-bulk-help`} placeholder={LITERATURE_IMPORT_EXAMPLE}
          onChange={(event) => { setBulkInput(event.target.value); setImportMessage(''); setError(''); dirty(true); }} />
        {importError && <p className="lit-error" role="alert">{importError}</p>}
        {imported.length > 0 && <div className="lit-import-preview" aria-label="자동 입력 미리보기">
          <strong>{imported.length}문헌을 인식했습니다.</strong>
          <ol>{imported.map((document, index) => <li key={index}><span className="ev-badge">{document.kind === 'patent' ? '특허' : '비특허'}</span> {document.number}</li>)}</ol>
          {rows.length + imported.length > 7 && <p className="lit-error">기존 {rows.length}건과 합치면 7건을 초과합니다. 기존 목록 또는 붙여 넣은 문헌 수를 줄여 주세요.</p>}
        </div>}
        <div className="ev-actions"><button type="button" className="krds-btn medium ev-button primary" disabled={blocked || !imported.length || Boolean(importError) || rows.length + imported.length > 7} onClick={appendImport}>인식한 {imported.length || ''}{imported.length ? '문헌 ' : ''}목록에 추가</button>
          {bulkInput && <button type="button" className="krds-btn medium ev-button" disabled={blocked} onClick={() => { setBulkInput(''); setImportMessage(''); setError(''); dirty(true); }}>붙여 넣은 내용 비우기</button>}
        </div>
        {importMessage && <p className="lit-success" role="status">{importMessage}</p>}
        <details className="lit-example"><summary>JSON 입력 예시</summary><pre>{LITERATURE_IMPORT_EXAMPLE}</pre></details>
      </div>
    </details>

    <details className="lit-tool">
      <summary>검색 프롬프트에 추가할 결과 포맷팅 프롬프트</summary>
      <div className="lit-tool-body">
        <p className="ev-muted">검색을 요청할 때 이 문구를 끝에 붙여 넣으세요.</p>
        <div className="ev-actions"><button type="button" className="krds-btn medium ev-button" onClick={() => void copyPrompt()}>포맷팅 프롬프트 복사</button><span className="ev-muted" role="status">{copyMessage}</span></div>
        <textarea className="krds-input lit-code lit-prompt" aria-label="복사할 결과 포맷팅 프롬프트" readOnly rows={10} value={LITERATURE_FORMAT_PROMPT} onFocus={(event) => event.currentTarget.select()} />
      </div>
    </details>

    <div className="lit-manual-heading"><h3>입력 목록</h3><div className="ev-actions">
      <button type="button" className="krds-btn medium ev-button" disabled={blocked || rows.length >= 7} onClick={() => add('patent')}>+ 특허 추가</button>
      <button type="button" className="krds-btn medium ev-button" disabled={blocked || rows.length >= 7} onClick={() => add('non-patent')}>+ 비특허문헌 추가</button>
    </div></div>
    {rows.length === 0 && <p className="lit-empty">입력한 문헌이 없습니다. 자동 입력을 사용하거나 문헌을 추가하세요.</p>}
    <div className="lit-document-list">{rows.map(({ id, document }, index) => {
      const prefix = `${editorId}-document-${id}`;
      return <fieldset className="lit-document" key={id} disabled={blocked}>
        <legend>문헌 {index + 1}</legend>
        <div className="lit-document-head">
          <label htmlFor={`${prefix}-kind`}>문헌 종류<select id={`${prefix}-kind`} className="krds-form-select" value={document.kind} disabled={blocked} onChange={(event) => changeKind(id, event.target.value as LiteratureDocument['kind'])}><option value="patent">특허</option><option value="non-patent">비특허문헌</option>{(document.kind === 'legacy' || rows[index].previousKinds?.legacy) && <option value="legacy">기존 문헌</option>}</select></label>
          <button type="button" className="krds-btn medium ev-button tiny danger" disabled={blocked} aria-label={`문헌 ${index + 1} 삭제`} onClick={() => { if (!blocked) { setRows((previous) => previous.filter((row) => row.id !== id)); setError(''); dirty(true); } }}>문헌 삭제</button>
        </div>
        {document.kind === 'patent' && <label htmlFor={`${prefix}-number`}><span>특허 문헌번호 <span className="lit-required">필수</span></span><input id={`${prefix}-number`} className="krds-input" value={document.number} maxLength={2000} placeholder="KR20100001234A" spellCheck={false} disabled={blocked} onChange={(event) => update(id, { number: event.target.value })} /><span className="lit-field-help">국가코드·번호·공보 기호를 포함해 입력하세요. 예: KR20100001234A, US20200123456A1</span></label>}
        {document.kind === 'legacy' && <label htmlFor={`${prefix}-number`}>기존 문헌·서지정보<input id={`${prefix}-number`} className="krds-input" value={document.number} maxLength={2000} disabled={blocked} onChange={(event) => update(id, { number: event.target.value })} /><span className="lit-field-help">문헌 종류를 바꾸면 항목별로 입력할 수 있습니다.</span></label>}
        {document.kind === 'non-patent' && <>
          <div className="lit-field-grid">{fields.map((field) => <label key={field.key} className={field.wide ? 'lit-field-wide' : undefined} htmlFor={`${prefix}-${field.key}`}><span>{field.label}{field.key === 'title' && <> <span className="lit-required">필수</span></>}</span><input id={`${prefix}-${field.key}`} className="krds-input" value={document[field.key] || ''} maxLength={2000} placeholder={field.placeholder} disabled={blocked} onChange={(event) => update(id, { [field.key]: event.target.value })} /></label>)}</div>
          <p className="lit-field-help">확인되지 않은 항목은 비워 두세요. 발행일이 없으면 연월만, 발행연월일이 불명확하면 입수일과 그 사유를 입력하세요. 페이지는 통권페이지를 우선하며, 호의 페이지를 적을 때는 ‘pp’를 붙입니다. 외국어 간행물은 원어 표기를 사용하세요.</p>
        </>}
        <label htmlFor={`${prefix}-url`}>문헌 URL<input id={`${prefix}-url`} className="krds-input" type="url" value={document.url || ''} maxLength={2000} placeholder="https://…" spellCheck={false} disabled={blocked} onChange={(event) => update(id, { url: event.target.value })} /><span className="lit-field-help">원문 또는 문헌을 확인할 수 있는 http·https 주소를 입력하세요.</span></label>
        <label htmlFor={`${prefix}-report`}>문헌별 보고서 (마크다운)<textarea id={`${prefix}-report`} className="krds-input lit-code" rows={6} value={document.reportMarkdown || ''} maxLength={LITERATURE_REPORT_MAX_LENGTH} disabled={blocked} placeholder={'## 문헌 요약\n\n핵심 기술과 관련 청구항을 적으세요.\n\n### 관련 근거\n- 관련 구절·페이지\n- 공통점과 차이점'} onChange={(event) => update(id, { reportMarkdown: event.target.value })} /><span className="lit-field-help lit-report-count">{(document.reportMarkdown?.length || 0).toLocaleString('ko-KR')} / {LITERATURE_REPORT_MAX_LENGTH.toLocaleString('ko-KR')}자</span></label>
        {document.reportMarkdown?.trim() && <details className="lit-report-preview"><summary>보고서 미리보기</summary><div><NoticeMarkdown markdown={document.reportMarkdown} tableLabel="선행기술 문헌 보고서 표" /></div></details>}
      </fieldset>;
    })}</div>
    {error && <div className="ev-alert lit-save-error" role="alert">{error}</div>}
    <div className="ev-actions end lit-save-actions"><span className="ev-muted lit-deadline">{deadline ? `입력 기한 ${deadline}` : '입력 기한 제한 없음'}{published && <><br />임시저장한 수정 사항은 입력 완료 후 심사관에게 공개됩니다.</>}</span>
      <button type="button" className="krds-btn medium ev-button" disabled={blocked || rows.length > 7} onClick={() => void save(false)}>{pending ? '저장 중…' : '임시저장'}</button>
      <button type="button" className="krds-btn medium ev-button primary" disabled={blocked || !rows.length || rows.length > 7} onClick={() => void save(true)}>{pending ? '저장 중…' : 'AI 검색 결과 입력 완료'}</button>
    </div>
  </div>;
}
