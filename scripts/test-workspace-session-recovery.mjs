import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const forbidden = () => reply(403, { error: '선택한 심사국의 활성 사용자를 선택해 주세요.' });
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

// Run the actual component, state transitions, effects and async load callback.
// Only React's scheduler, browser services and unrelated child views are replaced.
function workspace({ admin = false, storedUser = '', router }) {
  const slots = [], effects = [], requests = [], modules = new Map(), listeners = new Map();
  const storage = new Map();
  const scope = `simsadesk-workspace-${admin ? 'admin' : 'user'}:bureau:기획국`;
  storage.set(scope, JSON.stringify({ userId: storedUser, monthId: '2026-11', view: 'ai' }));
  let cursor = 0, changed = true, tree;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        const cell = { value: typeof initial === 'function' ? initial() : initial };
        cell.set = next => { const value = typeof next === 'function' ? next(cell.value) : next; if (!Object.is(value, cell.value)) { cell.value = value; changed = true; } };
        slots[index] = cell;
      }
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { value: callback, deps };
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || !sameDeps(previous.deps, deps)) {
        slots[index] = { deps, cleanup: previous?.cleanup };
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  function Stub() { return null; }
  const context = {
    console, URL, URLSearchParams, Error, TypeError, SyntaxError, structuredClone,
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    window: {
      confirm: () => true,
      addEventListener: (event, callback) => { const values = listeners.get(event) ?? new Set(); values.add(callback); listeners.set(event, values); },
      removeEventListener: (event, callback) => listeners.get(event)?.delete(callback),
    },
    document: { addEventListener() {}, removeEventListener() {} },
    fetch(input) {
      const url = new URL(input, 'https://example.test');
      requests.push(url);
      return router(url);
    },
  };
  function load(relative) {
    if (modules.has(relative)) return modules.get(relative);
    const filename = path.join(root, relative);
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
    const record = { exports: {} };
    const localRequire = id => {
      if (id === 'react') return hooks;
      if (id === 'react/jsx-runtime') return require(id);
      if (id === './admin-workspace') return { __esModule: true, default: Stub, ADMIN_NAV: [{ id: 'examiners', label: '심사관 관리' }], readAdminSection: () => 'examiners' };
      if (id === '@/app/lib/export-workbook') return { exportWorkbook: async () => '' };
      if (id.startsWith('@/app/lib/')) return load(`app/lib/${id.slice('@/app/lib/'.length)}.ts`);
      if (id.startsWith('@/app/components/')) return Stub;
      if (id.endsWith('.css')) return {};
      if (id.startsWith('./')) return load(path.posix.join(path.posix.dirname(relative), `${id}.ts`));
      throw new Error(`Unexpected component dependency: ${id}`);
    };
    vm.runInNewContext(outputText, { ...context, module: record, exports: record.exports, require: localRequire }, { filename });
    modules.set(relative, record.exports);
    return record.exports;
  }
  const ui = load('app/evaluation/workspace.tsx');
  const domain = load('app/lib/evaluation.ts');
  function render() {
    if (changed) { changed = false; cursor = 0; tree = ui.default({ bureau: '기획국', admin }); }
  }
  return {
    domain, requests,
    get tree() { return tree; },
    get selection() { return JSON.parse(storage.get(scope)); },
    get text() { return JSON.stringify(tree); },
    focus() { for (const callback of [...(listeners.get('focus') ?? [])]) callback(); },
    renderBeforeEffects: render,
    async flush() {
      for (let attempt = 0; attempt < 20; attempt++) {
        render();
        while (effects.length) effects.shift()();
        await tick();
        if (!changed && !effects.length) return;
      }
      throw new Error('Workspace effects did not settle (possible retry loop).');
    },
  };
}

function nodes(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) { value.forEach(entry => nodes(entry, found)); return found; }
  if (value.props) { found.push(value); nodes(value.props.children, found); }
  return found;
}
function text(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(text).join('');
  return value?.props ? text(value.props.children) : '';
}
function button(app, label) {
  const match = nodes(app.tree).find(node => node.type === 'button' && (typeof label === 'string' ? text(node.props.children) === label : label.test(text(node.props.children))));
  assert(match, `Button not found: ${label}`);
  assert(!match.props.disabled, `Button disabled: ${label}`);
  return match;
}
function publicState(domain, active = true) {
  const state = domain.createInitialState();
  state.users = [
    { id: 'remembered-user', name: '이전 사용자', bureau: '기획국', division: '시험과', roles: ['examiner'], active },
    { id: 'new-user', name: '새 사용자', bureau: '기획국', division: '시험과', roles: ['ai'], active: true },
  ];
  return state;
}

for (const storedUser of ['removed-user', 'remembered-user']) {
  let app;
  app = workspace({ storedUser, router: async url => url.searchParams.get('userId') ? forbidden() : reply(200, { revision: 3, state: app.domain.visibleState(publicState(app.domain, false), {}) }) });
  await app.flush();
  assert.deepEqual(app.requests.map(url => url.searchParams.get('userId')), [storedUser, ''], 'An expired selection must fall back exactly once through the normal load effect.');
  assert.equal(app.selection.userId, ''); assert.equal(app.selection.view, 'review');
  assert(app.text.includes('examiner-directory-title'));
  assert(!app.text.includes('자료에 연결할 수 없습니다.'));
  assert(!app.text.includes('선택한 심사국의 활성 사용자를 선택해 주세요.'));
  assert(!app.text.includes('시험과 - 이전 사용자'), 'Inactive accounts must not reappear in the recovered directory.');
  assert(button(app, /^시험과 - 새 사용자/));
}

{
  let app;
  app = workspace({ storedUser: 'remembered-user', router: async () => reply(200, { revision: 4, state: publicState(app.domain) }) });
  await app.flush();
  assert.equal(app.selection.userId, 'remembered-user');
  assert.equal(app.requests.length, 1, 'A valid selection must not trigger anonymous reloads.');
  assert(app.text.includes('이전 사용자')); assert(!app.text.includes('자료에 연결할 수 없습니다.'));
}

for (const { admin, storedUser, status } of [
  { admin: true, storedUser: 'remembered-user', status: 403 },
  { admin: false, storedUser: '', status: 403 },
  { admin: false, storedUser: 'remembered-user', status: 500 },
]) {
  const message = status === 500 ? '서버 자료를 불러올 수 없습니다.' : '권한을 확인해 주세요.';
  const app = workspace({ admin, storedUser, router: async () => reply(status, { error: message }) });
  await app.flush();
  assert.equal(app.requests.length, 1); assert.equal(app.selection.userId, admin ? '' : storedUser);
  assert(app.text.includes(message), 'Unrelated authorization and server errors must remain visible.');
  assert(app.text.includes('자료에 연결할 수 없습니다.'));
}

{
  const app = workspace({ storedUser: 'remembered-user', router: async () => { throw new TypeError('Failed to fetch'); } });
  await app.flush();
  assert.equal(app.requests.length, 1); assert.equal(app.selection.userId, 'remembered-user');
  assert(app.text.includes('업무 자료에 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 불러오세요.'));
}

// A previous account's late response must not clear a newly selected account,
// overwrite its payload, show an obsolete error, or initiate another retry.
for (const oldStatus of [200, 403, 500]) {
  let app;
  const delayed = defer();
  let rememberedLoads = 0;
  app = workspace({ storedUser: 'remembered-user', router: async url => {
    if (url.searchParams.get('userId') === 'remembered-user' && ++rememberedLoads === 2) return delayed.promise;
    return reply(200, { revision: 5, state: publicState(app.domain) });
  } });
  await app.flush();
  app.focus();
  button(app, '로그아웃').props.onClick();
  await app.flush();
  button(app, /^시험과 - 새 사용자/).props.onClick();
  await app.flush();
  assert.equal(app.selection.userId, 'new-user'); assert.equal(app.selection.view, 'ai');
  const latest = app.text, count = app.requests.length;
  delayed.resolve(oldStatus === 200 ? reply(200, { revision: 1, state: app.domain.createInitialState() }) : reply(oldStatus, { error: '이전 요청 오류' }));
  await tick(); await app.flush();
  assert.equal(app.selection.userId, 'new-user'); assert.equal(app.selection.view, 'ai');
  assert.equal(app.text, latest); assert.equal(app.requests.length, count);
}

// A queued choice may run before the focus refresh's loading state is painted.
// Invalidate immediately on the choice, rather than waiting for its load effect.
for (const oldStatus of [200, 403, 500]) {
  let app;
  const delayed = defer();
  let anonymousLoads = 0;
  app = workspace({ router: async url => {
    if (!url.searchParams.get('userId') && ++anonymousLoads === 2) return delayed.promise;
    return reply(200, { revision: 5, state: publicState(app.domain) });
  } });
  await app.flush();
  app.focus();
  button(app, /^시험과 - 새 사용자/).props.onClick();
  delayed.resolve(oldStatus === 200 ? reply(200, { revision: 1, state: app.domain.createInitialState() }) : reply(oldStatus, { error: '선택 이전의 오래된 응답' }));
  await tick();
  app.renderBeforeEffects();
  assert(app.text.includes('AI 검색 결과 입력'), 'The new choice must retain its cached account context before its effect runs.');
  assert(!app.text.includes('선택 이전의 오래된 응답'), 'An old error must not flash during the selection/effect gap.');
  await app.flush();
  assert.equal(app.selection.userId, 'new-user'); assert.equal(app.selection.view, 'ai');
  assert.deepEqual(app.requests.map(url => url.searchParams.get('userId')), ['', '', 'new-user']);
}

console.log('Workspace session recovery: removed/inactive selections recover once; valid users, administrator/anonymous 403, server/network errors and late-response races preserved.');
