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
function workspace({ admin = false, bureau = '기획국', storedUser = '', router }) {
  const slots = [], effects = [], requests = [], modules = new Map(), listeners = new Map(), channels = new Set(), confirmations = [];
  const storage = new Map();
  const scope = `simsadesk-workspace-${admin ? 'admin' : 'user'}:bureau:${bureau}`;
  storage.set(scope, JSON.stringify({ userId: storedUser, monthId: '2026-11', view: 'ai' }));
  const props = { bureau, admin };
  let cursor = 0, changed = true, tree, confirmAnswer = true;
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
      confirm: message => { confirmations.push(message); return confirmAnswer; },
      addEventListener: (event, callback) => { const values = listeners.get(event) ?? new Set(); values.add(callback); listeners.set(event, values); },
      removeEventListener: (event, callback) => listeners.get(event)?.delete(callback),
    },
    document: { addEventListener() {}, removeEventListener() {} },
    BroadcastChannel: class {
      constructor() { channels.add(this); }
      close() { channels.delete(this); }
      postMessage() {}
    },
    fetch(input, options) {
      const url = new URL(input, 'https://example.test');
      requests.push(url);
      return router(url, options);
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
    if (changed) { changed = false; cursor = 0; tree = ui.default(props); }
  }
  return {
    domain, requests, confirmations,
    get tree() { return tree; },
    get selection() { return JSON.parse(storage.get(scope)); },
    get text() { return JSON.stringify(tree); },
    focus() { for (const callback of [...(listeners.get('focus') ?? [])]) callback(); },
    broadcast(data) { for (const channel of [...channels]) channel.onmessage?.({ data }); },
    setConfirm(value) { confirmAnswer = value; },
    setProps(next) { Object.assign(props, next); changed = true; },
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

function adminContent(app) {
  const node = nodes(app.tree).find(value => value.props && typeof value.props.onNavigate === 'function' && 'section' in value.props);
  assert(node, 'The administrator content must be mounted.');
  return node;
}

// React preserves a component's local filters/selection only while both its type
// and key stay stable. Exercise the real focus/BroadcastChannel load callbacks.
for (const section of ['cases', 'overview']) {
  let app, revision = 5, current;
  app = workspace({ admin: true, router: async () => reply(200, { revision, state: current ?? publicState(app.domain) }) });
  await app.flush();
  adminContent(app).props.onNavigate(section);
  await app.flush();
  const before = adminContent(app), requestCount = app.requests.length;
  app.focus();
  await app.flush();
  assert.equal(app.requests.length, requestCount + 1, 'Focus still fetches current operational data.');
  assert.equal(adminContent(app).key, before.key, 'Identical data must retain administrator query, filters and selected case.');
  assert.equal(adminContent(app).type, before.type);

  current = publicState(app.domain); current.users[0].name = '다른 창에서 변경한 이름'; revision++;
  app.broadcast({ type: 'saved', bureau: '기획국' });
  await app.flush();
  assert.equal(adminContent(app).props.state.users[0].name, '다른 창에서 변경한 이름', 'Updated data must still reach the existing administrator view.');
  assert.equal(adminContent(app).key, before.key, 'An unrelated saved change must retain the current administrator view instance.');
  const afterBroadcast = app.requests.length;
  app.broadcast({ type: 'saved', bureau: '화학국' });
  await app.flush();
  assert.equal(app.requests.length, afterBroadcast, 'Another bureau must not refresh this workspace.');

  adminContent(app).props.selectMonth('2026-12');
  await app.flush();
  assert.notEqual(adminContent(app).key, before.key, 'Changing the operating month must retain its separate form boundary.');
}

// A conflicted form can be discarded deliberately, but failed refreshes must
// preserve its input and dirty warning until current data actually arrives.
{
  let app, getStatus = 200;
  app = workspace({ admin: true, router: async (_url, options) => options?.method === 'POST'
    ? reply(409, { error: '다른 화면에서 업무 자료가 변경되었습니다.' })
    : reply(getStatus, getStatus === 200 ? { revision: 6, state: publicState(app.domain) } : { error: '자료를 불러오지 못했습니다.' }) });
  await app.flush();
  adminContent(app).props.onNavigate('cases');
  await app.flush();
  const originalKey = adminContent(app).key;
  adminContent(app).props.dirty(true);
  await app.flush();
  const dirtyRequests = app.requests.length;
  app.focus(); await app.flush();
  assert.equal(app.requests.length, dirtyRequests, 'Background refresh must not replace unsaved input.');
  assert.equal(await adminContent(app).props.save({ type: 'saveNotice', markdown: '미저장 입력' }), false);
  await app.flush();
  app.setConfirm(false);
  button(app, '입력 버리고 최신 자료 불러오기').props.onClick();
  await app.flush();
  assert.equal(app.requests.length, dirtyRequests + 1, 'Cancelling discard must not load data.');
  assert.equal(adminContent(app).key, originalKey);
  assert.equal(adminContent(app).props.hasUnsaved, true);

  app.setConfirm(true); getStatus = 500;
  button(app, '입력 버리고 최신 자료 불러오기').props.onClick();
  await app.flush();
  assert.equal(adminContent(app).key, originalKey, 'A failed reload must leave the current editor intact.');
  assert.equal(adminContent(app).props.hasUnsaved, true, 'A failed reload must retain the unsaved-input guard.');
  getStatus = 200;
  button(app, '입력 버리고 최신 자료 불러오기').props.onClick();
  await app.flush();
  assert.notEqual(adminContent(app).key, originalKey, 'Successful explicit discard must recreate the form from current data.');
  assert.equal(adminContent(app).props.hasUnsaved, false);
  assert.equal(app.confirmations.length, 3);
}

// Preserve the existing refresh/reinitialization behavior of the ordinary user
// selection and AI lists; only administrator background refreshes change here.
{
  let app;
  app = workspace({ storedUser: 'remembered-user', router: async () => reply(200, { revision: 7, state: publicState(app.domain) }) });
  await app.flush();
  const content = () => nodes(app.tree).find(value => value.props?.user?.id === 'remembered-user' && value.props.month);
  const before = content(); assert(before);
  app.focus(); await app.flush();
  assert.notEqual(content().key, before.key, 'Ordinary user forms retain their existing data refresh behavior.');
}

// A bureau switch must not reuse the previous administrator form or briefly
// render the old bureau's data before the new session/load effects complete.
{
  let app;
  app = workspace({ admin: true, router: async url => {
    const state = publicState(app.domain); state.users[0].bureau = url.searchParams.get('bureau');
    return reply(200, { revision: 8, state });
  } });
  await app.flush();
  adminContent(app).props.onNavigate('cases'); await app.flush();
  const before = adminContent(app);
  app.setProps({ bureau: '화학국' }); app.renderBeforeEffects();
  assert(!nodes(app.tree).some(value => value.props?.state === before.props.state), 'Old bureau payload must be hidden before effects run.');
  await app.flush();
  assert.equal(adminContent(app).props.bureau, '화학국');
  assert.equal(adminContent(app).props.state.users[0].bureau, '화학국');
  assert.notEqual(adminContent(app).key, before.key);
}

console.log('Workspace session recovery passed: expired-account recovery, late-response races, administrator focus/broadcast filter retention, explicit discard/failure guards and month/bureau isolation.');
