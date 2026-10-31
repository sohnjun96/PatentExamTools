import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as rules from '../app/lib/evaluation.ts';
import * as bureaus from '../app/lib/bureaus.ts';

const require = createRequire(import.meta.url);
async function compiled(relative) {
  const source = await readFile(new URL(relative, import.meta.url), 'utf8');
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
}
const workspaceCode = await compiled('../app/evaluation/task/task-workspace.tsx');
const taskCode = await compiled('../app/lib/task-window.ts');
const guidanceCode = await compiled('../app/lib/workspace-location.ts');
function evaluate(code, dependencies, context = {}) {
  const record = { exports: {} };
  vm.runInNewContext(code, { module: record, exports: record.exports, require: id => {
    if (id in dependencies) return dependencies[id];
    return require(id);
  }, console, structuredClone, URL, URLSearchParams, Blob, ...context });
  return record.exports;
}
const task = evaluate(taskCode, { './bureaus': bureaus, './evaluation': rules });
const guidance = evaluate(guidanceCode, {});
const settle = () => new Promise(resolve => setImmediate(resolve));
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const text = value => Array.isArray(value) ? value.map(text).join('') : typeof value === 'string' || typeof value === 'number' ? String(value) : value?.props ? text(value.props.children) : '';
function nodes(element, found = []) {
  if (!element || typeof element !== 'object') return found;
  if (Array.isArray(element)) { element.forEach(child => nodes(child, found)); return found; }
  if (!element.props) return found;
  found.push(element); nodes(element.props.children, found); return found;
}
function LiteratureEditorStub() { return null; }
function EmptyStub() { return null; }
function jsonResponse(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) }; }
const snapshot = label => ({ documents: [{ kind: 'patent', number: ` ${label} `, url: 'https://', reportMarkdown: '  ## 작성 중\n  ' }], bulkInput: ` { "documents": [ ${label}\n` });

function harness(seed = rules.createDemoState('2026-11'), requestPatch = {}) {
  const request = { kind: 'result', userId: 'demo-user-1', caseId: seed.cases[0].id, monthId: '2026-11', methodId: 'chatgpt', ...requestPatch };
  const actor = { userId: request.userId };
  const server = { state: structuredClone(seed), revision: 0, calls: [], beforePost: null };
  const hooks = [], effects = [], listeners = new Map();
  let hookIndex = 0, tree = [], focusCount = 0, confirmCount = 0;
  const react = {
    useState(initial) {
      const index = hookIndex++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].value, next => { hooks[index].value = typeof next === 'function' ? next(hooks[index].value) : next; }];
    },
    useRef(initial) { const index = hookIndex++; return (hooks[index] ??= { value: { current: initial } }).value; },
    useCallback(callback, deps) {
      const index = hookIndex++;
      if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) hooks[index] = { value: callback, deps };
      return hooks[index].value;
    },
    useEffect(effect, deps) {
      const index = hookIndex++;
      const previous = hooks[index];
      if (!previous || !sameDeps(previous.deps, deps)) effects.push(() => {
        previous?.cleanup?.(); hooks[index] = { deps, cleanup: effect() };
      });
    },
  };
  const windowStub = {
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
    confirm() { confirmCount++; return true; }, close() {}, closed: false,
    setTimeout() {}, location: { assign() {} },
  };
  const fetchStub = async (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    server.calls.push({ url, method, body });
    if (method === 'GET') return jsonResponse(200, { state: rules.visibleState(server.state, actor), revision: server.revision });
    const injected = await server.beforePost?.(body);
    if (injected) return injected;
    if (body.revision !== server.revision) return jsonResponse(409, { error: '다른 화면에서 업무 자료가 변경되었습니다.' });
    server.state = rules.applyAction(server.state, actor, body.action); server.revision++;
    return jsonResponse(200, { state: rules.visibleState(server.state, actor), revision: server.revision });
  };
  const Workspace = evaluate(workspaceCode, {
    react, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@/app/lib/evaluation': rules, '@/app/lib/bureaus': bureaus,
    '@/app/lib/task-window': task, '@/app/lib/workspace-location': guidance,
    '@/app/components/app-icon': { __esModule: true, default: EmptyStub },
    '@/app/components/target-publication-download': { __esModule: true, default: EmptyStub },
    '../literature-editor': { __esModule: true, default: LiteratureEditorStub },
    './evaluation-reader': { __esModule: true, default: EmptyStub },
    '../evaluation.css': {}, './task.css': {},
  }, { window: windowStub, document: { title: '' }, fetch: fetchStub, BroadcastChannel: class { postMessage() {} close() {} } }).default;
  const api = {
    server, request,
    render() {
      hookIndex = 0; tree = nodes(Workspace({ request }));
      for (const node of tree) if (node.props.ref && typeof node.props.ref === 'object') node.props.ref.current = { focus() { focusCount++; } };
      effects.splice(0).forEach(effect => effect()); return tree;
    },
    async mount() { api.render(); await settle(); api.render(); },
    editor() { return tree.find(node => node.type === LiteratureEditorStub); },
    button(label) { return tree.find(node => node.type === 'button' && text(node.props.children) === label); },
    posts() { return server.calls.filter(call => call.method === 'POST'); },
    gets() { return server.calls.filter(call => call.method === 'GET'); },
    unloadBlocked() { let prevented = false; listeners.get('beforeunload')?.({ preventDefault() { prevented = true; }, returnValue: undefined }); return prevented; },
    get focusCount() { return focusCount; }, get confirmCount() { return confirmCount; },
    remoteDraft(editorState, caseId = request.caseId) {
      server.state = rules.applyAction(server.state, actor, { type: 'saveResultDraft', caseId, methodId: request.methodId, editorState }); server.revision++;
    },
    dispose() { for (const hook of hooks) hook?.cleanup?.(); },
  };
  return api;
}

// Unfinished fields and unapplied JSON must be restored through editor props.
{
  const seed = rules.createDemoState('2026-11'), original = snapshot('restored');
  const state = rules.applyAction(seed, { userId: 'demo-user-1' }, { type: 'saveResultDraft', caseId: seed.cases[0].id, methodId: 'chatgpt', editorState: original });
  const view = harness(state); await view.mount();
  assert.deepEqual(view.editor().props.initialDocuments, original.documents);
  assert.equal(view.editor().props.initialBulkInput, original.bulkInput);
  assert.notEqual(task.taskContentKey(seed, view.request), task.taskContentKey(state, view.request), 'A remote raw draft changes the task content key.');
  view.dispose();
}

// Each person starts with only their own draft, even when a colleague already delivered the same AI.
{
  const seed = rules.createDemoState('2026-11');
  seed.users.find(user => user.id === 'demo-user-3').roles.push('ai');
  seed.personnel.assignments.push({ groupId: 'group-a', methodId: 'claude', userId: 'demo-user-3' });
  const originalColleagueResult = structuredClone(rules.resultFor(seed, seed.cases[0].id, 'claude', 'demo-user-2'));
  const view = harness(seed, { userId: 'demo-user-3', methodId: 'claude' }); await view.mount();
  assert.deepEqual(view.editor().props.initialDocuments, [], 'A new assignee must not inherit the colleague\'s delivered or private draft documents.');
  const ownDraft = snapshot('second-assignee');
  assert.equal(await view.editor().props.onAutoSave(ownDraft), true); view.render();
  assert.deepEqual(view.editor().props.initialDocuments, ownDraft.documents);
  assert.deepEqual(rules.resultFor(view.server.state, view.request.caseId, 'claude', 'demo-user-2'), originalColleagueResult);
  assert.deepEqual(rules.resultFor(view.server.state, view.request.caseId, 'claude', 'demo-user-3').draftEditorState, ownDraft);
  view.dispose();
}

// A quiet request must leave editing enabled and preserve close protection.
{
  const view = harness(); await view.mount(); const originalEditor = view.editor();
  originalEditor.props.dirty(true);
  let release;
  view.server.beforePost = () => new Promise(resolve => { release = resolve; });
  const pending = originalEditor.props.onAutoSave(snapshot('first'));
  view.render();
  assert.equal(view.editor().props.disabled, false, 'Network autosave may not disable typing.');
  assert.equal(view.button('창 닫기').props.disabled, true, 'Closing waits for the in-flight request.');
  assert.equal(view.unloadBlocked(), true);
  release(); assert.equal(await pending, true); view.render();
  assert.equal(view.unloadBlocked(), true, 'Only the editor may clear dirty after checking which snapshot was saved.');
  assert.equal(view.posts()[0].body.action.type, 'saveResultDraft');
  view.server.beforePost = null;
  assert.equal(await originalEditor.props.onAutoSave(snapshot('second')), true);
  assert.deepEqual(view.posts().map(call => call.body.revision), [0, 1], 'Even callbacks from an older render use the latest successful revision.');
  const valid = rules.normalizeLiteratureDocuments([{ kind: 'patent', number: 'KR20100001234A', reportMarkdown: '## 공개할 보고서' }]);
  assert.equal(await originalEditor.props.onSave(valid, true), true);
  assert.equal(view.posts().at(-1).body.revision, 2, 'Explicit publication follows the most recent autosave revision.');
  assert.equal(view.posts().at(-1).body.action.publish, true);
  assert.equal(rules.resultFor(view.server.state, view.request.caseId, 'chatgpt').draftEditorState, undefined);
  view.render(); assert.equal(view.unloadBlocked(), false, 'Successful explicit publication clears close protection.');
  view.dispose();
}

// Unrelated cases share a revision; retry exactly once without resetting this editor.
{
  const view = harness(); await view.mount(); const editor = view.editor(); const key = editor.key;
  editor.props.dirty(true);
  const otherCase = view.server.state.cases.find(item => item.examinerId === view.request.userId && item.id !== view.request.caseId);
  view.remoteDraft(snapshot('other-case'), otherCase.id);
  assert.equal(await editor.props.onAutoSave(snapshot('local')), true);
  assert.deepEqual(view.posts().map(call => call.body.revision), [0, 1]);
  assert.equal(view.gets().length, 2, 'One conflict causes one bounded refresh.');
  view.render(); assert.equal(view.editor().key, key, 'Rebasing an unrelated revision cannot remount the live form.');
  assert.equal(view.unloadBlocked(), true);
  view.dispose();
}

// A colleague saving the same AI/case can rebase without overwriting either person's draft.
{
  const seed = rules.createDemoState('2026-11');
  seed.users.find(user => user.id === 'demo-user-3').roles.push('ai');
  seed.personnel.assignments.push({ groupId: 'group-a', methodId: 'claude', userId: 'demo-user-3' });
  const view = harness(seed, { userId: 'demo-user-2', methodId: 'claude' }); await view.mount();
  const editor = view.editor(); editor.props.dirty(true);
  const colleagueDraft = snapshot('colleague');
  view.server.state = rules.applyAction(view.server.state, { userId: 'demo-user-3' }, { type: 'saveResultDraft', caseId: view.request.caseId, methodId: 'claude', editorState: colleagueDraft }); view.server.revision++;
  const ownDraft = snapshot('own');
  assert.equal(await editor.props.onAutoSave(ownDraft), true);
  assert.deepEqual(view.posts().map(call => call.body.revision), [0, 1]);
  assert.deepEqual(rules.resultFor(view.server.state, view.request.caseId, 'claude', 'demo-user-2').draftEditorState, ownDraft);
  assert.deepEqual(rules.resultFor(view.server.state, view.request.caseId, 'claude', 'demo-user-3').draftEditorState, colleagueDraft);
  view.dispose();
}

// A second concurrent update must not produce an unbounded automatic retry loop.
{
  const view = harness(); await view.mount();
  const otherCase = view.server.state.cases.find(item => item.examinerId === view.request.userId && item.id !== view.request.caseId);
  view.remoteDraft(snapshot('other-first'), otherCase.id);
  let posts = 0;
  view.server.beforePost = () => { if (++posts === 2) view.remoteDraft(snapshot('other-second'), otherCase.id); };
  assert.equal(await view.editor().props.onAutoSave(snapshot('local')), false);
  assert.equal(view.posts().length, 2, 'A repeated 409 ends after one rebase attempt.');
  assert.equal(view.gets().length, 2);
  view.dispose();
}

// Same-result edits in another window must win until the user reloads explicitly.
{
  const view = harness(); await view.mount(); const editor = view.editor(); editor.props.dirty(true);
  const remote = snapshot('remote'); view.remoteDraft(remote);
  assert.equal(await editor.props.onAutoSave(snapshot('local')), false);
  assert.equal(view.posts().length, 1, 'A different persisted draft is never overwritten during rebase.');
  assert.deepEqual(rules.resultFor(view.server.state, view.request.caseId, 'chatgpt').draftEditorState, remote);
  view.render(); assert.equal(view.editor().props.disabled, false, 'A conflict leaves the current input editable.');
  const calls = view.server.calls.length;
  assert.equal(await view.editor().props.onAutoSave(snapshot('later-local')), false);
  assert.equal(view.server.calls.length, calls, 'Quiet writes stop after a real conflict until reload.');
  view.button('최신 자료 다시 불러오기').props.onClick(); await settle(); view.render();
  assert.equal(view.confirmCount, 1, 'Reloading a dirty form requires the established discard confirmation.');
  assert.deepEqual(view.editor().props.initialDocuments, remote.documents);
  assert.equal(view.editor().props.initialBulkInput, remote.bulkInput);
  assert.equal(await view.editor().props.onAutoSave(snapshot('after-reload')), true, 'Reload explicitly re-enables autosave.');
  view.dispose();
}

// Failed background writes show feedback while leaving the typing focus alone.
{
  const view = harness(); await view.mount(); view.editor().props.dirty(true);
  view.server.beforePost = () => jsonResponse(500, { error: '일시적인 저장 오류입니다.' });
  assert.equal(await view.editor().props.onAutoSave(snapshot('offline')), false); view.render();
  assert.equal(view.focusCount, 0, 'Background errors cannot steal focus from the active input.');
  assert.equal(view.editor().props.disabled, false);
  assert.equal(view.unloadBlocked(), true);
  assert(view.button('입력 보관 파일 저장'), 'Failure retains the attempted snapshot for the existing backup action.');
  view.dispose();
}

console.log('Task workspace autosave passed: raw draft restoration, editable quiet saves, dirty protection, latest revisions, publication after autosave, one bounded rebase, same-result conflict isolation, explicit reload and non-disruptive failures.');
