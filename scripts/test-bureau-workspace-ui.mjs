import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
let hookOverrides = [];
let hookIndex = 0;
let downloads = 0;
const hooks = {
  useState(initial) { const index = hookIndex++; return [index in hookOverrides ? hookOverrides[index] : typeof initial === 'function' ? initial() : initial, () => {}]; },
  useEffect() {}, useCallback: value => value, useMemo: callback => callback(), useRef: value => ({ current: value }),
};
function PdfStub(props) {
  return require('react/jsx-runtime').jsx('button', { disabled: props.disabled, onClick: () => { if (!props.disabled) downloads++; }, children: props.label });
}
function loadModule(relative, append = '') {
  const filename = path.join(root, relative);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8') + append, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const module = { exports: {} };
  const localRequire = (id) => {
    if (id === 'react') return hooks;
    if (id === 'react/jsx-runtime') return require(id);
    if (id.endsWith('/pdf-download')) return PdfStub;
    if (id.endsWith('/workspace-location')) return loadModule('app/lib/workspace-location.ts');
    if (id.endsWith('/bureaus')) return loadModule('app/lib/bureaus.ts');
    if (id.startsWith('@/app/') || id.endsWith('.css')) return {};
    return require(id);
  };
  vm.runInNewContext(outputText, { module, exports: module.exports, require: localRequire, URLSearchParams, console }, { filename });
  return module.exports;
}
const ui = loadModule('app/evaluation/workspace.tsx', '\nexport { UserSettings as TestUserSettings, CaseResource as TestCaseResource };');
const { BUREAUS } = loadModule('app/lib/bureaus.ts');

for (const prefix of ['simsadesk-workspace-user', 'simsadesk-workspace-admin', 'simsadesk-case:user:2026-10', 'simsadesk-ai-task:user:2026-10', 'simsadesk-ai-filter:user:2026-10']) {
  assert.equal(ui.workspaceSessionKey(prefix), prefix, 'Legacy session keys must remain unchanged.');
  const keys = BUREAUS.map(bureau => ui.workspaceSessionKey(prefix, bureau));
  assert.equal(new Set(keys).size, 6, 'Each bureau must have its own session storage key.');
  for (const key of keys) { assert(key.startsWith(prefix)); assert.notEqual(key, prefix); }
}
assert.equal(ui.readScopedWorkspaceLocation(null, true, '기획국').view, 'settings');
assert.equal(ui.readScopedWorkspaceLocation('{bad', true, '기획국').view, 'settings');
assert.equal(ui.readScopedWorkspaceLocation(null, true).view, 'stats');
assert.equal(ui.readScopedWorkspaceLocation(JSON.stringify({ view: 'stats', monthId: '2026-10' }), true, '기획국').view, 'stats');
assert.equal(ui.readScopedWorkspaceLocation(JSON.stringify({ view: 'review', userId: 'legacy' }), true, '기획국').view, 'settings');
const priorScopeState = { privateRecord: '이전 국의 업무' };
const oldScopeKey = ui.workspaceSessionKey('simsadesk-workspace-user', '기획국');
const newScopeKey = ui.workspaceSessionKey('simsadesk-workspace-user', '전기국');
assert.equal(ui.stateForWorkspaceScope(priorScopeState, oldScopeKey, newScopeKey, false), null, 'A prop change must hide the prior bureau before its effects run.');
assert.equal(ui.stateForWorkspaceScope(priorScopeState, oldScopeKey, newScopeKey, true), null, 'A late prior-bureau response must stay hidden even after the new session is restored.');
assert.equal(ui.stateForWorkspaceScope(priorScopeState, newScopeKey, newScopeKey, true), priorScopeState);

function descendants(element, ancestors = [], results = []) {
  if (!element || typeof element !== 'object') return results;
  if (Array.isArray(element)) { for (const value of element) descendants(value, ancestors, results); return results; }
  if (!element.props) return results;
  results.push({ element, ancestors });
  descendants(element.props.children, [...ancestors, element], results);
  return results;
}
hookIndex = 0;
hookOverrides = [];
hookOverrides[0] = { users: [{ id: 'prior-user', name: '이전국비공개이름', roles: ['examiner', 'ai'], active: true }], months: [], cases: [], groups: [], methods: [], results: [], evaluations: [], rankings: [] };
hookOverrides[1] = oldScopeKey;
hookOverrides[3] = 'prior-user';
hookOverrides[4] = 'prior-user';
hookOverrides[7] = false;
hookOverrides[10] = '이전국저장오류';
hookOverrides[11] = '이전국저장안내';
hookOverrides[13] = oldScopeKey;
const beforeScopeEffects = JSON.stringify(ui.default({ bureau: '전기국' }));
assert(!beforeScopeEffects.includes('이전국비공개이름'), 'The first render after a bureau prop change must not disclose the previous user.');
assert(!beforeScopeEffects.includes('이전국저장오류'));
assert(!beforeScopeEffects.includes('이전국저장안내'));
assert(beforeScopeEffects.includes('업무 자료를 불러오고 있습니다.'));
hookIndex = 0; hookOverrides = [];
const item = { id: 'case-2', applicationNumber: '10-2020-0093844', examinerName: '담당 심사관', groupName: '1그룹' };
let selections = 0;
const card = ui.AITaskCard({ item, methodName: '국별 추가 AI', selected: false, complete: false, demo: false, onSelect: () => selections++ });
const cardNodes = descendants(card);
const pdf = cardNodes.find(({ element }) => element.type === PdfStub);
const selection = cardNodes.find(({ element }) => element.type === 'button');
assert(pdf && selection, 'Every task row must expose selection and PDF controls.');
assert.equal(card.props.onClick, undefined, 'The row wrapper must not intercept PDF clicks.');
assert(!pdf.ancestors.some(element => element.type === 'button'), 'PDF controls must not be nested inside the selection button.');
assert.equal(pdf.element.props.applicationNumber, item.applicationNumber);
assert.equal(pdf.element.props.disabled, false);
assert.equal(pdf.element.props.quickDownload, true, 'Task-list PDF controls must download immediately using browser download settings.');
PdfStub(pdf.element.props).props.onClick();
assert.equal(downloads, 1, 'An unselected real case can download its own PDF.');
assert.equal(selections, 0, 'Downloading a PDF must not change the selected task or its editor.');
selection.element.props.onClick();
assert.equal(selections, 1);
const demoCard = ui.AITaskCard({ item, methodName: 'AI', selected: false, complete: true, demo: true, onSelect: () => selections++ });
const demoPdf = descendants(demoCard).find(({ element }) => element.type === PdfStub);
assert.equal(demoPdf.element.props.disabled, true);
PdfStub(demoPdf.element.props).props.onClick();
assert.equal(downloads, 1, 'A fictional case must not request a real PDF.');
const detailResource = ui.TestCaseResource({ item, demo: false });
const detailPdfControls = descendants(detailResource).filter(({ element }) => element.type === PdfStub);
assert.equal(detailPdfControls.length, 2);
assert(detailPdfControls.every(({ element }) => element.props.quickDownload === undefined), 'Detailed PDF controls must retain the existing save-location choice.');

const emptyState = { users: [], groups: [], methods: [], months: [], cases: [], results: [], evaluations: [], rankings: [], isDemo: false };
hookIndex = 0; hookOverrides = [];
const initialUserForm = ui.TestUserSettings({ state: emptyState, bureau: '전기국', busy: false, dirty() {}, save: async () => true });
const bureauField = descendants(initialUserForm).find(({ element }) => element.type === 'input' && element.props.readOnly === true);
assert.equal(bureauField.element.props.value, '전기국', 'A new user must default to the selected bureau with a read-only field.');
let savedAction;
hookIndex = 0;
hookOverrides = [{ name: '새 담당자', bureau: '다른 국', division: '시험과', roles: ['examiner'], active: true }, 'new'];
const userForm = ui.TestUserSettings({ state: emptyState, bureau: '전기국', busy: false, dirty() {}, save: async action => { savedAction = action; return true; } });
const saveButton = descendants(userForm).find(({ element }) => element.type === 'button' && element.props.children === '사용자 등록');
assert(saveButton);
await saveButton.element.props.onClick();
assert.equal(savedAction.user.bureau, '전기국', 'Saving a scoped user must use the current bureau even if a stale form held a different value.');
console.log('Bureau workspace UI tests passed: six isolated session scopes, legacy preservation, account-management entry, fixed user bureau, independent PDF controls, and no fictional PDF requests.');
