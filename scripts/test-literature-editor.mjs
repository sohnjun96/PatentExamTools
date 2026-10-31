import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as rules from '../app/lib/evaluation.ts';

const require = createRequire(import.meta.url);
let values = [];
let hookIndex = 0;
const hooks = {
  useId: () => 'editor-test',
  useEffect() {},
  useCallback: callback => callback,
  useState(initial) {
    const index = hookIndex++;
    if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
    return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
  },
  useRef(initial) {
    const index = hookIndex++;
    if (!(index in values)) values[index] = { current: initial };
    return values[index];
  },
};
function ReaderStub() { return null; }
function AppIconStub() { return null; }
const source = await readFile(new URL('../app/evaluation/task/result-editor.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const moduleRecord = { exports: {} };
vm.runInThisContext(`(function(require, module, exports) { ${compiled}\n})`)(id => {
  if (id === 'react') return hooks;
  if (id === '@/app/lib/evaluation') return rules;
  if (id === './literature-reader') return { __esModule: true, default: ReaderStub };
  if (id === '@/app/components/app-icon') return { __esModule: true, default: AppIconStub };
  if (id.endsWith('.css')) return {};
  return require(id);
}, moduleRecord, moduleRecord.exports);
const LiteratureEditor = moduleRecord.exports.default;
const initial = rules.normalizeLiteratureDocuments([{ kind: 'patent', number: 'KR20100001234A', url: 'https://example.test/patent', reportMarkdown: '## 기존 근거\n\n문단 12.' }]);
let actions = [];
let dirty = [];
let props;
function reset(initialDocuments = initial) {
  values = [];
  actions = [];
  dirty = [];
  props = { initialDocuments, disabled: false, dirty: value => dirty.push(value), onSave: async (documents, publish) => { actions.push({ documents, publish }); return true; } };
}
function nodes(element, result = []) {
  if (!element || typeof element !== 'object') return result;
  if (Array.isArray(element)) { element.forEach(child => nodes(child, result)); return result; }
  if (!element.props) return result;
  result.push(element);
  nodes(element.props.children, result);
  return result;
}
function render() { hookIndex = 0; return nodes(LiteratureEditor(props)); }
const text = value => Array.isArray(value) ? value.map(text).join('') : typeof value === 'string' || typeof value === 'number' ? String(value) : value?.props ? text(value.props.children) : '';
const button = (tree, label) => tree.find(node => node.type === 'button' && text(node.props.children) === label);
const input = (tree, suffix) => tree.find(node => ['input', 'textarea', 'select'].includes(node.type) && node.props.id?.endsWith(suffix));
const bulk = tree => input(tree, '-bulk');
const applyImport = tree => tree.find(node => node.type === 'button' && text(node.props.children).startsWith('기존 목록에'));
const settle = () => new Promise(resolve => setImmediate(resolve));

reset();
let tree = render();
assert.equal(input(tree, '-number').props.value, initial[0].number);
assert.equal(input(tree, '-url').props.value, initial[0].url);
assert.equal(input(tree, '-report').props.value, initial[0].reportMarkdown);
assert.equal(tree.find(node => node.type === ReaderStub).props.document.reportMarkdown, initial[0].reportMarkdown, 'Report preview must receive the current Markdown.');
const report = '## 관련성\n\n| 청구항 구성 | 선행문헌 대응 내용 | 근거 위치 |\n| --- | --- | --- |\n| **검색 단계** | 검색 조건에 따른 문헌 검색 | 문단 12 |\n| 출력 단계 | 검색 결과 출력 | 도 2 |';
const imported = { kind: 'non-patent', authors: 'Lee, S.', title: 'A retrieval study', publication: 'Retrieval Journal', publicationPlace: 'Seoul', publisher: 'Research Press', publicationDate: '2020-06', volume: 'Vol. 1', issue: 'No. 3', pages: 'pp. 12–16', acquiredDate: '2026-10-30', dateNote: '발행일 미상', url: 'https://example.test/paper', reportMarkdown: report };
bulk(tree).props.onChange({ target: { value: JSON.stringify({ documents: [imported] }) } });
tree = render();
assert.equal(applyImport(tree).props.disabled, false);
assert(tree.some(node => node.props['aria-label'] === '자동 입력 미리보기'));
assert.equal(actions.length, 0, 'Pasting and previewing results must not publish anything.');
button(tree, '임시저장').props.onClick();
await settle();
assert.equal(actions.length, 0, 'Pending bulk text must not be silently dropped by save.');
tree = render();
assert(tree.some(node => node.props.role === 'alert' && String(node.props.children).includes('목록에 추가')));
applyImport(tree).props.onClick();
tree = render();
assert.equal(bulk(tree).props.value, '');
for (const field of ['authors', 'title', 'publication', 'publicationPlace', 'publisher', 'publicationDate', 'volume', 'issue', 'pages', 'acquiredDate', 'dateNote']) {
  assert.equal(input(tree, `-${field}`).props.value, imported[field], `Bulk import must populate editable ${field}.`);
}
assert.equal(tree.filter(node => node.type === ReaderStub).at(-1).props.document.reportMarkdown, report);
button(tree, '임시저장').props.onClick();
await settle();
assert.equal(actions.length, 1);
assert.equal(actions[0].publish, false);
assert.equal(actions[0].documents.length, 2, 'Bulk import appends to the existing document.');
assert.deepEqual(actions[0].documents[0], initial[0]);
assert.equal(actions[0].documents[1].title, imported.title);
assert.equal(actions[0].documents[1].reportMarkdown, report);
tree = render();
button(tree, '입력 완료').props.onClick();
await settle();
assert.equal(actions.at(-1).publish, true);
assert.equal(actions.at(-1).documents[1].url, imported.url);
assert.equal(actions.at(-1).documents[1].reportMarkdown, report, 'JSON-imported Markdown tables must survive publication unchanged.');
assert(dirty.includes(true));

// Invalid bulk input must leave the already authored list intact.
tree = render();
bulk(tree).props.onChange({ target: { value: '{broken' } });
tree = render();
assert.equal(applyImport(tree).props.disabled, true);
assert(tree.some(node => node.props.role === 'alert'));
assert.equal(input(tree, '-title').props.value, imported.title);
assert.equal(input(tree, '-report').props.value, report);
button(tree, '입력란 비우기').props.onClick();
tree = render();
bulk(tree).props.onChange({ target: { value: JSON.stringify({ documents: [{ kind: 'patent', number: initial[0].number }] }) } });
tree = render();
applyImport(tree).props.onClick();
tree = render();
assert(tree.some(node => node.props.role === 'alert' && String(node.props.children).includes('중복')));
assert.equal(tree.filter(node => node.props.className === 'tw-editable-doc').length, 2, 'Duplicate imports must not partially mutate the list.');

// Switching kinds must never submit invisible bibliography fields for a patent,
// and temporarily switching back must restore the user's authored bibliography.
reset(rules.normalizeLiteratureDocuments([imported]));
tree = render();
input(tree, '-kind').props.onChange({ target: { value: 'patent' } });
tree = render();
assert.equal(input(tree, '-title'), undefined);
input(tree, '-number').props.onChange({ target: { value: 'us-2020-0123456-a1' } });
input(tree, '-url').props.onChange({ target: { value: 'https://example.test/shared-new-source' } });
input(tree, '-report').props.onChange({ target: { value: '## 종류 변경 후 보고서' } });
tree = render();
button(tree, '임시저장').props.onClick();
await settle();
assert.equal(actions.length, 1, 'A converted patent must pass validation instead of retaining hidden non-patent fields.');
assert.deepEqual(actions[0].documents, [{ kind: 'patent', number: 'US20200123456A1', url: 'https://example.test/shared-new-source', reportMarkdown: '## 종류 변경 후 보고서' }]);
tree = render();
input(tree, '-kind').props.onChange({ target: { value: 'non-patent' } });
tree = render();
for (const field of ['authors', 'title', 'publication', 'publicationPlace', 'publisher', 'publicationDate', 'volume', 'issue', 'pages', 'acquiredDate', 'dateNote']) {
  assert.equal(input(tree, `-${field}`).props.value, imported[field], `Switching back must restore authored ${field}.`);
}
assert.equal(input(tree, '-url').props.value, 'https://example.test/shared-new-source', 'URL edits are shared across document kinds.');
assert.equal(input(tree, '-report').props.value, '## 종류 변경 후 보고서');

reset([{ kind: 'legacy', number: '기존에 입력한 논문 서지정보' }]);
tree = render();
input(tree, '-kind').props.onChange({ target: { value: 'non-patent' } });
tree = render();
assert.equal(input(tree, '-title').props.value, '기존에 입력한 논문 서지정보');
input(tree, '-title').props.onChange({ target: { value: '항목별로 수정한 제목' } });
tree = render();
assert(input(tree, '-kind').props.children.some(option => option?.props?.value === 'legacy'), 'A converted legacy record must remain recoverable before saving.');
input(tree, '-kind').props.onChange({ target: { value: 'legacy' } });
tree = render();
assert.equal(input(tree, '-number').props.value, '기존에 입력한 논문 서지정보');

reset();
props.onSave = async () => false;
tree = render();
input(tree, '-report').props.onChange({ target: { value: '## 저장 실패 후에도 유지할 보고서' } });
tree = render();
button(tree, '임시저장').props.onClick();
await settle();
tree = render();
assert.equal(input(tree, '-report').props.value, '## 저장 실패 후에도 유지할 보고서');
props.disabled = true;
tree = render();
for (const node of tree.filter(node => ['input', 'select', 'textarea'].includes(node.type) && !node.props.readOnly)) {
  assert.equal(node.props.disabled, true, 'Closed or busy editors must block all mutations.');
}
const rowCount = tree.filter(node => node.type === 'fieldset').length;
button(tree, '수동 추가').props.onClick();
assert.equal(render().filter(node => node.type === 'fieldset').length, rowCount);

// Mixing bulk and single entry must preserve all the other records, including deleting the last row.
reset();
tree=render();
button(tree,'수동 추가').props.onClick();tree=render();
input(tree,'-number').props.onChange({target:{value:'US20200123456A1'}});
input(tree,'-report').props.onChange({target:{value:'## 직접 입력한 보고서'}});tree=render();
tree.find(node=>node.type==='button'&&node.props['aria-label']===initial[0].number+' 삭제').props.onClick();tree=render();
assert.equal(input(tree,'-number').props.value,'US20200123456A1','Deleting an earlier record must preserve the selected row.');
button(tree,'임시저장').props.onClick();await settle();assert.equal(actions[0].documents.length,1);assert.equal(actions[0].documents[0].reportMarkdown,'## 직접 입력한 보고서');
tree=render();tree.find(node=>node.type==='button'&&node.props['aria-label']==='US20200123456A1 삭제').props.onClick();tree=render();
assert.equal(tree.filter(node=>node.props.className==='tw-editable-doc').length,0);assert.equal(button(tree,'입력 완료').props.disabled,true);
// Clearing unconsumed bulk text must not erase the dirty state of deleted documents.
tree.find(node=>node.type==='textarea'&&node.props.id.endsWith('-bulk')).props.onChange({target:{value:'pending import'}});
tree=render();button(tree,'입력란 비우기').props.onClick();
assert.equal(dirty.at(-1),true,'Unsaved document deletions still need close protection after clearing bulk text.');
tree=render();
button(tree,'수동 추가').props.onClick();tree=render();assert(input(tree,'-number'));

// A synchronous ref lock prevents duplicate saves and edits from pre-render event handlers.
reset();let finish;let requests=0;props.onSave=()=>{requests++;return new Promise(resolve=>{finish=resolve;});};
tree=render();button(tree,'임시저장').props.onClick();button(tree,'임시저장').props.onClick();button(tree,'수동 추가').props.onClick();
assert.equal(requests,1);assert.equal(render().filter(node=>node.props.className==='tw-editable-doc').length,1);finish(false);await settle();
assert.equal(input(render(),'-number').props.value,initial[0].number);

// Inserting a report table must respect the cursor/selection without erasing authored text.
reset();
tree = render();
const beforeTable = '## 기존 설명\n\n앞 문단\n\n';
const selectedText = '이 부분을 표로 대체';
const afterTable = '\n\n끝 문단과 기존 근거';
input(tree, '-report').props.onChange({ target: { value: beforeTable + selectedText + afterTable } });
tree = render();
const reportField = input(tree, '-report');
reportField.props.ref.current = {
  selectionStart: beforeTable.length, selectionEnd: beforeTable.length + selectedText.length,
  focus() {}, setSelectionRange() {},
};
assert.equal(button(tree, '표 삽입').props.disabled, false);
button(tree, '표 삽입').props.onClick();
await settle();
tree = render();
const tableReport = input(tree, '-report').props.value;
assert(tableReport.startsWith(beforeTable));
assert(tableReport.endsWith(afterTable));
assert(!tableReport.includes(selectedText));
assert(tableReport.includes(rules.LITERATURE_REPORT_TABLE_TEMPLATE));
assert.equal(tree.find(node => node.type === ReaderStub).props.document.reportMarkdown, tableReport, 'The live preview must immediately receive the inserted table.');
assert.equal(dirty.at(-1), true);
button(tree, '임시저장').props.onClick();
await settle();
assert.equal(actions.at(-1).documents[0].reportMarkdown, tableReport.trim());
tree = render();
button(tree, '입력 완료').props.onClick();
await settle();
assert.equal(actions.at(-1).publish, true);
assert.equal(actions.at(-1).documents[0].reportMarkdown, tableReport.trim());
reset();
tree = render();
const maximumReport = '가'.repeat(rules.LITERATURE_REPORT_MAX_LENGTH);
input(tree, '-report').props.onChange({ target: { value: maximumReport } });
tree = render();
button(tree, '표 삽입').props.onClick();
tree = render();
assert.equal(input(tree, '-report').props.value, maximumReport, 'An insertion over the report limit must preserve the original report without truncation.');
assert(tree.some(node => node.props.role === 'alert'), 'The author must receive an explanation when a table exceeds the report limit.');
props.disabled = true;
tree = render();
assert.equal(button(tree, '표 삽입').props.disabled, true);
button(tree, '표 삽입').props.onClick();
assert.equal(input(render(), '-report').props.value, maximumReport);

reset();
let finishTableSave;
props.onSave = () => new Promise(resolve => { finishTableSave = resolve; });
tree = render();
button(tree, '임시저장').props.onClick();
tree = render();
assert.equal(button(tree, '표 삽입').props.disabled, true, 'A pending save must block table insertion.');
button(tree, '표 삽입').props.onClick();
assert.equal(input(render(), '-report').props.value, initial[0].reportMarkdown);
finishTableSave(false);
await settle();

// Entry actions belong to the document sidebar; automatic entry only opens the preserved bulk draft.
reset();
tree = render();
const sidebar = tree.find(node => node.type === 'aside' && node.props['aria-label'] === '입력 문헌');
const workArea = tree.find(node => node.type === 'main' && node.props.className === 'tw-input-work');
for (const label of ['수동 추가', '자동 추가']) {
  assert(button(nodes(sidebar), label), `${label} must appear inside the document sidebar.`);
  assert.equal(button(nodes(workArea), label), undefined, `${label} must not be duplicated in the right work area.`);
}
assert.equal(button(tree, '한 문헌 추가'), undefined);
assert.equal(button(tree, '한꺼번에 입력'), undefined);
assert.equal(button(tree, '하나씩 입력'), undefined);
assert(!tree.some(node => node.props.role === 'group' && node.props['aria-label'] === '입력 방법'), 'The removed right-side mode switch must not remain in the accessibility tree.');
assert(button(nodes(workArea), '포맷팅 프롬프트'));
const documentRows = candidate => candidate.filter(node => node.props.className === 'tw-editable-doc');
const selectOriginal = candidate => candidate.find(node => node.type === 'button' && node.props.className === 'tw-doc-choice' && text(node.props.children).includes(initial[0].number));
const bulkPanel = candidate => candidate.find(node => node.type === 'section' && node.props['aria-label'] === '한꺼번에 입력');
const singlePanel = candidate => candidate.find(node => node.type === 'section' && node.props['aria-label'] === '하나씩 입력');
selectOriginal(tree).props.onClick();
tree = render();
assert.equal(singlePanel(tree).props.hidden, false);
const beforeAutomaticRows = documentRows(tree).map(node => text(node.props.children));
button(tree, '자동 추가').props.onClick();
tree = render();
assert.equal(bulkPanel(tree).props.hidden, false);
assert.equal(singlePanel(tree).props.hidden, true);
assert.deepEqual(documentRows(tree).map(node => text(node.props.children)), beforeAutomaticRows);
assert.equal(input(tree, '-report').props.value, initial[0].reportMarkdown);
assert.equal(dirty.length, 0, 'Opening automatic entry must not mark document data as changed.');
const unconsumedJSON = JSON.stringify({ documents: [{ kind: 'patent', number: 'US20200123456A1' }] });
bulk(tree).props.onChange({ target: { value: unconsumedJSON } });
tree = render();
selectOriginal(tree).props.onClick();
tree = render();
button(tree, '자동 추가').props.onClick();
tree = render();
assert.equal(bulk(tree).props.value, unconsumedJSON, 'Switching back to automatic entry must retain unapplied pasted results.');
assert.equal(input(tree, '-report').props.value, initial[0].reportMarkdown);
assert.equal(documentRows(tree).length, 1);
button(tree, '수동 추가').props.onClick();
tree = render();
assert.equal(documentRows(tree).length, 2);
assert.equal(singlePanel(tree).props.hidden, false);
assert.equal(input(tree, '-number').props.value, '', 'Manual addition must select the new empty document.');
assert.equal(input(tree, '-report').props.value, '');
assert.equal(bulk(tree).props.value, unconsumedJSON);
selectOriginal(tree).props.onClick();
tree = render();
assert.equal(input(tree, '-report').props.value, initial[0].reportMarkdown, 'Manual and automatic entry must preserve existing authored reports.');

for (const maximum of [false, true]) {
  reset(maximum ? rules.normalizeLiteratureDocuments(Array.from({ length: 7 }, (_, index) => ({ kind: 'patent', number: `KR2020000000${index}A` }))) : initial);
  props.disabled = !maximum;
  tree = render();
  tree.find(node => node.type === 'button' && node.props.className === 'tw-doc-choice').props.onClick();
  tree = render();
  const beforeRows = documentRows(tree).map(node => text(node.props.children));
  const previousMode = bulkPanel(tree).props.hidden;
  for (const label of ['수동 추가', '자동 추가']) {
    assert.equal(button(tree, label).props.disabled, true, `${label} must be disabled when ${maximum ? 'seven documents are present' : 'the editor is closed'}.`);
    button(tree, label).props.onClick();
  }
  tree = render();
  assert.deepEqual(documentRows(tree).map(node => text(node.props.children)), beforeRows);
  assert.equal(bulkPanel(tree).props.hidden, previousMode, 'Disabled automatic-entry handlers must not change the editor mode.');
}

reset();
let finishAddSave;
props.onSave = () => new Promise(resolve => { finishAddSave = resolve; });
tree = render();
selectOriginal(tree).props.onClick();
tree = render();
button(tree, '임시저장').props.onClick();
// Handlers captured before React's pending render must also honor the synchronous save guard.
button(tree, '수동 추가').props.onClick();
button(tree, '자동 추가').props.onClick();
tree = render();
assert.equal(documentRows(tree).length, 1);
assert.equal(singlePanel(tree).props.hidden, false);
assert.equal(button(tree, '수동 추가').props.disabled, true);
assert.equal(button(tree, '자동 추가').props.disabled, true);
finishAddSave(false);
await settle();
console.log('Literature editor passed: sidebar manual/automatic entry, preserved bulk/report drafts, blocked addition guards, Markdown table import/insertion/preview/publication, bibliography recovery and save protection.');
