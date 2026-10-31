import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Miniflare } from 'miniflare';
import * as rules from '../app/lib/evaluation.ts';
import * as bureaus from '../app/lib/bureaus.ts';
import * as prompts from '../app/lib/standard-search-prompt.ts';

const now = new Date('2026-10-31T12:00:00Z');
const original = rules.createInitialState();
const text = '  심사국 전용 프롬프트\n' + String.raw`JSON: {"text":"첫 줄\n둘째 줄"}` + '\n  ';
const action = { type: 'saveStandardSearchPrompt', text };
const saved = rules.applyAction(original, { admin: true }, action, now);
assert.deepEqual(saved.standardSearchPrompt, { text, updatedAt: now.toISOString() });
assert.equal(original.standardSearchPrompt, undefined);
assert.equal(prompts.standardSearchPromptText(original), prompts.STANDARD_SEARCH_PROMPT);
assert.equal(prompts.standardSearchPromptText(saved), text);
assert.deepEqual(rules.visibleState(saved, {}).standardSearchPrompt, saved.standardSearchPrompt);
assert.throws(() => rules.applyAction(saved, { admin: true }, { type: 'loadDemo' }), error => error.status === 400);
assert.deepEqual(saved.standardSearchPrompt, { text, updatedAt: now.toISOString() });
for (const actor of [{}, { admin: false }, { userId: 'ai-person' }]) assert.throws(() => rules.applyAction(original, actor, action), error => error.status === 403);
for (const value of [undefined, null, 42, {}, [], '', ' \n\t ', 'x'.repeat(rules.SEARCH_PROMPT_MAX_LENGTH + 1)]) assert.throws(() => rules.applyAction(original, { admin: true }, { ...action, text: value }), error => error.status === 400);
assert.equal(rules.applyAction(original, { admin: true }, { ...action, text: 'x'.repeat(rules.SEARCH_PROMPT_MAX_LENGTH) }).standardSearchPrompt.text.length, rules.SEARCH_PROMPT_MAX_LENGTH);

async function loadModule(file, dependencies) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)(id => {
    if (id in dependencies) return dependencies[id];
    if (id.endsWith('.css')) return {};
    throw new Error(`Unexpected dependency: ${id}`);
  }, module, module.exports);
  return module.exports;
}

// The editor retains unsuccessful input, guards duplicate submissions, and
// becomes clean only after the persisted workspace contains the saved text.
let values = [], cursor = 0, dirtyValues = [];
const hooks = {
  useState(initial) { const key = cursor++; if (!(key in values)) values[key] = initial; return [values[key], value => { values[key] = value; }]; },
  useRef(initial) { const key = cursor++; return values[key] ||= { current: initial }; },
  useEffect(callback) { callback(); },
};
const require = createRequire(import.meta.url);
const editor = await loadModule('../app/evaluation/search-prompt-manager.tsx', { react: hooks, 'react/jsx-runtime': require('react/jsx-runtime'), '@/app/lib/evaluation': rules, '@/app/lib/standard-search-prompt': prompts });
let props = { state: original, bureau: '기획국', busy: false, dirty(value) { dirtyValues.push(value); }, save: async () => false };
function nodes(element, result = []) {
  if (Array.isArray(element)) { element.forEach(child => nodes(child, result)); return result; }
  if (element?.props) { result.push(element); nodes(element.props.children, result); }
  return result;
}
function render() { cursor = 0; return nodes(editor.default(props)); }
const input = tree => tree.find(node => node.type === 'textarea');
const submitButton = tree => tree.find(node => node.type === 'button' && node.props.type === 'submit');
const submit = tree => tree.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
const tick = () => new Promise(resolve => setImmediate(resolve));
let tree = render();
assert.equal(input(tree).props.value, prompts.STANDARD_SEARCH_PROMPT);
assert.equal(submitButton(tree).props.disabled, true);
input(tree).props.onChange({ target: { value: text } });
tree = render(); submit(tree); await tick(); tree = render();
assert.equal(input(tree).props.value, text);
assert.equal(dirtyValues.at(-1), true);
assert.equal(submitButton(tree).props.disabled, false);
let finish, calls = 0;
props.save = async command => { calls++; assert.equal(command.text, text); return new Promise(resolve => { finish = resolve; }); };
tree = render();
submit(tree); submit(tree);
assert.equal(calls, 1);
tree = render(); assert.equal(input(tree).props.disabled, true);
props.state = saved; finish(true); await tick(); tree = render();
assert.equal(dirtyValues.at(-1), false);
assert.equal(submitButton(tree).props.disabled, true);
assert.equal(tree.find(node => node.type === 'time').props.dateTime, now.toISOString());
input(tree).props.onChange({ target: { value: '   ' } });
tree = render(); assert.equal(submitButton(tree).props.disabled, true); submit(tree); await tick(); assert.equal(calls, 1);
input(tree).props.onChange({ target: { value: '다음 수정' } }); props.busy = true;
tree = render(); assert.equal(input(tree).props.disabled, true); assert.equal(submitButton(tree).props.disabled, true);

const mf = new Miniflare({ modules: true, script: 'export default { fetch(){return new Response("test")} }', compatibilityDate: '2026-05-01', d1Databases: { DB: 'search-prompt-test' }, d1Persist: false });
try {
  const db = await mf.getD1Database('DB');
  const migration = await loadModule('../app/lib/evaluation-bureau.ts', { '@/app/lib/evaluation': rules });
  const dependencies = { '@/app/lib/db': { appDatabase: async () => db }, '@/app/lib/evaluation': rules, '@/app/lib/bureaus': bureaus, '@/app/lib/evaluation-bureau': migration };
  const store = await loadModule('../app/lib/evaluation-store.ts', dependencies);
  const before = await store.readEvaluationState('기획국');
  const other = await store.readEvaluationState('전기국');
  const persisted = await store.mutateEvaluationState(before.revision, { admin: true }, action, '기획국');
  const reloaded = await loadModule('../app/lib/evaluation-store.ts', dependencies);
  assert.deepEqual(await reloaded.readEvaluationState('기획국'), persisted);
  assert.deepEqual(await reloaded.readEvaluationState('전기국'), other);
  assert.equal(prompts.standardSearchPromptText(persisted.state), text);
  await assert.rejects(() => store.mutateEvaluationState(before.revision, { admin: true }, action, '기획국'), error => error.status === 409);
  await assert.rejects(() => store.mutateEvaluationState(persisted.revision, {}, action, '기획국'), error => error.status === 403);
  const api = await loadModule('../app/api/evaluation/route.ts', { 'next/server': { NextResponse: { json: (payload, init) => new Response(JSON.stringify(payload), init) } }, '@/app/lib/evaluation': rules, '@/app/lib/bureaus': bureaus, '@/app/lib/evaluation-store': store });
  const request = (query, body) => ({ nextUrl: new URL(`http://localhost/api/evaluation${query}`), text: async () => JSON.stringify(body) });
  const visible = await api.GET(request('?bureau=기획국'));
  assert.equal((await visible.json()).state.standardSearchPrompt.text, text);
  const rejected = await api.POST(request('?bureau=기획국', { revision: persisted.revision, actor: { admin: 'true' }, action }));
  assert.equal(rejected.status, 403);
  const scoped = await api.POST(request('?bureau=전기국', { revision: other.revision, bureau: '기획국', actor: { admin: true }, action: { ...action, text: '전기국 전용' } }));
  assert.equal(scoped.status, 200);
  assert.equal((await store.readEvaluationState('전기국')).state.standardSearchPrompt.text, '전기국 전용');
  assert.equal((await store.readEvaluationState('기획국')).state.standardSearchPrompt.text, text);
  const invalid = await api.POST(request('?bureau=기획국', { revision: persisted.revision, actor: { admin: true }, action: { ...action, text: '' } }));
  assert.equal(invalid.status, 400);
  assert.deepEqual(await store.readEvaluationState('기획국'), persisted);
  console.log('Prompt management passed: exact text, default fallback, administrator validation, editor duplicate/failure guards, D1 persistence, conflicts, API permissions and bureau isolation.');
} finally { await mf.dispose(); }
