import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const filename = new URL('../app/evaluation/notice-manager.tsx', import.meta.url);
const source = await readFile(filename, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
let values = [], index = 0, confirmation = true, confirmations = [], dirtyValues = [];
const hooks = {
  useState(initial) {
    const key = index++;
    if (!(key in values)) values[key] = typeof initial === 'function' ? initial() : initial;
    return [values[key], (next) => { values[key] = typeof next === 'function' ? next(values[key]) : next; }];
  },
  useRef(initial) { const key = index++; if (!(key in values)) values[key] = { current: initial }; return values[key]; },
  useEffect(callback) { callback(); },
};
function MarkdownStub() { return null; }
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require(id) {
    if (id === 'react') return hooks;
    if (id === 'react/jsx-runtime') return require(id);
    if (id === '@/app/components/notice-markdown') return MarkdownStub;
    if (id === '@/app/lib/evaluation') return { NOTICE_MAX_LENGTH: 20_000 };
    if (id.endsWith('.css')) return {};
    throw new Error(`Unexpected import: ${id}`);
  },
  window: { confirm(message) { confirmations.push(message); return confirmation; } },
  Intl, Date,
}, { filename: filename.pathname });
const NoticeManager = module.exports.default;
function nodes(element, result = []) {
  if (!element || typeof element !== 'object') return result;
  if (Array.isArray(element)) { for (const child of element) nodes(child, result); return result; }
  if (element.props) { result.push(element); nodes(element.props.children, result); }
  return result;
}
let props;
function reset(notice, save = async () => true) {
  values = []; confirmation = true; confirmations = []; dirtyValues = [];
  props = { state: { notice }, bureau: '기획국', busy: false, save, dirty(value) { dirtyValues.push(value); } };
}
function render() { index = 0; return nodes(NoticeManager(props)); }
const textarea = (tree) => tree.find((node) => node.type === 'textarea');
const saveButton = (tree) => tree.find((node) => node.type === 'button' && node.props.type === 'submit');
const button = (tree, text) => tree.find((node) => node.type === 'button' && node.props.children === text);
const submit = (tree) => tree.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
const tick = () => new Promise((resolve) => setImmediate(resolve));

reset(undefined);
let tree = render();
assert.equal(textarea(tree).props.value, '', 'Legacy states without notice must start empty.');
assert.equal(textarea(tree).props.maxLength, 20_000);
assert.equal(saveButton(tree).props.disabled, true);
assert.equal(tree.filter((node) => node.type === MarkdownStub).length, 0);
assert.equal(dirtyValues.at(-1), false);

let finish;
const actions = [];
props.save = async (action) => { actions.push(action); return new Promise((resolve) => { finish = resolve; }); };
textarea(tree).props.onChange({ target: { value: '  ## 기획국 공지\n\n**기한 확인**  ' } });
tree = render();
assert.equal(dirtyValues.at(-1), true);
assert.equal(tree.find((node) => node.type === MarkdownStub).props.markdown, '  ## 기획국 공지\n\n**기한 확인**  ', 'Preview must use the same current text as the editor.');
assert.equal(saveButton(tree).props.disabled, false);
const priorTree = tree;
submit(tree);
submit(priorTree);
assert.equal(actions.length, 1, 'The in-flight latch must prevent a duplicate save before React re-renders.');
assert.equal(actions[0].type, 'saveNotice');
assert.equal(actions[0].markdown, '## 기획국 공지\n\n**기한 확인**');
tree = render();
assert.equal(textarea(tree).props.disabled, true);
assert.equal(saveButton(tree).props.disabled, true);
props.state.notice = { markdown: actions[0].markdown, updatedAt: '2026-10-27T00:00:00.000Z' };
finish(true);
await tick();
tree = render();
assert.equal(textarea(tree).props.value, actions[0].markdown, 'A successful save must canonicalize whitespace.');
assert.equal(saveButton(tree).props.disabled, true);
assert.equal(dirtyValues.at(-1), false);
assert.equal(tree.find((node) => node.type === 'time').props.dateTime, props.state.notice.updatedAt);

props.save = async () => false;
textarea(tree).props.onChange({ target: { value: '실패해도 남아야 하는 입력' } });
tree = render(); submit(tree); await tick(); tree = render();
assert.equal(textarea(tree).props.value, '실패해도 남아야 하는 입력');
assert.equal(dirtyValues.at(-1), true);
assert.equal(saveButton(tree).props.disabled, false);

confirmation = false;
button(tree, '변경 취소').props.onClick();
tree = render();
assert.equal(textarea(tree).props.value, '실패해도 남아야 하는 입력');
confirmation = true;
button(tree, '변경 취소').props.onClick();
tree = render();
assert.equal(textarea(tree).props.value, actions[0].markdown);
assert.equal(dirtyValues.at(-1), false);

props.busy = true;
tree = render();
assert.equal(textarea(tree).props.disabled, true);
assert(tree.filter((node) => node.type === 'button').every((node) => node.props.disabled));
props.busy = false;
tree = render();
const removals = [];
props.save = async (action) => { removals.push(action); props.state.notice = null; return true; };
confirmation = false;
button(tree, '공지 내리기').props.onClick();
assert.equal(removals.length, 0, 'Cancelled deletion must not send a request.');
confirmation = true;
tree = render();
button(tree, '공지 내리기').props.onClick();
await tick(); tree = render();
assert.equal(removals[0].markdown, '');
assert.equal(textarea(tree).props.value, '');
assert.equal(button(tree, '공지 내리기'), undefined);

reset({ markdown: '게시된 내용', updatedAt: '2026-10-27T00:00:00.000Z' }, async (action) => { actions.push(action); return true; });
tree = render(); textarea(tree).props.onChange({ target: { value: '   ' } });
tree = render(); submit(tree); await tick();
assert.equal(actions.at(-1).markdown, '', 'Saving whitespace explicitly clears a posted notice.');

console.log('Notice editor tests passed: legacy state, live preview, dirty tracking, canonical save, duplicate/in-flight guards, retained failed input, cancel, busy controls, and confirmed removal.');
