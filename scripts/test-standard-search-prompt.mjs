import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compile = relative => ts.transpileModule(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const promptModule = { exports: {} };
vm.runInNewContext(compile('../app/lib/standard-search-prompt.ts'), { module: promptModule, exports: promptModule.exports });
const { STANDARD_SEARCH_PROMPT } = promptModule.exports;
assert.equal(promptModule.exports.standardSearchPromptText({}), STANDARD_SEARCH_PROMPT);
assert.equal(STANDARD_SEARCH_PROMPT.split('\n').length, 14);
assert(STANDARD_SEARCH_PROMPT.startsWith('당신은 한국 특허 심사관을 보조하는 선행기술 조사 전문가입니다.\n첨부된 특허문서 PDF를 직접 분석하고,'));
assert(STANDARD_SEARCH_PROMPT.includes('문헌은 최대 5건, 중복 없이 반환합니다.'));
assert(STANDARD_SEARCH_PROMPT.includes('마크다운 텍스트로 작성하세요(최대 1000자).'));
assert(STANDARD_SEARCH_PROMPT.endsWith(String.raw`JSON 문자열 안의 줄바꿈은 \n, 큰따옴표는 \"로 이스케이프하세요.`), 'The literal JSON escaping instructions must survive JavaScript parsing and copying.');
const patentExample = STANDARD_SEARCH_PROMPT.match(/^특허: (\{.+\})\./m)?.[1];
assert.deepEqual(JSON.parse(patentExample), { kind: 'patent', number: 'KR20100001234A', url: 'https://...', reportMarkdown: '마크다운 보고서' });
const paperExample = JSON.parse(STANDARD_SEARCH_PROMPT.match(/^비특허: (\{.+\})\./m)?.[1]);
assert.deepEqual(Object.keys(paperExample), ['kind', 'authors', 'title', 'publication', 'publicationPlace', 'publisher', 'publicationDate', 'volume', 'issue', 'pages', 'acquiredDate', 'dateNote', 'url', 'reportMarkdown']);

function nodes(value, result = []) {
  if (Array.isArray(value)) { value.forEach(entry => nodes(entry, result)); return result; }
  if (!value?.props) return result;
  result.push(value); nodes(value.props.children, result); return result;
}
function text(value) { return Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
const successTitle = '복사 완료 되었습니다.';
const successGuidance = 'AI에 공개공보를 첨부하고, 컨트롤 + V로 프롬프트를 대화창에 붙여넣으세요.';
function session(navigatorValue, prompt) {
  const values = [], refs = []; let stateCursor = 0, refCursor = 0, copied = 0;
  const hooks = {
    useState(initial) { const index = stateCursor++; if (!(index in values)) values[index] = initial; return [values[index], value => { values[index] = value; }]; },
    useRef(initial) { const index = refCursor++; return refs[index] ||= { current: initial }; },
    useId: () => 'standard-prompt-title',
  };
  function Dialog() {}
  const componentModule = { exports: {} };
  const context = { module: componentModule, exports: componentModule.exports, navigator: navigatorValue, require: id => {
    if (id === 'react') return hooks;
    if (id === 'react/jsx-runtime') return require(id);
    if (id === './accessible-dialog') return { default: Dialog };
    if (id === '../lib/standard-search-prompt') return promptModule.exports;
    if (id.endsWith('.css')) return {};
    throw new Error('Unexpected dependency: ' + id);
  } };
  vm.runInNewContext(compile('../app/components/standard-search-prompt-button.tsx'), context);
  function render() { stateCursor = refCursor = 0; return componentModule.exports.default({ prompt, onCopied() { copied++; } }); }
  return {
    render,
    setPrompt(value) { prompt = value; },
    button(label) { const found = nodes(render()).find(node => node.type === 'button' && node.props.children === label); assert(found, 'Missing button: ' + label); return found; },
    dialog() { return nodes(render()).find(node => node.type === Dialog); },
    get copied() { return copied; },
  };
}

const clipboardWrites = [];
const normal = session({ clipboard: { async writeText(text) { clipboardWrites.push(text); } } });
assert.equal(normal.dialog(), undefined);
await normal.button('표준 검색 프롬프트').props.onClick();
assert.deepEqual(clipboardWrites, [STANDARD_SEARCH_PROMPT], 'One click must copy the entire exact prompt.');
assert.equal(normal.copied, 1);
function assertSuccessDialog(current) {
  const dialog = current.dialog(); assert(dialog, 'A successful copy must open a visible confirmation dialog.');
  assert.equal(dialog.key, 'success');
  assert.equal(dialog.props.className, 'standard-search-prompt-dialog standard-search-prompt-success');
  assert.equal(dialog.props.labelledBy, 'standard-prompt-title');
  assert(dialog.props.fallbackFocusRef, 'Closing confirmation must return keyboard focus to the original button.');
  assert(nodes(dialog).some(node => node.type === 'h2' && node.props.id === dialog.props.labelledBy && text(node) === successTitle));
  assert(text(dialog).includes(successGuidance), 'Confirmation must explain how to attach the publication and paste the copied prompt.');
  assert(!nodes(dialog).some(node => node.type === 'textarea'), 'Success must not be presented as the manual-copy fallback.');
  const confirm = current.button('확인');
  assert.equal(confirm.props['data-dialog-autofocus'], true, 'Keyboard users must land on the confirmation action.');
  return dialog;
}
assertSuccessDialog(normal);
assert.equal(normal.button('표준 검색 프롬프트').props.disabled, false);
normal.button('확인').props.onClick();
assert.equal(normal.dialog(), undefined, 'The confirmation action must close the success dialog.');
await normal.button('표준 검색 프롬프트').props.onClick();
assertSuccessDialog(normal).props.onClose();
assert.equal(normal.dialog(), undefined, 'Escape or backdrop dismissal must close the success dialog.');
assert.deepEqual(clipboardWrites, [STANDARD_SEARCH_PROMPT, STANDARD_SEARCH_PROMPT], 'Repeated copies must retain the original prompt.');

for (const navigatorValue of [undefined, {}, { clipboard: { async writeText() { throw new Error('Permission denied'); } } }]) {
  const fallback = session(navigatorValue);
  await fallback.button('표준 검색 프롬프트').props.onClick();
  assert.equal(fallback.copied, 0, 'A failed copy must not report success.');
  const dialog = fallback.dialog(); assert(dialog, 'Unavailable or rejected clipboard access must leave a manual-copy alternative.');
  assert.equal(dialog.key, 'fallback');
  assert.equal(dialog.props.className, 'standard-search-prompt-dialog');
  assert.equal(dialog.props.labelledBy, 'standard-prompt-title');
  assert(!text(dialog).includes(successTitle), 'Rejected clipboard access must never display copy success.');
  assert(dialog.props.fallbackFocusRef, 'The fallback dialog must return keyboard focus to the original button.');
  const textarea = nodes(dialog).find(node => node.type === 'textarea');
  assert.equal(textarea.props.value, STANDARD_SEARCH_PROMPT);
  assert.equal(textarea.props.readOnly, true);
  assert.equal(textarea.props['data-dialog-autofocus'], true);
  let selected = 0; textarea.props.onFocus({ currentTarget: { select() { selected++; } } }); assert.equal(selected, 1);
  dialog.props.onClose(); assert.equal(fallback.dialog(), undefined);
}

let rejectFirst = true;
const retryWrites = [];
const retry = session({ clipboard: { async writeText(text) { if (rejectFirst) throw new Error('Blocked'); retryWrites.push(text); } } });
await retry.button('표준 검색 프롬프트').props.onClick();
assert(retry.dialog()); rejectFirst = false;
await retry.button('프롬프트 복사').props.onClick();
assert.deepEqual(retryWrites, [STANDARD_SEARCH_PROMPT]);
assert.equal(retry.copied, 1);
assertSuccessDialog(retry);
assert.equal(nodes(retry.render()).filter(node => node.type === 'textarea').length, 0, 'A successful retry must replace the manual-copy view with confirmation.');
retry.button('확인').props.onClick(); assert.equal(retry.dialog(), undefined);

let finishCopy; let pendingWrites = 0;
const pending = session({ clipboard: { writeText() { pendingWrites++; return new Promise(resolve => { finishCopy = resolve; }); } } });
const trigger = pending.button('표준 검색 프롬프트');
const firstCopy = trigger.props.onClick();
assert.equal(pending.button('표준 검색 프롬프트').props.disabled, true);
assert.equal(pending.dialog(), undefined, 'Do not display copy success before the clipboard promise resolves.');
assert.equal(pending.copied, 0);
await trigger.props.onClick(); assert.equal(pendingWrites, 1, 'A pending clipboard request must not be duplicated.');
finishCopy(); await firstCopy;
assert.equal(pending.copied, 1); assert.equal(pending.button('표준 검색 프롬프트').props.disabled, false);
assertSuccessDialog(pending);
const configuredPrompt = '관리자가 수정한 검색 프롬프트\n' + String.raw`JSON 줄바꿈: \n, 따옴표: \"`;
assert.equal(promptModule.exports.standardSearchPromptText({ standardSearchPrompt: { text: configuredPrompt } }), configuredPrompt);
const configuredWrites = [];
const configured = session({ clipboard: { async writeText(text) { configuredWrites.push(text); } } }, configuredPrompt);
await configured.button('표준 검색 프롬프트').props.onClick();
assert.deepEqual(configuredWrites, [configuredPrompt]);
configured.setPrompt('수정된 최신 프롬프트');
await configured.button('표준 검색 프롬프트').props.onClick();
assert.deepEqual(configuredWrites, [configuredPrompt, '수정된 최신 프롬프트']);
const configuredFallback = session({}, configuredPrompt);
await configuredFallback.button('표준 검색 프롬프트').props.onClick();
assert.equal(nodes(configuredFallback.dialog()).find(node => node.type === 'textarea').props.value, configuredPrompt);
console.log('Standard search prompt passed: default and administrator-edited exact clipboard payloads, refreshed text, literal JSON escapes, visible success guidance, denied clipboard fallback, retry and duplicate-copy protection.');
