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
function MarkdownStub() { return null; }
const source = await readFile(new URL('../app/evaluation/literature-editor.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const moduleRecord = { exports: {} };
vm.runInThisContext(`(function(require, module, exports) { ${compiled}\n})`)(id => {
  if (id === 'react') return hooks;
  if (id === '@/app/lib/evaluation') return rules;
  if (id === '@/app/components/notice-markdown') return { __esModule: true, default: MarkdownStub };
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
const button = (tree, label) => tree.find(node => node.type === 'button' && node.props.children === label);
const input = (tree, suffix) => tree.find(node => ['input', 'textarea', 'select'].includes(node.type) && node.props.id?.endsWith(suffix));
const bulk = tree => input(tree, '-bulk');
const applyImport = tree => tree.find(node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('목록에 추가'));
const settle = () => new Promise(resolve => setImmediate(resolve));

reset();
let tree = render();
assert.equal(input(tree, '-number').props.value, initial[0].number);
assert.equal(input(tree, '-url').props.value, initial[0].url);
assert.equal(input(tree, '-report').props.value, initial[0].reportMarkdown);
assert.equal(tree.find(node => node.type === MarkdownStub).props.markdown, initial[0].reportMarkdown, 'Report preview must receive the current Markdown.');
const report = '## 관련성\n\n**선행기술**: 검색 단계와 관련됨.';
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
assert(tree.some(node => node.props.role === 'alert' && String(node.props.children).includes('적용하지 않은')));
applyImport(tree).props.onClick();
tree = render();
assert.equal(bulk(tree).props.value, '');
for (const field of ['authors', 'title', 'publication', 'publicationPlace', 'publisher', 'publicationDate', 'volume', 'issue', 'pages', 'acquiredDate', 'dateNote']) {
  assert.equal(input(tree, `-${field}`).props.value, imported[field], `Bulk import must populate editable ${field}.`);
}
assert.equal(tree.filter(node => node.type === MarkdownStub).at(-1).props.markdown, report);
button(tree, '임시저장').props.onClick();
await settle();
assert.equal(actions.length, 1);
assert.equal(actions[0].publish, false);
assert.equal(actions[0].documents.length, 2, 'Bulk import appends to the existing document.');
assert.deepEqual(actions[0].documents[0], initial[0]);
assert.equal(actions[0].documents[1].title, imported.title);
assert.equal(actions[0].documents[1].reportMarkdown, report);
tree = render();
button(tree, 'AI 검색 결과 입력 완료').props.onClick();
await settle();
assert.equal(actions.at(-1).publish, true);
assert.equal(actions.at(-1).documents[1].url, imported.url);
assert(dirty.includes(true));

// Invalid bulk input must leave the already authored list intact.
tree = render();
bulk(tree).props.onChange({ target: { value: '{broken' } });
tree = render();
assert.equal(applyImport(tree).props.disabled, true);
assert(tree.some(node => node.props.role === 'alert'));
assert.equal(input(tree, '-title').props.value, imported.title);
assert.equal(input(tree, '-report').props.value, initial[0].reportMarkdown);
button(tree, '붙여 넣은 내용 비우기').props.onClick();
tree = render();
bulk(tree).props.onChange({ target: { value: JSON.stringify({ documents: [{ kind: 'patent', number: initial[0].number }] }) } });
tree = render();
applyImport(tree).props.onClick();
tree = render();
assert(tree.some(node => node.props.role === 'alert' && String(node.props.children).includes('중복')));
assert.equal(tree.filter(node => node.type === 'fieldset').length, 2, 'Duplicate imports must not partially mutate the list.');

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
for (const node of tree.filter(node => ['input', 'select', 'textarea', 'button'].includes(node.type) && !node.props.readOnly && node.props.children !== '포맷팅 프롬프트 복사')) {
  assert.equal(node.props.disabled, true, 'Closed or busy editors must block all mutations.');
}
const rowCount = tree.filter(node => node.type === 'fieldset').length;
button(tree, '+ 비특허문헌 추가').props.onClick();
assert.equal(render().filter(node => node.type === 'fieldset').length, rowCount);

console.log('Literature editor passed: JSON preview and append, editable citation fields, URL/Markdown preservation, unapplied text protection, draft/publication actions, atomic duplicate rejection, kind switching and bibliography recovery, failed-save recovery and blocked controls.');
