import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as rules from '../app/lib/evaluation.ts';

const require = createRequire(import.meta.url);
let values = [], effectRecords = new Map(), effectQueue = [], timers = new Map();
let hookIndex = 0, nextTimer = 0, now = 0, epoch = 0, needsRender = false, mounted = false;
let props, tree = [], autosaves = [], publications = [], dirtyChanges = [], draftChanges = [];
const schedule = (callback, delay = 0) => { const id = ++nextTimer; timers.set(id, { at: now + Number(delay), callback }); return id; };
const cancel = id => { timers.delete(id); };
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const hooks = {
  useId: () => 'autosave-test',
  useState(initial) {
    const index = hookIndex++, ownEpoch = epoch, slots = values;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], update => {
      if (ownEpoch !== epoch || !mounted) return;
      const next = typeof update === 'function' ? update(slots[index]) : update;
      if (!Object.is(next, slots[index])) { slots[index] = next; needsRender = true; }
    }];
  },
  useRef(initial) {
    const index = hookIndex++;
    if (!(index in values)) values[index] = { current: initial };
    return values[index];
  },
  useEffect(effect, deps) {
    const index = hookIndex++, previous = effectRecords.get(index);
    if (sameDeps(previous?.deps, deps)) return;
    effectQueue.push(() => {
      previous?.cleanup?.();
      effectRecords.set(index, { deps, cleanup: effect() });
    });
  },
  useCallback(callback, deps) {
    const index = hookIndex++;
    if (!sameDeps(values[index]?.deps, deps)) values[index] = { deps, callback };
    return values[index].callback;
  },
};
function ReaderStub() { return null; }
function IconStub() { return null; }
const source = await readFile(new URL('../app/evaluation/task/result-editor.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const moduleRecord = { exports: {} };
vm.runInNewContext(compiled, {
  module: moduleRecord, exports: moduleRecord.exports,
  setTimeout: schedule, clearTimeout: cancel, window: { setTimeout: schedule, clearTimeout: cancel },
  requestAnimationFrame: callback => schedule(callback), console,
  require(id) {
    if (id === 'react') return hooks;
    if (id === '@/app/lib/evaluation') return rules;
    if (id === './literature-reader') return { __esModule: true, default: ReaderStub };
    if (id === '@/app/components/app-icon') return { __esModule: true, default: IconStub };
    if (id.endsWith('.css')) return {};
    return require(id);
  },
});
const LiteratureEditor = moduleRecord.exports.default;
const initial = [{ kind: 'patent', number: 'KR20100001234A', url: 'https://example.test/source', reportMarkdown: '## 기존 보고서' }];
const copy = value => JSON.parse(JSON.stringify(value));
function unmount() {
  mounted = false;
  for (const effect of effectRecords.values()) effect.cleanup?.();
  effectRecords.clear();
}
function reset(overrides = {}) {
  unmount(); epoch++; values = []; effectQueue = []; timers = new Map(); now = 0; nextTimer = 0;
  autosaves = []; publications = []; dirtyChanges = []; draftChanges = []; needsRender = false; mounted = true;
  props = {
    initialDocuments: copy(initial), disabled: false, dirty: value => dirtyChanges.push(value),
    onSave: async (documents, publish) => { publications.push({ documents: copy(documents), publish }); return true; },
    onAutoSave: async snapshot => { autosaves.push(copy(snapshot)); return true; },
    onDraftChange: snapshot => { draftChanges.push(copy(snapshot)); }, ...overrides,
  };
  return render();
}
function nodes(element, result = []) {
  if (!element || typeof element !== 'object') return result;
  if (Array.isArray(element)) { element.forEach(child => nodes(child, result)); return result; }
  if (!element.props) return result;
  result.push(element); nodes(element.props.children, result); return result;
}
function render() {
  if (!mounted) return tree;
  let passes = 0;
  do {
    assert(passes++ < 30, 'The autosave effects must settle without a render loop.');
    needsRender = false; hookIndex = 0; effectQueue = [];
    tree = nodes(LiteratureEditor(props));
    const effects = effectQueue; effectQueue = []; effects.forEach(effect => effect());
  } while (needsRender);
  return tree;
}
async function flush() {
  for (let turn = 0; turn < 12; turn++) { await Promise.resolve(); if (needsRender && mounted) render(); }
  return render();
}
async function advance(milliseconds) {
  const target = now + milliseconds;
  for (let count = 0; count < 100; count++) {
    const entry = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
    if (!entry) { now = target; return flush(); }
    const [id, timer] = entry; now = timer.at; timers.delete(id); timer.callback(); await flush();
  }
  assert.fail('Autosave must not enter an unbounded timer loop.');
}
const text = value => Array.isArray(value) ? value.map(text).join('') : typeof value === 'string' || typeof value === 'number' ? String(value) : value?.props ? text(value.props.children) : '';
const button = label => tree.find(node => node.type === 'button' && text(node.props.children) === label);
const field = suffix => tree.find(node => ['input', 'textarea', 'select'].includes(node.type) && node.props.id?.endsWith(suffix));
function edit(suffix, value) { field(suffix).props.onChange({ target: { value } }); return render(); }
const statusIncludes = word => tree.some(node => node.props.role === 'status' && text(node.props.children).includes(word));

reset();
await advance(5000);
assert.equal(autosaves.length, 0, 'Opening or restoring an unchanged editor must not write a draft.');
assert.equal(button('임시저장'), undefined, 'Autosave-enabled editors must not require a separate temporary-save action.');
edit('-report', '첫 번째 입력');
assert.equal(draftChanges.at(-1).documents[0].reportMarkdown, '첫 번째 입력', 'Recovery must receive the current edit synchronously, before autosave debounce.');
assert.equal(autosaves.length, 0);
await advance(400);
edit('-report', '연속 입력의 마지막 내용');
await advance(799);
assert.equal(autosaves.length, 0);
await advance(1);
assert.equal(autosaves.length, 1, 'Consecutive edits must debounce into one server draft.');
assert.equal(autosaves[0].documents[0].reportMarkdown, '연속 입력의 마지막 내용');
assert.equal(autosaves[0].bulkInput, '');
assert.equal(publications.length, 0, 'Background autosave must never publish search results.');
assert.equal(dirtyChanges.at(-1), false);
assert(statusIncludes('자동 저장됨'));

reset({ initialDocuments: [{ kind: 'patent', number: '', reportMarkdown: '  미완성 보고서  ' }], initialBulkInput: '  {"documents": [\n' });
assert.equal(field('-number').props.value, '');
assert.equal(field('-bulk').props.value, '  {"documents": [\n');
await advance(1000);
assert.equal(autosaves.length, 0);
edit('-report', '  수정 중인 보고서\n\n');
await advance(800);
assert.deepEqual(autosaves[0], { documents: [{ kind: 'patent', number: '', reportMarkdown: '  수정 중인 보고서\n\n' }], bulkInput: '  {"documents": [\n' }, 'Autosave must preserve invalid unfinished fields, whitespace and unapplied JSON without publication normalization.');

let finishFirst, finishSecond;
reset({ onAutoSave: snapshot => {
  autosaves.push(copy(snapshot));
  return new Promise(resolve => { if (autosaves.length === 1) finishFirst = resolve; else finishSecond = resolve; });
} });
edit('-report', '저장 요청 A');
await advance(800);
assert.equal(autosaves.length, 1);
assert.equal(field('-report').props.disabled, false, 'An in-flight autosave must allow continued typing.');
edit('-report', '요청 A 도중 작성한 최신 B');
edit('-bulk', '적용 전 JSON B');
assert.equal(draftChanges.at(-1).documents[0].reportMarkdown, '요청 A 도중 작성한 최신 B');
assert.equal(draftChanges.at(-1).bulkInput, '적용 전 JSON B', 'Recovery snapshots include raw JSON entered while an earlier save is in flight.');
await advance(800);
assert.equal(autosaves.length, 1, 'Concurrent edits must wait behind the in-flight write.');
finishFirst(true);
await flush();
assert.equal(dirtyChanges.at(-1), true, 'An older successful response must not clear newer unsaved input.');
await advance(800);
assert.equal(autosaves.length, 2);
assert.equal(autosaves[1].documents[0].reportMarkdown, '요청 A 도중 작성한 최신 B');
assert.equal(autosaves[1].bulkInput, '적용 전 JSON B');
finishSecond(true);
await flush();
assert.equal(dirtyChanges.at(-1), false);
assert.equal(field('-report').props.value, '요청 A 도중 작성한 최신 B');

let failNext = true;
reset({ onAutoSave: async snapshot => { autosaves.push(copy(snapshot)); return !failNext; } });
edit('-report', '네트워크 오류에도 유지할 내용');
await advance(800);
assert.equal(autosaves.length, 1);
assert.equal(dirtyChanges.at(-1), true);
assert.equal(field('-report').props.value, '네트워크 오류에도 유지할 내용');
assert(button('자동 저장 다시 시도'));
const requestCountAtFailure = autosaves.length;
edit('-report', '저장 실패 후 곧바로 입력한 최신 내용');
assert.equal(draftChanges.at(-1).documents[0].reportMarkdown, '저장 실패 후 곧바로 입력한 최신 내용');
assert.equal(autosaves.length, requestCountAtFailure, 'Refreshing the recovery snapshot must not bypass the debounce or send a request.');
// Return to the failed-save state so the retry-button behavior below remains covered.
await advance(800);
assert(button('자동 저장 다시 시도'));
await advance(5000);
assert.equal(autosaves.length, 2, 'A failed request must not retry forever without user action.');
failNext = false;
button('자동 저장 다시 시도').props.onClick();
await flush();
await advance(800);
assert.equal(autosaves.length, 3);
assert.equal(dirtyChanges.at(-1), false);

reset();
edit('-report', '마감 전 저장 대기');
props.disabled = true; render();
await advance(1000);
assert.equal(autosaves.length, 0, 'A phase closing must cancel a pending background save.');
reset();
edit('-report', '닫기 전에 작성한 초안');
unmount();
await advance(1000);
assert.equal(autosaves.length, 0, 'Unmount cleanup must cancel the debounce timer.');

let finishAfterUnmount;
reset({ onAutoSave: snapshot => { autosaves.push(copy(snapshot)); return new Promise(resolve => { finishAfterUnmount = resolve; }); } });
edit('-report', '이미 요청한 후 닫은 편집기');
await advance(800);
assert.equal(autosaves.length, 1);
const dirtyEventsBeforeUnmount = dirtyChanges.length;
unmount();
finishAfterUnmount(true);
await flush();
assert.equal(dirtyChanges.length, dirtyEventsBeforeUnmount, 'A completed request for an unmounted editor must not clear another editor\'s dirty guard.');

reset();
const deleteDocument = tree.find(node => node.type === 'button' && node.props['aria-label'] === `${initial[0].number} 삭제`);
deleteDocument.props.onClick(); render();
assert.deepEqual(draftChanges.at(-1), { documents: [], bulkInput: '' }, 'Deleting the final document updates recovery synchronously.');
await advance(800);
assert.deepEqual(autosaves[0], { documents: [], bulkInput: '' }, 'Deleting the last document must also autosave.');

let finishBeforePublish;
let activeWrites = 0;
reset({
  onAutoSave: snapshot => { autosaves.push(copy(snapshot)); activeWrites++; return new Promise(resolve => { finishBeforePublish = value => { activeWrites--; resolve(value); }; }); },
  onSave: async (documents, publish) => { assert.equal(activeWrites, 0, 'Publication must serialize behind an active draft write.'); publications.push({ documents: copy(documents), publish }); return true; },
});
edit('-report', '공개할 최종 보고서');
await advance(800);
button('입력 완료').props.onClick();
await flush();
assert.equal(publications.length, 0);
finishBeforePublish(true);
await flush();
assert.equal(publications.length, 1);
assert.equal(publications[0].publish, true);
assert.equal(publications[0].documents[0].reportMarkdown, '공개할 최종 보고서');
assert.deepEqual(draftChanges.at(-1), { documents: publications[0].documents, bulkInput: '' }, 'After publication, recovery reflects the normalized content now displayed by the editor.');
await advance(2000);
assert.equal(autosaves.length, 1, 'A completed publication must not trigger a stale draft write afterward.');
unmount();
console.log('Literature autosave passed: virtual-clock debounce, immediate recovery snapshots, raw draft restoration, sequential saves, newer-edit protection, retry, disabled/unmount cleanup, empty-list save and explicit publication ordering.');
