import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
let hookOverrides = [];
let hookIndex = 0;
let downloads = 0;
let exportedWorkbook;
let allowDiscard = true;
const confirmations = [];
const hookWrites = [];
const hooks = {
  useState(initial) { const index = hookIndex++; return [index in hookOverrides ? hookOverrides[index] : typeof initial === 'function' ? initial() : initial, value => hookWrites.push({ index, value })]; },
  useEffect() {}, useCallback: value => value, useMemo: callback => callback(), useRef: value => ({ current: value }),
};
function PdfStub(props) {
  return require('react/jsx-runtime').jsx('button', { disabled: props.disabled, onClick: () => { if (!props.disabled) downloads++; }, children: props.label });
}
function TargetStub(props) { return PdfStub({ ...props, kind: 'publication', numberType: 'application', quickDownload: true, label: props.context === 'list' ? '공개공보 PDF 받기' : '대상 출원 공개공보 PDF' }); }
function NoticeMarkdownStub(props) { return require('react/jsx-runtime').jsx('div', { children: props.markdown }); }
function NoticeManagerStub() { return null; }
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
    if (id.endsWith('/target-publication-download')) return TargetStub;
    if (id.endsWith('/accessible-dialog')) return loadModule('app/components/accessible-dialog.tsx');
    if (id === './admin-workspace') return loadModule('app/evaluation/admin-workspace.tsx');
    if (id === './notice-manager') return NoticeManagerStub;
    if (id.endsWith('/bureau-notice')) return loadModule('app/components/bureau-notice.tsx');
    if (id === '@/app/components/literature-link') return loadModule('app/components/literature-link.tsx');
    if (id === '@/app/lib/literature-link') return loadModule('app/lib/literature-link.ts');
    if (id.endsWith('/evaluation-guidance')) return loadModule('app/lib/evaluation-guidance.ts');
    if (id === './notice-markdown') return NoticeMarkdownStub;
    if (id.endsWith('/evaluation')) return loadModule('app/lib/evaluation.ts');
    if (id.endsWith('/admin-guidance')) return loadModule('app/lib/admin-guidance.ts');
    if (id.endsWith('/export-workbook')) return { exportWorkbook: async (filename, sheets) => { exportedWorkbook = { filename, sheets }; return 'saved'; } };
    if (id.endsWith('/workspace-location')) return loadModule('app/lib/workspace-location.ts');
    if (id.endsWith('/bureaus')) return loadModule('app/lib/bureaus.ts');
    if (id.startsWith('@/app/') || id.endsWith('.css')) return {};
    return require(id);
  };
  vm.runInNewContext(outputText, { module, exports: module.exports, require: localRequire, URL, URLSearchParams, console, structuredClone, crypto: webcrypto, window: { confirm(message) { confirmations.push(message); return allowDiscard; } } }, { filename });
  return module.exports;
}
const ui = loadModule('app/evaluation/workspace.tsx', '\nexport { CaseResource as TestCaseResource, EvaluationEditor as TestEvaluationEditor, AIResultEditor as TestAIResultEditor };');
const adminUI = loadModule('app/evaluation/admin-workspace.tsx', '\nexport { AccountManager as TestAccountManager, MethodManager as TestMethodManager, GroupManager as TestGroupManager };');
const domain = loadModule('app/lib/evaluation.ts');
const { BUREAUS } = loadModule('app/lib/bureaus.ts');
const BureauNotice = loadModule('app/components/bureau-notice.tsx').default;

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
hookOverrides[0] = { users: [{ id: 'prior-user', name: '이전국비공개이름', roles: ['examiner', 'ai'], active: true }], months: [], cases: [], groups: [], methods: [], results: [], evaluations: [], rankings: [], notice: { markdown: '이전국공지내용', updatedAt: '2026-10-27T10:00:00.000Z' } };
hookOverrides[1] = oldScopeKey;
hookOverrides[3] = 'prior-user';
hookOverrides[4] = 'prior-user';
hookOverrides[8] = false;
hookOverrides[11] = '이전국저장오류';
hookOverrides[12] = '이전국저장안내';
hookOverrides[14] = oldScopeKey;
const beforeScopeEffects = JSON.stringify(ui.default({ bureau: '전기국' }));
assert(!beforeScopeEffects.includes('이전국비공개이름'), 'The first render after a bureau prop change must not disclose the previous user.');
assert(!beforeScopeEffects.includes('이전국저장오류'));
assert(!beforeScopeEffects.includes('이전국저장안내'));
assert(!beforeScopeEffects.includes('이전국공지내용'));
assert(beforeScopeEffects.includes('업무 자료를 불러오고 있습니다.'));

assert.equal(BureauNotice({ bureau: '기획국' }), null);
assert.equal(BureauNotice({ bureau: '기획국', notice: { markdown: '  \n ', updatedAt: '' } }), null);
const publicNotice = { markdown: '## 이번 달 안내\n\n**선정 기한을 확인하세요.**', updatedAt: '2026-10-27T10:00:00.000Z' };
const noticeTree = BureauNotice({ bureau: '기획국', notice: publicNotice });
const noticeNodes = descendants(noticeTree);
assert.equal(noticeTree.type, 'section');
assert.equal(noticeTree.props['aria-labelledby'], 'bureau-notice-title');
assert.equal(noticeNodes.find(({ element }) => element.type === NoticeMarkdownStub).element.props.markdown, publicNotice.markdown);
const noticeTime = noticeNodes.find(({ element }) => element.type === 'time').element;
assert.equal(noticeTime.props.dateTime, publicNotice.updatedAt);
assert(JSON.stringify(noticeTime).includes('19:00'), 'Notice dates must use Asia/Seoul time.');

function renderWorkspaceWithNotice(bureau, { admin = false, selected = false, closed = false, error = '', conflict = false } = {}) {
  const state = domain.createInitialState('2026-10');
  state.notice = publicNotice;
  state.users = [{ id: 'notice-reader', name: '공지 확인자', bureau, division: '시험과', roles: ['examiner'], active: true }];
  state.months[0].closed = closed;
  const scope = ui.workspaceSessionKey(`simsadesk-workspace-${admin ? 'admin' : 'user'}`, bureau);
  hookIndex = 0; hookOverrides = [];
  hookOverrides[0] = state; hookOverrides[1] = scope; hookOverrides[3] = selected ? 'notice-reader' : '';
  hookOverrides[5] = '2026-10'; hookOverrides[7] = 'notices'; hookOverrides[8] = false; hookOverrides[14] = scope;
  hookOverrides[11] = error; hookOverrides[15] = conflict;
  return ui.default({ bureau, admin });
}
for (const bureau of BUREAUS) {
  for (const selected of [false, true]) {
    const mainTree = renderWorkspaceWithNotice(bureau, { selected });
    const mainNotice = descendants(mainTree).filter(({ element }) => element.type?.name === 'BureauNotice');
    assert.equal(mainNotice.length, 1, 'Show one notice before and after user selection.');
    assert.equal(mainNotice[0].element.props.bureau, bureau);
    assert.equal(mainNotice[0].element.props.notice, publicNotice);
  }
}
const noticeAdminTree = renderWorkspaceWithNotice('기획국', { admin: true, closed: true });
const failedSaveTree = renderWorkspaceWithNotice('기획국', { admin: true, error: '저장 충돌', conflict: true });
const recoveryButtons = descendants(failedSaveTree).filter(({ element }) => element.type === 'button' && ['현재 입력 보관 파일 저장', '입력 버리고 최신 자료 불러오기'].includes(element.props.children));
assert.equal(recoveryButtons.length, 2);
assert(recoveryButtons.every(({ element }) => element.props.type === 'button'), 'Recovery actions rendered inside an account form must not submit it.');
assert(!descendants(noticeAdminTree).some(({ element }) => element.props['aria-label'] === '운영월'), 'Notices are independent of the selected month.');
assert(!JSON.stringify(noticeAdminTree).includes('이 운영월은 마감되었습니다.'), 'A closed month must not prevent editing a notice.');
hookIndex = 0; hookOverrides = [];
const noticeAdmin = adminUI.default({ state: domain.createInitialState('2026-10'), month: domain.emptyMonth('2026-10'), bureau: '기획국', section: 'notices', busy: false });
assert(descendants(noticeAdmin).some(({ element }) => element.type === NoticeManagerStub));
assert(!JSON.stringify(noticeAdmin).includes('가상 자료로 업무 흐름 확인'), 'Demo loading should not interrupt notice editing.');
hookIndex = 0; hookOverrides = [];
const item = { id: 'case-2', applicationNumber: '10-2020-0093844', examinerName: '담당 심사관', groupName: '1그룹' };
let selections = 0;
const card = ui.AITaskCard({ item, methodName: '국별 추가 AI', selected: false, complete: false, demo: false, onSelect: () => selections++ });
const cardNodes = descendants(card);
const pdf = cardNodes.find(({ element }) => element.type === TargetStub);
const selection = cardNodes.find(({ element }) => element.type === 'button');
assert(pdf && selection, 'Every task row must expose selection and PDF controls.');
assert.equal(card.props.onClick, undefined, 'The row wrapper must not intercept PDF clicks.');
assert(!pdf.ancestors.some(element => element.type === 'button'), 'PDF controls must not be nested inside the selection button.');
assert.equal(pdf.element.props.applicationNumber, item.applicationNumber);
assert.equal(pdf.element.props.disabled, false);
assert.equal(pdf.element.props.context, 'list');
assert.equal(pdf.element.props.numberType, undefined);
assert.equal(pdf.element.props.kind, undefined);
TargetStub(pdf.element.props).props.onClick();
assert.equal(downloads, 1, 'An unselected real case can download its own PDF.');
assert.equal(selections, 0, 'Downloading a PDF must not change the selected task or its editor.');
selection.element.props.onClick();
assert.equal(selections, 1);
const demoCard = ui.AITaskCard({ item, methodName: 'AI', selected: false, complete: true, demo: true, onSelect: () => selections++ });
const demoPdf = descendants(demoCard).find(({ element }) => element.type === TargetStub);
assert.equal(demoPdf.element.props.disabled, true);
TargetStub(demoPdf.element.props).props.onClick();
assert.equal(downloads, 1, 'A fictional case must not request a real PDF.');
const detailResource = ui.TestCaseResource({ item, demo: false });
const detailPdfControls = descendants(detailResource).filter(({ element }) => element.type === PdfStub);
assert.equal(detailPdfControls.length, 2);
assert(detailPdfControls.every(({ element }) => element.props.quickDownload === undefined), 'Detailed PDF controls must retain the existing save-location choice.');

const aiDetail = ui.TestCaseResource({ item, demo: false, ai: true });
const aiDetailNodes = descendants(aiDetail);
assert.equal(aiDetailNodes.filter(({ element }) => element.type === TargetStub).length, 1);
assert.equal(aiDetailNodes.filter(({ element }) => element.type === PdfStub).length, 0, 'AI detail must not offer a registered-patent substitute.');
const aiTarget = aiDetailNodes.find(({ element }) => element.type === TargetStub).element;
assert.equal(aiTarget.props.applicationNumber, item.applicationNumber);
assert.equal(aiTarget.props.context, 'detail');

assert.deepEqual(Array.from(adminUI.ADMIN_NAV, entry => entry.id), ['overview', 'accounts', 'ai', 'groups', 'month', 'cases', 'notices']);
assert.equal(adminUI.readAdminSection(null, '전기국', 'settings'), 'accounts');
assert.equal(adminUI.readAdminSection(null, undefined, 'stats'), 'overview');
assert.equal(adminUI.readAdminSection(JSON.stringify({ adminSection: 'ai' }), '전기국', 'settings'), 'ai');
assert.equal(adminUI.readAdminSection(JSON.stringify({ adminSection: 'notices' }), '전기국', 'settings'), 'notices');
assert.equal(adminUI.readAdminSection(JSON.stringify({ adminSection: 'unsupported' }), '전기국', 'settings'), 'accounts');
const emptyState = domain.createInitialState('2026-10');
const managerProps = { state: { ...emptyState, methods: [] }, month: emptyState.months[0], busy: false, dirty() {}, save: async () => true, onNavigate() {}, hasUnsaved: false };
for (const Manager of [adminUI.TestAccountManager, adminUI.TestMethodManager, adminUI.TestGroupManager]) {
  hookIndex = 0; hookOverrides = [];
  const tree = Manager(managerProps);
  const placeholders = descendants(tree).filter(({ element }) => element.type?.name === 'Empty');
  assert.equal(placeholders.length, Manager === adminUI.TestGroupManager ? 2 : 1);
  assert(placeholders.every(({ element }) => element.props.actions === undefined), 'Empty list and unselected editor must not repeat the toolbar registration action.');
}
hookIndex = 0; hookOverrides = [];
const initialUserForm = adminUI.AccountEditor({ bureau: '전기국', busy: false, dirty() {}, save: async () => true, onClose() {} });
const bureauField = descendants(initialUserForm).find(({ element }) => element.type === 'input' && element.props.readOnly === true);
assert.equal(bureauField.element.props.value, '전기국');
let savedAction;
hookIndex = 0;
hookOverrides = [{ name: '새 담당자', bureau: '다른 국', division: '시험과', roles: ['examiner'], active: true }];
const userForm = adminUI.AccountEditor({ bureau: '전기국', busy: false, dirty() {}, onClose() {}, save: async action => { savedAction = action; return true; } });
const form = descendants(userForm).find(({ element }) => element.type === 'form').element;
await form.props.onSubmit({ preventDefault() {} });
assert.equal(savedAction.type, 'saveUser');
assert.equal(savedAction.user.bureau, '전기국');
const modal = initialUserForm.type(initialUserForm.props);
assert.equal(descendants(modal).find(({ element }) => element.props.role === 'dialog').element.props['aria-labelledby'], 'adm-account-dialog-title');
assert(descendants(modal).some(({ element }) => element.props.id === 'adm-account-dialog-title'));
let closedAccounts = 0;
const enteredAccount = { name: '입력 보존 담당자', bureau: '전기국', division: '시험과', roles: ['examiner', 'ai'], active: true };
function accountDialog(extra = {}, failed = false) {
  hookIndex = 0; hookOverrides = [enteredAccount, failed];
  return adminUI.AccountEditor({ bureau: '전기국', busy: false, dirty() {}, onClose() { closedAccounts++; }, save: async () => false, ...extra });
}
allowDiscard = false;
const guardedDialog = accountDialog();
guardedDialog.props.onClose();
assert.equal(closedAccounts, 0, 'Escape/backdrop dismissal must preserve an unsaved account when discard is cancelled.');
const cancelAccount = descendants(guardedDialog).find(({ element }) => element.props.children === '취소').element;
cancelAccount.props.onClick();
assert.equal(closedAccounts, 0, 'The cancel button must use the same unsaved guard.');
allowDiscard = true;
guardedDialog.props.onClose();
assert.equal(closedAccounts, 1);
accountDialog({ busy: true }).props.onClose();
assert.equal(closedAccounts, 1, 'Saving must block Escape and backdrop dismissal.');
hookWrites.length = 0;
const failedAccount = accountDialog();
await descendants(failedAccount).find(({ element }) => element.type === 'form').element.props.onSubmit({ preventDefault() {} });
assert.equal(closedAccounts, 1, 'A rejected save must keep the account modal open.');
assert.equal(hookWrites.findLast(entry => entry.index === 1).value, true);
const visibleFailure = accountDialog({}, true);
assert(descendants(visibleFailure).some(({ element }) => element.props.role === 'alert'));
assert.equal(descendants(visibleFailure).find(({ element }) => element.type === 'input' && element.props.required).element.props.value, enteredAccount.name);
const recoveryFeedback = require('react/jsx-runtime').jsx('div', { role: 'alert', children: '충돌 안내 및 입력 보관' });
assert(descendants(accountDialog({ saveFeedback: recoveryFeedback }, true)).some(({ element }) => element === recoveryFeedback), 'Server guidance and input-recovery actions must remain available inside the modal.');
await descendants(accountDialog({ save: async () => true })).find(({ element }) => element.type === 'form').element.props.onSubmit({ preventDefault() {} });
assert.equal(closedAccounts, 2, 'A successful save must close the modal.');
for (const editing of ['new', 'managed-user']) {
  const managedUser = { ...enteredAccount, id: 'managed-user' };
  hookIndex = 0; hookOverrides = ['', 'all', 'all', editing];
  const manager = adminUI.TestAccountManager({ ...managerProps, state: { ...managerProps.state, users: [managedUser] } });
  const editor = descendants(manager).find(({ element }) => element.type === adminUI.AccountEditor).element;
  assert.equal(editor.props.user, editing === 'new' ? undefined : managedUser, 'New and existing accounts must both open the modal editor.');
}
const people = [{ id: 'one', name: '김담당', division: '전기1과', roles: ['examiner','ai'], active: true }, { id: 'two', name: '이담당', division: '화학과', roles: ['examiner'], active: false }];
const methodManagerProps = { ...managerProps, state: emptyState };
hookIndex = 0; hookOverrides = [];
const catalog = adminUI.TestMethodManager(methodManagerProps);
const aiCards = descendants(catalog).filter(({ element }) => element.type === 'button' && element.props.className?.startsWith('adm-ai-card '));
assert.deepEqual(Array.from(aiCards, ({ element }) => element.props['aria-label']), ['AI 종류 ChatGPT 수정', 'AI 종류 클로드 수정']);
assert(aiCards.every(({ element }) => element.props['aria-haspopup'] === 'dialog'));
assert(!aiCards.some(({ element }) => JSON.stringify(element).includes('선행기술조사')), 'Rank-only comparison methods must be separate from the registered AI cards.');
assert(!descendants(catalog).some(({ element }) => element.type === adminUI.MethodEditor), 'The catalog must not show an inline or initially open editor.');
for (const editing of ['new', 'claude', 'baseline']) {
  hookIndex = 0; hookOverrides = ['', 'all', editing];
  const tree = adminUI.TestMethodManager(methodManagerProps);
  const editor = descendants(tree).find(({ element }) => element.type === adminUI.MethodEditor).element;
  assert.equal(editor.props.method?.id, editing === 'new' ? undefined : editing);
}
hookIndex = 0; hookOverrides = ['클로드', 'all', null];
const filteredAI = descendants(adminUI.TestMethodManager(methodManagerProps)).filter(({ element }) => element.type === 'button' && element.props.className?.startsWith('adm-ai-card '));
assert.equal(filteredAI.length, 1);
assert.equal(filteredAI[0].element.props['aria-label'], 'AI 종류 클로드 수정');
let closedMethods = 0;
let savedMethodAction;
const enteredMethod = { name: 'Gemini', kind: 'ai', active: true };
function methodDialog(extra = {}, failed = false) {
  hookIndex = 0; hookOverrides = [enteredMethod, failed];
  return adminUI.MethodEditor({ busy: false, dirty() {}, onClose() { closedMethods++; }, save: async action => { savedMethodAction = action; return true; }, ...extra });
}
const newMethod = methodDialog();
const methodShell = newMethod.type(newMethod.props);
assert.equal(descendants(methodShell).find(({ element }) => element.props.role === 'dialog').element.props['aria-labelledby'], 'adm-method-dialog-title');
await descendants(newMethod).find(({ element }) => element.type === 'form').element.props.onSubmit({ preventDefault() {} });
assert.equal(savedMethodAction.type, 'saveMethod');
assert.equal(savedMethodAction.method.kind, 'ai');
assert.equal(savedMethodAction.method.name, 'Gemini');
assert.equal(closedMethods, 1);
const withNewAI = domain.applyAction(emptyState, { admin: true }, savedMethodAction);
assert(withNewAI.methods.some(method => method.name === 'Gemini' && method.kind === 'ai'));
const claude = emptyState.methods.find(method => method.id === 'claude');
hookIndex = 0; hookOverrides = [{ ...claude, name: '클로드 공용', active: false }, false];
const editMethod = adminUI.MethodEditor({ method: claude, busy: false, dirty() {}, onClose() {}, save: async action => { savedMethodAction = action; return true; } });
await descendants(editMethod).find(({ element }) => element.type === 'form').element.props.onSubmit({ preventDefault() {} });
assert.equal(savedMethodAction.method.id, 'claude');
assert.equal(savedMethodAction.method.kind, 'ai');
assert.equal(savedMethodAction.method.active, false);
assert.equal(domain.applyAction(withNewAI, { admin: true }, savedMethodAction).methods.find(method => method.id === 'claude').name, '클로드 공용');
assert.equal(withNewAI.methods.find(method => method.id === 'baseline').kind, 'baseline');
allowDiscard = false;
methodDialog().props.onClose();
assert.equal(closedMethods, 1, 'Cancelling discard must keep the AI tool modal open.');
allowDiscard = true;
methodDialog({ busy: true }).props.onClose();
assert.equal(closedMethods, 1, 'Saving must prevent closing the AI tool modal.');
hookWrites.length = 0;
await descendants(methodDialog({ save: async () => false })).find(({ element }) => element.type === 'form').element.props.onSubmit({ preventDefault() {} });
assert.equal(closedMethods, 1);
assert.equal(hookWrites.findLast(entry => entry.index === 1).value, true);
const methodFailure = methodDialog({ saveFeedback: recoveryFeedback }, true);
assert(descendants(methodFailure).some(({ element }) => element === recoveryFeedback));
assert.equal(descendants(methodFailure).find(({ element }) => element.type === 'input').element.props.value, enteredMethod.name);
hookIndex = 0; hookOverrides = ['클로드', 'inactive', 'new'];
const searchedCatalog = adminUI.TestMethodManager(methodManagerProps);
const searchedEditor = descendants(searchedCatalog).find(({ element }) => element.type === adminUI.MethodEditor).element;
hookWrites.length = 0;
await searchedEditor.props.save({ type: 'saveMethod', method: enteredMethod });
assert(hookWrites.some(entry => entry.index === 0 && entry.value === ''));
assert(hookWrites.some(entry => entry.index === 1 && entry.value === 'all'), 'Saving an AI tool must clear filters so the new or changed tool stays visible.');
hookIndex = 0; hookOverrides = ['검색결과없음', 'all', 'all', null];
const noMatchingAccount = adminUI.TestAccountManager({ ...managerProps, state: { ...emptyState, users: people } });
const searchEmpty = descendants(noMatchingAccount).find(({ element }) => element.props?.title === '검색 조건에 맞는 계정이 없습니다.');
assert(searchEmpty.element.props.actions, 'A search with no results must retain its reset action.');
assert.equal(adminUI.filterAdminUsers(people, '전기', 'ai', 'active')[0].id, 'one');
assert.equal(adminUI.filterAdminUsers(people, '담당', 'all', 'inactive')[0].id, 'two');
assert.equal(adminUI.filterAdminUsers(people, '미등록', 'all', 'all').length, 0);
const demo = domain.createDemoState('2026-10');
const mixedReferences = ['KR1020200000000A', 'Attention Is All You Need', '10.48550/arXiv.1706.03762', 'https://arxiv.org/abs/1706.03762'];
const mixedState = domain.applyAction(demo, { userId: 'demo-user-1' }, { type: 'saveResult', caseId: demo.cases[0].id, methodId: 'chatgpt', documents: mixedReferences, publish: true });
const mixedProps = { state: mixedState, item: mixedState.cases[0], month: mixedState.months[0], methodId: 'chatgpt', busy: false, dirty() {}, save: async () => true };
hookIndex = 0; hookOverrides = [];
const evaluationTree = ui.TestEvaluationEditor(mixedProps);
const evaluationLinks = descendants(evaluationTree).filter(({ element }) => element.type?.name === 'LiteratureLink');
for (const reference of mixedReferences) {
  const linkNode = evaluationLinks.find(({ element }) => element.props.reference === reference);
  assert(linkNode, 'Every mixed document must expose a literature link in the evaluation table.');
  const anchor = linkNode.element.type(linkNode.element.props);
  assert.equal(anchor.type, 'a');
  assert.equal(anchor.props.target, '_blank');
  assert.equal(anchor.props.rel, 'noopener noreferrer');
  assert.equal(anchor.props.children[0], reference, 'Visible references must retain their original stored text.');
  const destination = new URL(anchor.props.href);
  if (reference.startsWith('KR10')) {
    assert.equal(destination.hostname, 'patents.google.com');
    assert.equal(destination.searchParams.get('q'), 'KR20200000000A');
  } else if (reference === 'Attention Is All You Need') {
    assert.equal(destination.hostname, 'scholar.google.com');
    assert.equal(destination.searchParams.get('q'), reference);
  } else if (reference.startsWith('10.')) {
    assert.equal(destination.hostname, 'doi.org');
  } else assert.equal(destination.href, reference);
}
hookIndex = 0; hookOverrides = [];
const aiResultsTree = ui.TestAIResultEditor(mixedProps);
const publishedLinks = descendants(aiResultsTree).filter(({ element }) => element.type?.name === 'LiteratureLink');
assert.deepEqual(Array.from(publishedLinks, ({ element }) => element.props.reference), mixedReferences, 'AI and examiner views must share the same links.');
const mixedPdfLink = descendants(aiResultsTree).find(({ element }) => element.type === 'a' && element.props.href?.startsWith('/documents?numbers='));
assert.equal(new URL(mixedPdfLink.element.props.href, 'https://local.test').searchParams.get('numbers'), mixedReferences[0], 'Paper titles, DOI and URLs must not be sent to the patent PDF downloader.');
const paperOnly = domain.applyAction(mixedState, { userId: 'demo-user-1' }, { type: 'saveResult', caseId: demo.cases[0].id, methodId: 'chatgpt', documents: mixedReferences.slice(1), publish: true });
hookIndex = 0; hookOverrides = [];
const paperOnlyTree = ui.TestAIResultEditor({ ...mixedProps, state: paperOnly });
assert(!descendants(paperOnlyTree).some(({ element }) => element.type === 'a' && element.props.href?.startsWith('/documents?numbers=')), 'Paper-only results must not offer patent PDF collection.');
assert.equal(adminUI.filterTargetCases(demo, '2026-10', { status: 'complete' }).length, 20);
assert.equal(adminUI.filterTargetCases(demo, '2026-11').length, 0);
assert.equal(adminUI.filterTargetCases(demo, '2026-10', { query: demo.cases[0].applicationNumber.replace(/\D/g, '') }).length, 1);
assert.equal(adminUI.filterTargetCases(demo, '2026-10', { examinerId: demo.users[0].id }).length, 2);
const changed = structuredClone(demo.months[0]); changed.caseLimit = 3; changed.assignments = [];
hookIndex = 0; hookOverrides = [changed, ''];
let monthAction;
const monthForm = adminUI.MonthlyForm({ state: demo, month: demo.months[0], busy: false, dirty() {}, onNavigate() {}, save: async action => { monthAction = action; return true; } });
const monthSave = descendants(monthForm).find(({ element }) => element.props.children === '월별 운영·배정 저장').element;
assert.equal(monthSave.props.disabled, false, 'Missing assignments are guidance; draft month settings remain saveable.');
monthSave.props.onClick();
assert.equal(monthAction.type, 'saveMonth');
assert.equal(monthAction.month.assignments.length, 0);
const closedMonth = { ...demo.months[0], closed: true };
hookIndex = 0; hookOverrides = [];
const closedForm = adminUI.MonthlyForm({ state: demo, month: closedMonth, busy: false, dirty() {}, onNavigate() {}, save: async () => true });
const modifyingInputs = descendants(closedForm).filter(({ element }) => element.type === 'input' && ['checkbox','date','number'].includes(element.props.type));
assert(modifyingInputs.length > 4);
assert(modifyingInputs.every(({ element }) => element.props.disabled === true));
const closedSave = descendants(closedForm).find(({ element }) => element.props.children === '월별 운영·배정 저장').element;
assert.equal(closedSave.props.disabled, true);
const monthParagraphs = descendants(closedForm).filter(({ element }) => element.type === 'p').map(({ element }) => element.props.children);
assert(monthParagraphs.includes('기한을 비워두면 제한이 없습니다. 날짜를 정하면 그날이 끝날 때까지 입력할 수 있습니다.'));
assert(monthParagraphs.includes('출원 건수 상한 0은 제한 없음입니다.'));
await adminUI.exportAdminStatistics(demo, '2026-10', 'group-a', '', '전기국');
assert(exportedWorkbook.filename.includes('전기국'));
assert.deepEqual(Array.from(exportedWorkbook.sheets, sheet => sheet.name), ['그룹별 통계','계정별 현황','출원별 현황','조사 방식별 통계','AI 검색 결과 평가','조회 기준']);
assert.equal(exportedWorkbook.sheets.find(sheet => sheet.name === 'AI 검색 결과 평가').rows.length, 141);
assert.equal(exportedWorkbook.sheets.find(sheet => sheet.name === '출원별 현황').rows.length, 11);
console.log('Admin and bureau workspace UI tests passed: seven task menus, scoped sessions and forms, search/filter combinations, target publication handoff, independent downloads, draft-save guidance, closed-month controls, and six-sheet filtered exports.');
