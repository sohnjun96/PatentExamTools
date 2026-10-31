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
const hookEffects = [];
const hooks = {
  useState(initial) { const index = hookIndex++; return [index in hookOverrides ? hookOverrides[index] : typeof initial === 'function' ? initial() : initial, value => hookWrites.push({ index, value })]; },
  useEffect(effect) { hookEffects.push(effect); }, useCallback: value => value, useMemo: callback => callback(), useRef: value => ({ current: value }), useId: () => 'test-editor',
};
function PdfStub(props) {
  return require('react/jsx-runtime').jsx('button', { disabled: props.disabled, onClick: () => { if (!props.disabled) downloads++; }, children: props.label });
}
function TargetStub(props) { return PdfStub({ ...props, kind: 'publication', numberType: 'application', quickDownload: true, label: props.context === 'list' ? '공개공보 PDF 받기' : '대상 출원 공개공보 PDF' }); }
function TargetArchiveStub() { return null; }
function NoticeMarkdownStub(props) { return require('react/jsx-runtime').jsx('div', { children: props.markdown }); }
function NoticeManagerStub() { return null; }
function SearchPromptManagerStub() { return null; }
function StandardPromptButtonStub() { return null; }
function loadModule(relative, append = '') {
  const filename = path.join(root, relative);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8') + append, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const moduleRecord = { exports: {} };
  const localRequire = (id) => {
    if (id === 'react') return hooks;
    if (id === 'react/jsx-runtime') return require(id);
    if (id.endsWith('/task-window')) return loadModule('app/lib/task-window.ts');
    if (id === './literature-reader') return loadModule('app/evaluation/task/literature-reader.tsx');
    if (id.endsWith('/app-icon')) return loadModule('app/components/app-icon.tsx');
    if (id.endsWith('/pdf-download')) return PdfStub;
    if (id.endsWith('/target-publication-download')) return TargetStub;
    if (id.endsWith('/target-publication-archive')) return TargetArchiveStub;
    if (id.endsWith('/accessible-dialog')) return loadModule('app/components/accessible-dialog.tsx');
    if (id === './examiner-manager') return loadModule('app/evaluation/examiner-manager.tsx');
    if (id === './admin-workspace') return loadModule('app/evaluation/admin-workspace.tsx');
    if (id === './notice-manager') return NoticeManagerStub;
    if (id === './search-prompt-manager') return SearchPromptManagerStub;
    if (id.endsWith('/standard-search-prompt-button')) return StandardPromptButtonStub;
    if (id.endsWith('/standard-search-prompt')) return loadModule('app/lib/standard-search-prompt.ts');
    if (id === './literature-editor') return loadModule('app/evaluation/literature-editor.tsx');
    if (id.endsWith('/bureau-notice')) return loadModule('app/components/bureau-notice.tsx');
    if (id === '@/app/components/operation-schedule') return loadModule('app/components/operation-schedule.tsx');
    if (id === '@/app/lib/operation-schedule') return loadModule('app/lib/operation-schedule.ts');
    if (id === '@/app/components/literature-link') return loadModule('app/components/literature-link.tsx');
    if (id === '@/app/components/literature-details') return loadModule('app/components/literature-details.tsx');
    if (id === '@/app/components/report-presence-toggle') return loadModule('app/components/report-presence-toggle.tsx');
    if (id === '@/app/lib/literature-link') return loadModule('app/lib/literature-link.ts');
    if (id.endsWith('/evaluation-guidance')) return loadModule('app/lib/evaluation-guidance.ts');
    if (id.endsWith('/notice-markdown')) return NoticeMarkdownStub;
    if (id.endsWith('/evaluation')) return loadModule('app/lib/evaluation.ts');
    if (id.endsWith('/admin-guidance')) return loadModule('app/lib/admin-guidance.ts');
    if (id.endsWith('/export-workbook')) return { exportWorkbook: async (filename, sheets) => { exportedWorkbook = { filename, sheets }; return 'saved'; } };
    if (id.endsWith('/workspace-location')) return loadModule('app/lib/workspace-location.ts');
    if (id.endsWith('/bureaus')) return loadModule('app/lib/bureaus.ts');
    if (id.startsWith('@/app/') || id.endsWith('.css')) return {};
    return require(id);
  };
  vm.runInNewContext(outputText, { module: moduleRecord, exports: moduleRecord.exports, require: localRequire, URL, URLSearchParams, console, structuredClone, crypto: webcrypto, window: { confirm(message) { confirmations.push(message); return allowDiscard; } } }, { filename });
  return moduleRecord.exports;
}
const ui = loadModule('app/evaluation/workspace.tsx', '\nexport { AIWorkspace as TestAIWorkspace, SelectionEditor as TestSelectionEditor, StageNotice as TestStageNotice, ReviewWorkspace as TestReviewWorkspace, exportPersonal as TestExportPersonal };');
ui.TestEvaluationEditor = loadModule('app/evaluation/task/evaluation-reader.tsx').default;
const adminUI = loadModule('app/evaluation/admin-workspace.tsx', '\nexport { AccountManager as TestAccountManager, MethodManager as TestMethodManager, CaseManager as TestCaseManager, CaseRegistration as TestCaseRegistration, Overview as TestOverview };');
const domain = loadModule('app/lib/evaluation.ts');
const { BUREAUS } = loadModule('app/lib/bureaus.ts');
const BureauNotice = loadModule('app/components/bureau-notice.tsx').default;
const OperationSchedule = loadModule('app/components/operation-schedule.tsx').default;

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
hookOverrides[7] = false;
hookOverrides[10] = '이전국저장오류';
hookOverrides[11] = '이전국저장안내';
hookOverrides[13] = oldScopeKey;
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

function renderWorkspaceWithNotice(bureau, { admin = false, selected = false, closed = false, error = '', conflict = false, users, groups = [], memberships = [], view = 'review', stages } = {}) {
  const state = domain.createInitialState('2026-10');
  state.notice = publicNotice;
  state.users = users ?? [{ id: 'notice-reader', name: '공지 확인자', bureau, division: '시험과', roles: ['examiner'], active: true, groupId: '', responsibilities: [] }];
  state.groups = groups;
  state.personnel.memberships = memberships;
  state.months[0].closed = closed;
  if (stages) state.months[0].stages = stages;
  const scope = ui.workspaceSessionKey(`simsadesk-workspace-${admin ? 'admin' : 'user'}`, bureau);
  hookIndex = 0; hookOverrides = [];
  hookOverrides[0] = state; hookOverrides[1] = scope; hookOverrides[3] = selected ? 'notice-reader' : '';
  hookOverrides[4] = '2026-10'; hookOverrides[5] = view; hookOverrides[6] = 'notices'; hookOverrides[7] = false; hookOverrides[13] = scope;
  hookOverrides[10] = error; hookOverrides[14] = conflict;
  return ui.default({ bureau, admin });
}
for (const bureau of BUREAUS) {
  for (const selected of [false, true]) {
    const mainTree = renderWorkspaceWithNotice(bureau, { selected });
    const mainNotice = descendants(mainTree).filter(({ element }) => element.type?.name === 'BureauNotice');
    assert.equal(mainNotice.length, selected ? 0 : 1, 'Show bureau notices only on the initial user selection page.');
    if (!selected) {
      assert.equal(mainNotice[0].element.props.bureau, bureau);
      assert.equal(mainNotice[0].element.props.notice, publicNotice);
    }
    const mainNodes = descendants(mainTree);
    assert(!mainNodes.some(({ element }) => element.type === 'a' && /\/(?:rhksfl|admin)(?:[?#]|$)/.test(element.props.href || '')), 'General users must access administration by address only.');
    if (!selected) {
      assert(!mainNodes.some(({ element }) => element.type === 'select' || element.type === 'aside' || element.props.className === 'ev-topbar'), 'The initial page must contain the notice and selection list without workspace navigation or dropdowns.');
      const directory = mainNodes.find(({ element }) => element.type === 'ul').element;
      const choices = descendants(directory).filter(({ element }) => element.type === 'button');
      assert.equal(choices.length, 1);
      assert.equal(choices[0].element.props.type, 'button');
      assert.equal(choices[0].element.props.disabled, false);
      assert.equal(choices[0].element.props.children[0].props.children.join(''), '시험과 - 공지 확인자');
      hookWrites.length = 0;
      choices[0].element.props.onClick();
      assert(hookWrites.some(write => write.index === 3 && write.value === 'notice-reader'), 'One list click must select the examiner without a second start action.');
      assert(hookWrites.some(write => write.index === 5 && write.value === 'review'));
    }
  }
  const aiWorkspaceWithNotice = renderWorkspaceWithNotice(bureau, { selected: true, view: 'ai', users: [{ id: 'notice-reader', name: 'AI 담당자', bureau, division: '시험과', roles: ['ai'], active: true }] });
  assert(!descendants(aiWorkspaceWithNotice).some(({ element }) => element.type?.name === 'BureauNotice'), 'AI-only accounts must not see the bureau notice inside their workspace.');
}
for (const [stages, label] of [
  [{ selection: 'pending', result: 'pending', evaluation: 'pending' }, '운영 전'],
  [{ selection: 'closed', result: 'running', evaluation: 'pending' }, '운영 중'],
  [{ selection: 'closed', result: 'closed', evaluation: 'closed' }, '운영 종료'],
]) {
  const monthStateTree = renderWorkspaceWithNotice('기획국', { selected: true, stages });
  const options = descendants(monthStateTree).filter(({ element }) => element.type === 'option' && element.props.value === '2026-10');
  assert.equal(options[0].element.props.children.at(-1), label);
  assert(descendants(monthStateTree).some(({ element }) => element.type?.name === 'Badge' && element.props.children === label), 'The selected-month badge must agree with its dropdown option.');
}
const directoryUsers = [
  { id: 'ai-reader', division: '가과', name: '나영', roles: ['ai'], active: true },
  { id: 'unassigned-reader', division: '', name: '소속 없음', roles: ['examiner'], active: true },
  { id: 'inactive-reader', division: '가과', name: '비활성', roles: ['examiner'], active: false },
  { id: 'first-reader', division: '가과', name: '가람', roles: ['examiner'], active: true },
];
const directoryPage = renderWorkspaceWithNotice('기획국', { users: directoryUsers });
const directoryChoices = descendants(directoryPage).filter(({ element }) => element.type === 'button');
assert.deepEqual(directoryChoices.map(({ element }) => element.props.children[0].props.children.join('')), ['가과 - 가람', '가과 - 나영', '소속 미지정 - 소속 없음'], 'Show active users sorted by division and name, including AI-only accounts and the missing-division fallback.');
hookWrites.length = 0;
directoryChoices[1].element.props.onClick();
assert(hookWrites.some(write => write.index === 3 && write.value === 'ai-reader'));
assert(hookWrites.some(write => write.index === 5 && write.value === 'ai'), 'AI-only users must still enter their assigned AI workspace.');
const groupedUsers = [
  ...directoryUsers,
  { id: 'deleted-group-reader', division: '나과', name: '이전 그룹원', roles: ['examiner'], active: true },
  { id: 'missing-group-reader', division: '다과', name: '그룹 확인 필요', roles: ['examiner'], active: true },
];
for (const bureau of BUREAUS) {
  const groupedPage = renderWorkspaceWithNotice(bureau, {
    users: groupedUsers,
    groups: [{ id: 'ten', name: '10그룹' }, { id: 'deleted', name: '삭제 그룹', deletedAt: '2026-10-28' }, { id: 'empty', name: '빈 그룹' }, { id: 'two', name: '2그룹' }],
    memberships: [{ userId: 'first-reader', groupId: 'ten' }, { userId: 'ai-reader', groupId: 'two' }, { userId: 'inactive-reader', groupId: 'ten' }, { userId: 'deleted-group-reader', groupId: 'deleted' }, { userId: 'missing-group-reader', groupId: 'missing' }],
  });
  const sections = descendants(groupedPage).filter(({ element }) => element.props.className === 'ev-examiner-group');
  assert.deepEqual(sections.map(({ element }) => descendants(element).find(({ element }) => element.type === 'h3').element.props.children), ['2그룹', '10그룹', '그룹 미배정']);
  assert.deepEqual(sections.map(({ element }) => descendants(element).filter(({ element }) => element.type === 'button').map(({ element }) => element.props.children[0].props.children.join(''))), [
    ['가과 - 나영'], ['가과 - 가람'], ['나과 - 이전 그룹원', '다과 - 그룹 확인 필요', '소속 미지정 - 소속 없음'],
  ], 'Use actual group membership, exclude empty/deleted groups and inactive users, and keep all unassigned users selectable.');
  assert.equal(descendants(groupedPage).filter(({ element }) => element.props.className === 'ev-examiner-role').length, 1, 'AI badges must remain visible in grouped lists.');
  const groupAI = descendants(sections[0].element).find(({ element }) => element.type === 'button').element;
  hookWrites.length = 0;
  groupAI.props.onClick();
  assert(hookWrites.some(write => write.index === 3 && write.value === 'ai-reader'));
  assert(hookWrites.some(write => write.index === 5 && write.value === 'ai'));
}
for (const users of [[], directoryUsers.filter(user => !user.active)]) {
  const emptyDirectory = renderWorkspaceWithNotice('기획국', { users });
  assert(descendants(emptyDirectory).some(({ element }) => element.type?.name === 'Empty' && element.props.title === '선택할 수 있는 심사관이 없습니다.'));
  assert(!descendants(emptyDirectory).some(({ element }) => element.type === 'a' && /\/(?:rhksfl|admin)(?:[?#]|$)/.test(element.props.href || '')), 'An empty directory must not reveal an administration link.');
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
assert(!JSON.stringify(noticeAdmin).includes('가상 자료로 업무 흐름 확인'), 'The retired demo loader must not be rendered.');
for (const section of adminUI.ADMIN_NAV.map(entry => entry.id)) {
  for (const groups of [[], domain.createInitialState().groups]) {
    const state = { ...domain.createInitialState('2026-10'), groups };
    hookIndex = 0; hookOverrides = [];
    const page = adminUI.default({ state, month: state.months[0], bureau: '기획국', section, busy: false });
    assert(!JSON.stringify(page).includes('가상 자료로 업무 흐름 확인'));
    assert(!descendants(page).some(({ element }) => element.props.className?.includes('adm-demo')), 'No administrator section may expose virtual-data loading, with or without default groups.');
  }
}
const promptAdmin = adminUI.default({ state: domain.createInitialState(), bureau: '기획국', section: 'prompts', busy: false });
assert(descendants(promptAdmin).some(({ element }) => element.type === SearchPromptManagerStub));
assert(!JSON.stringify(promptAdmin).includes('운영월을 등록하세요.'), 'Prompt management works without selecting an operating month.');
const scheduleState = domain.createInitialState('2026-10');
scheduleState.users = [{ id: 'schedule-reader', name: '일정 확인자', bureau: '기획국', division: '시험과', roles: ['examiner', 'ai'], active: true }];
Object.assign(scheduleState.months[0], { selectionDeadline: '2026-10-24', resultDeadline: '2026-10-27', evaluationDeadline: '2026-10-30' });
scheduleState.months.push({ ...domain.emptyMonth('2026-11'), selectionDeadline: '2026-11-05', resultDeadline: '2026-11-15', evaluationDeadline: '2026-11-25' });
function schedulePage(monthId, { admin = false, view = 'review', selected = true, roles = ['examiner', 'ai'] } = {}) {
  const scope = ui.workspaceSessionKey(`simsadesk-workspace-${admin ? 'admin' : 'user'}`, '기획국');
  hookIndex = 0; hookOverrides = [];
  hookOverrides[0] = { ...scheduleState, users: [{ ...scheduleState.users[0], roles }] }; hookOverrides[1] = scope; hookOverrides[3] = selected ? 'schedule-reader' : '';
  hookOverrides[4] = monthId; hookOverrides[5] = view; hookOverrides[7] = false; hookOverrides[13] = scope;
  return ui.default({ bureau: '기획국', admin });
}
for (const monthId of ['2026-10', '2026-11']) {
  for (const mode of [{}, { view: 'ai' }, { view: 'ai', roles: ['ai'] }]) {
    const scheduleNode = descendants(schedulePage(monthId, mode)).filter(({ element }) => element.type?.name === 'OperationSchedule');
    assert.equal(scheduleNode.length, 1);
    assert.equal(scheduleNode[0].element.props.month, scheduleState.months.find(month => month.id === monthId), 'Examiner and AI task schedules must follow the selected month, including deadlines in another month.');
  }
}
for (const mode of [{ admin: true }, { selected: false }, { view: 'ai', selected: false }]) {
  assert(!descendants(schedulePage('2026-10', mode)).some(({ element }) => element.type?.name === 'OperationSchedule'), 'Show the schedule only on signed-in examiner or AI task workspaces.');
}
hookIndex = 0; hookOverrides = [new Date('2026-10-27T05:00:00Z')];
const scheduleTree = OperationSchedule({ month: scheduleState.months[0] });
const scheduleNodes = descendants(scheduleTree);
assert.deepEqual(Array.from(scheduleNodes.filter(({ element }) => element.type === 'h3'), ({ element }) => element.props.children), ['대상 건 선정', 'AI 검색 결과 입력', '평가']);
assert.deepEqual(Array.from(scheduleNodes.filter(({ element }) => element.type === 'time'), ({ element }) => element.props.dateTime), ['2026-10-24', '2026-10-27', '2026-10-30']);
assert.deepEqual(Array.from(scheduleNodes.filter(({ element }) => element.type === 'span' && element.props['aria-label']), ({ element }) => element.props.children), ['D+3', 'D-day', 'D-3']);
hookIndex = 0; hookOverrides = [new Date('2026-10-27T05:00:00Z')];
const noSchedule = OperationSchedule({ month: { ...domain.emptyMonth('2026-10'), selectionDeadline: '', resultDeadline: '', evaluationDeadline: '' } });
assert.equal(descendants(noSchedule).filter(({ element }) => element.props.children === '기한 미설정').length, 3);
hookIndex = 0; hookOverrides = [];
const item = { id: 'case-2', applicationNumber: '10-2020-0093844', examinerName: '담당 심사관', groupName: '1그룹' };
let selections = 0;
const card = ui.AITaskCard({ item, methodName: '국별 추가 AI', selected: false, complete: false, demo: false, href: '/evaluation/task?kind=result' });
const cardNodes = descendants(card);
const pdf = cardNodes.find(({ element }) => element.type === TargetStub);
const selection = cardNodes.find(({ element }) => element.type === 'a');
assert(pdf && selection, 'Every task row must expose selection and PDF controls.');
assert.equal(card.props.onClick, undefined, 'The row wrapper must not intercept PDF clicks.');
assert(!pdf.ancestors.some(element => element.type === 'button'), 'PDF controls must not be nested inside the selection button.');
assert.equal(pdf.element.props.applicationNumber, item.applicationNumber);
assert.equal(pdf.element.props.disabled, false);
assert.equal(pdf.element.props.context, 'list');
assert.equal(pdf.element.props.showContext, false, 'The task heading already identifies the application; its PDF action must not repeat it.');
assert.equal(pdf.element.props.numberType, undefined);
assert.equal(pdf.element.props.kind, undefined);
TargetStub(pdf.element.props).props.onClick();
assert.equal(downloads, 1, 'An unselected real case can download its own PDF.');
assert.equal(selections, 0, 'Downloading a PDF must not change the selected task or its editor.');
assert.equal(selection.element.props.target, '_blank');
assert.equal(selection.element.props.href, '/evaluation/task?kind=result');
const fakeItem = { ...item, applicationNumber: '10-2024-9000000' };
const demoCard = ui.AITaskCard({ item: fakeItem, methodName: 'AI', selected: false, complete: true, demo: true, href: '/evaluation/task?kind=result' });
const demoPdf = descendants(demoCard).find(({ element }) => element.type === TargetStub);
assert.equal(demoPdf.element.props.disabled, true);
TargetStub(demoPdf.element.props).props.onClick();
assert.equal(downloads, 1, 'A fictional case must not request a real PDF.');
const realSampleCard = ui.AITaskCard({ item, methodName: 'AI', selected: false, complete: false, demo: true, href: '/evaluation/task?kind=result' });
const realSampleNodes = descendants(realSampleCard);
const realSamplePdf = realSampleNodes.find(({ element }) => element.type === TargetStub).element;
assert.equal(realSamplePdf.props.disabled, false, 'A real application in a sample workspace must allow PDF downloads.');
assert(!JSON.stringify(realSampleCard).includes('가상 출원번호는 PDF'), 'Real samples must not display the fictional-number warning.');
TargetStub(realSamplePdf.props).props.onClick();
assert.equal(downloads, 2);
assert.equal(selections, 0, 'A sample PDF download must not change task selection.');
// Bulk targets come from all assigned work, even when the visible list only shows pending work.
const archiveState = domain.createDemoState('2026-10'); archiveState.isDemo = false;
const archiveUser = archiveState.users.find(user => user.id === 'demo-user-1');
const ownAssignments = archiveState.personnel.assignments.filter(entry => entry.userId === archiveUser.id && archiveState.months[0].methodIds.includes(entry.methodId));
const expectedTargets = archiveState.cases.filter(entry => entry.status === 'confirmed' && entry.monthId === '2026-10').flatMap(entry => ownAssignments.filter(assignment => assignment.groupId === entry.groupId).map(() => entry.applicationNumber));
for (const filter of ['', 'pending']) {
  hookIndex = 0; hookOverrides = [{key:ui.workspaceSessionKey(`simsadesk-ai-filter:${archiveUser.id}:2026-10`, '기획국'),value:filter}];
  const tree = ui.TestAIWorkspace({ state: archiveState, month: archiveState.months[0], user: archiveUser, bureau: '기획국', busy: false, dirty() {}, save: async () => true, notify() {} });
  const archive = descendants(tree).find(({ element }) => element.type === TargetArchiveStub).element;
  assert.equal(JSON.stringify(archive.props.applicationNumbers), JSON.stringify(expectedTargets));
  assert.equal(archive.props.monthId, '2026-10'); assert.equal(archive.props.bureau, '기획국'); assert.equal(archive.props.disabled, false);
}
for (const options of [{ state: archiveState, busy: true }]) {
  hookIndex = 0; hookOverrides = [];
  const tree = ui.TestAIWorkspace({ ...options, month: archiveState.months[0], user: archiveUser, dirty() {}, save: async () => true, notify() {} });
  assert.equal(descendants(tree).find(({ element }) => element.type === TargetArchiveStub).element.props.disabled, true);
}
const mixedSamples = structuredClone(archiveState);
mixedSamples.isDemo = true;
mixedSamples.cases[0].applicationNumber = item.applicationNumber;
for (const [state, expected] of [[mixedSamples, [item.applicationNumber]], [{ ...archiveState, isDemo: true }, []]]) {
  hookIndex = 0; hookOverrides = [];
  const tree = ui.TestAIWorkspace({ state, month: state.months[0], user: archiveUser, busy: false, dirty() {}, save: async () => true, notify() {} });
  const archive = descendants(tree).find(({ element }) => element.type === TargetArchiveStub).element;
  assert.equal(JSON.stringify(archive.props.applicationNumbers), JSON.stringify(expected), 'Sample ZIP targets must contain only real application numbers.');
  assert.equal(archive.props.disabled, false, 'The ZIP component handles empty target lists itself.');
}
for (const number of ['10-2024-9000000', '1020249000019', '10 2024 9000010']) assert.equal(domain.isDemoApplicationNumber(number), true);
for (const number of [item.applicationNumber, '10-2024-9000020', '10-2023-9000000']) assert.equal(domain.isDemoApplicationNumber(number), false);

// Task cards carry explicit identity into a standalone window.
hookIndex=0;hookOverrides=[];
const taskList=ui.TestAIWorkspace({state:archiveState,month:archiveState.months[0],user:archiveUser,bureau:'기획국',busy:false,dirty(){},save:async()=>true,notify(){}});
for(const {element} of descendants(taskList).filter(({element})=>element.type===ui.AITaskCard)){const url=new URL(element.props.href,'http://localhost');assert.equal(url.pathname,'/evaluation/task');assert.equal(url.searchParams.get('userId'),archiveUser.id);assert.equal(url.searchParams.get('caseId'),element.props.item.id);assert.equal(url.searchParams.get('bureau'),'기획국');}

assert.deepEqual(Array.from(adminUI.ADMIN_NAV, entry => entry.id), ['overview', 'examiners', 'ai', 'month', 'cases', 'notices', 'prompts']);
assert.equal(adminUI.ADMIN_NAV.at(-1).label, '표준 검색 프롬프트 관리');
assert.equal(adminUI.readAdminSection(JSON.stringify({ adminSection: 'prompts' }), '전기국', 'settings'), 'prompts');
assert.equal(adminUI.readAdminSection(null, '전기국', 'settings'), 'examiners');
assert.equal(adminUI.readAdminSection(null, undefined, 'stats'), 'overview');
assert.equal(adminUI.readAdminSection(JSON.stringify({ adminSection: 'ai' }), '전기국', 'settings'), 'ai');
assert.equal(adminUI.readAdminSection(JSON.stringify({ adminSection: 'notices' }), '전기국', 'settings'), 'notices');
assert.equal(adminUI.readAdminSection(JSON.stringify({ adminSection: 'unsupported' }), '전기국', 'settings'), 'examiners');
assert.equal(adminUI.readAdminSection(JSON.stringify({ adminSection: 'accounts' }), '전기국', 'settings'), 'examiners', 'Previously saved account-menu sessions must open the unified examiner tab.');
const emptyState = domain.createInitialState('2026-10');
const managerProps = { state: { ...emptyState, methods: [] }, month: emptyState.months[0], busy: false, dirty() {}, save: async () => true, onNavigate() {}, hasUnsaved: false };
for (const Manager of [adminUI.TestAccountManager, adminUI.TestMethodManager]) {
  hookIndex = 0; hookOverrides = [];
  const tree = Manager(managerProps);
  const placeholders = descendants(tree).filter(({ element }) => element.type?.name === 'Empty');
  assert.equal(placeholders.length, 1);
  assert(placeholders.every(({ element }) => element.props.actions === undefined), 'Empty list and unselected editor must not repeat the toolbar registration action.');
}
hookIndex = 0; hookOverrides = [];
const initialUserForm = adminUI.AccountEditor({ state: emptyState, bureau: '전기국', busy: false, dirty() {}, save: async () => true, onClose() {} });
const bureauField = descendants(initialUserForm).find(({ element }) => element.type === 'input' && element.props.readOnly === true);
assert.equal(bureauField.element.props.value, '전기국');
let savedAction;
hookIndex = 0;
hookOverrides = [{ name: '새 담당자', bureau: '다른 국', division: '시험과', roles: ['examiner'], active: true, groupId: '', responsibilities: [] }];
const userForm = adminUI.AccountEditor({ state: emptyState, bureau: '전기국', busy: false, dirty() {}, onClose() {}, save: async action => { savedAction = action; return true; } });
const form = descendants(userForm).find(({ element }) => element.type === 'form').element;
await form.props.onSubmit({ preventDefault() {} });
assert.equal(savedAction.type, 'saveExaminer');
assert.equal(savedAction.user.bureau, '전기국');
const modal = initialUserForm.type(initialUserForm.props);
assert.equal(descendants(modal).find(({ element }) => element.props.role === 'dialog').element.props['aria-labelledby'], 'adm-account-dialog-title');
assert(descendants(modal).some(({ element }) => element.props.id === 'adm-account-dialog-title'));
let closedAccounts = 0;
const enteredAccount = { name: '입력 보존 담당자', bureau: '전기국', division: '시험과', roles: ['examiner', 'ai'], active: true, groupId: '', responsibilities: [] };
function accountDialog(extra = {}, failed = false) {
  hookIndex = 0; hookOverrides = [enteredAccount, failed];
  return adminUI.AccountEditor({ state: emptyState, bureau: '전기국', busy: false, dirty() {}, onClose() { closedAccounts++; }, save: async () => false, ...extra });
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
assert(descendants(visibleFailure).some(({ element }) => element.props.role === 'alert' || element.type?.name === 'SaveFailure' && descendants(element.type(element.props)).some(({element}) => element.props.role === 'alert')));
assert.equal(descendants(visibleFailure).find(({ element }) => element.type === 'input' && element.props.required).element.props.value, enteredAccount.name);
const recoveryFeedback = require('react/jsx-runtime').jsx('div', { role: 'alert', children: '충돌 안내 및 입력 보관' });
assert(descendants(accountDialog({ saveFeedback: recoveryFeedback }, true)).some(({ element }) => element === recoveryFeedback), 'Server guidance and input-recovery actions must remain available inside the modal.');
await descendants(accountDialog({ save: async () => true })).find(({ element }) => element.type === 'form').element.props.onSubmit({ preventDefault() {} });
assert.equal(closedAccounts, 2, 'A successful save must close the modal.');
for (const editing of ['new', 'managed-user']) {
  const managedUser = { ...enteredAccount, id: 'managed-user' };
  hookIndex = 0; hookOverrides = ['', 'all', 'all', '', { kind: 'account', id: editing === 'new' ? undefined : editing }, false];
  const manager = adminUI.TestAccountManager({ ...managerProps, state: { ...managerProps.state, users: [managedUser] } });
  const editor = descendants(manager).find(({ element }) => element.type === adminUI.AccountEditor).element;
  assert.equal(editor.props.user, editing === 'new' ? undefined : managedUser, 'New and existing accounts must both open the modal editor.');
}
const people = [{ id: 'one', name: '김담당', division: '전기1과', roles: ['examiner','ai'], active: true }, { id: 'two', name: '이담당', division: '화학과', roles: ['examiner'], active: false }];
const methodManagerProps = { ...managerProps, state: emptyState };
hookIndex = 0; hookOverrides = [];
const catalog = adminUI.TestMethodManager(methodManagerProps);
const aiCards = descendants(catalog).filter(({ element }) => element.type === 'button' && element.props.className?.startsWith('adm-ai-card '));
assert.deepEqual(Array.from(aiCards, ({ element }) => element.props['aria-label']), ['AI 종류 ChatGPT 수정', 'AI 종류 클로드 수정', 'AI 종류 Gemini 수정', 'AI 종류 퍼플렉시티 수정', 'AI 종류 Grok 수정']);
assert.deepEqual(Array.from(aiCards, ({ element }) => element.props.className.includes('is-inactive')), [false, false, true, true, true]);
assert(aiCards.every(({ element }) => element.props['aria-haspopup'] === 'dialog'));
assert(!aiCards.some(({ element }) => JSON.stringify(element).includes('선행기술조사')), 'The AI catalog only manages actual AI tools.');
assert(!descendants(catalog).some(({ element }) => element.type === adminUI.MethodEditor), 'The catalog must not show an inline or initially open editor.');
for (const editing of ['new', 'claude']) {
  hookIndex = 0; hookOverrides = [editing];
  const tree = adminUI.TestMethodManager(methodManagerProps);
  const editor = descendants(tree).find(({ element }) => element.type === adminUI.MethodEditor).element;
  assert.equal(editor.props.method?.id, editing === 'new' ? undefined : editing);
}
let closedMethods = 0;
let savedMethodAction, savedMethodMessage;
const enteredMethod = { name: 'Gemini', kind: 'ai', active: true };
function methodDialog(extra = {}, failed = false) {
  hookIndex = 0; hookOverrides = [enteredMethod, failed];
  return adminUI.MethodEditor({ busy: false, dirty() {}, onClose() { closedMethods++; }, save: async (action, message) => { savedMethodAction = action; savedMethodMessage = message; return true; }, ...extra });
}
const newMethod = methodDialog();
const methodShell = newMethod.type(newMethod.props);
assert.equal(descendants(methodShell).find(({ element }) => element.props.role === 'dialog').element.props['aria-labelledby'], 'adm-method-dialog-title');
await descendants(newMethod).find(({ element }) => element.type === 'form').element.props.onSubmit({ preventDefault() {} });
assert.equal(savedMethodAction.type, 'saveMethod');
assert.equal(savedMethodAction.method.kind, 'ai');
assert.equal(savedMethodAction.method.name, 'Gemini');
assert.match(savedMethodMessage, /심사관 관리에서 담당 AI를 배정/);
assert(!savedMethodMessage.includes('월별 운영'), 'AI registration must point to the current assignment screen.');
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
let methodDeletes = 0, deleteClosed = 0, deletedMethodAction;
function renderMethodDelete(options = {}) {
  hookIndex = 0; hookOverrides = [claude, false];
  return adminUI.MethodEditor({ method: claude, busy: false, dirty() {}, onClose() { deleteClosed++; }, save: async action => { methodDeletes++; deletedMethodAction = action; return true; }, ...options });
}
const deleteButton = tree => descendants(tree).find(({ element }) => element.props.children === 'AI 종류 삭제').element;
assert(!descendants(newMethod).some(({ element }) => element.props.children === 'AI 종류 삭제'));
allowDiscard = false;
await deleteButton(renderMethodDelete()).props.onClick(); assert.equal(methodDeletes, 0);
allowDiscard = true;
const busyMethodDelete = deleteButton(renderMethodDelete({ busy: true }));
assert.equal(busyMethodDelete.props.disabled, true); await busyMethodDelete.props.onClick(); assert.equal(methodDeletes, 0);
hookWrites.length = 0;
await deleteButton(renderMethodDelete({ save: async () => false })).props.onClick();
assert.equal(deleteClosed, 0); assert.equal(hookWrites.findLast(entry => entry.index === 1).value, true);
await deleteButton(renderMethodDelete()).props.onClick();
assert.equal(deleteClosed, 1); assert.equal(JSON.stringify(deletedMethodAction), JSON.stringify({ type: 'deleteMethod', methodId: claude.id }));
const deletedCatalogState = domain.applyAction(emptyState, { admin: true }, deletedMethodAction);
hookIndex = 0; hookOverrides = [null];
const remainingAI = descendants(adminUI.TestMethodManager({ ...methodManagerProps, state: deletedCatalogState })).filter(({ element }) => element.props.className?.startsWith('adm-ai-card '));
assert.deepEqual(Array.from(remainingAI, ({ element }) => element.props['aria-label']), ['AI 종류 ChatGPT 수정', 'AI 종류 Gemini 수정', 'AI 종류 퍼플렉시티 수정', 'AI 종류 Grok 수정']);
hookIndex = 0; hookOverrides = ['claude'];
assert(!descendants(adminUI.TestMethodManager({ ...methodManagerProps, state: deletedCatalogState })).some(({ element }) => element.type === adminUI.MethodEditor));
const historicalMethods = domain.applyAction(domain.createDemoState('2026-10'), { admin: true }, { type: 'deleteMethod', methodId: 'chatgpt' });
hookIndex = 0; hookOverrides = [];
const historicalOwner = adminUI.AccountEditor({ state: historicalMethods, user: historicalMethods.users[0], busy: false, dirty() {}, onClose() {}, save: async () => true });
const historicalAssignments = descendants(historicalOwner).filter(({ element }) => element.type === 'input' && /ChatGPT 담당$/.test(element.props['aria-label'] || ''));
assert.equal(historicalAssignments.length, 2);
assert(historicalAssignments.every(({ element }) => element.props.checked || element.props.disabled));
hookIndex = 0; hookOverrides = [];
const otherOwner = adminUI.AccountEditor({ state: historicalMethods, user: historicalMethods.users[1], busy: false, dirty() {}, onClose() {}, save: async () => true });
assert(!descendants(otherOwner).some(({ element }) => element.type === 'input' && /ChatGPT 담당$/.test(element.props['aria-label'] || '')));
hookIndex = 0; hookOverrides = ['검색결과없음', 'all', 'all', null];
const noMatchingAccount = adminUI.TestAccountManager({ ...managerProps, state: { ...emptyState, users: people } });
const searchEmpty = descendants(noMatchingAccount).find(({ element }) => element.props?.title === '검색 조건에 맞는 계정이 없습니다.');
assert(searchEmpty.element.props.actions, 'A search with no results must retain its reset action.');
assert.equal(adminUI.filterAdminUsers(people, '전기', 'ai', 'active')[0].id, 'one');
assert.equal(adminUI.filterAdminUsers(people, '담당', 'all', 'inactive')[0].id, 'two');
assert.equal(adminUI.filterAdminUsers(people, '미등록', 'all', 'all').length, 0);
const demo = domain.createDemoState('2026-10');
// Unified directory: group cards above five-column examiner table, all edits in modals.
function renderDirectory(options = {}) {
  hookIndex=0; hookOverrides=['', 'all', 'all', '', options.dialog ?? null, options.dirty ?? false]; hookEffects.length=0;
  return adminUI.TestAccountManager({ ...managerProps, state: options.state || demo, month: undefined, dirty: options.markDirty || (()=>{}), save: options.save || (async()=>true) });
}
const directory=renderDirectory();
assert.equal(descendants(directory).filter(({element})=>element.type==='article').length,2);
assert.equal(JSON.stringify(descendants(directory).filter(({element})=>element.type==='th').map(({element})=>element.props.children)), JSON.stringify(['심사관명','심사과','소속 그룹','권한','담당 AI']));
assert(!JSON.stringify(directory).includes('이달 참여'));
assert(!descendants(directory).some(({element})=>element.props.children==='심사관 관리 저장'));
hookWrites.length=0;
descendants(directory).find(({element})=>element.props['aria-label']===demo.users[0].name+' 심사관 정보 수정').element.props.onClick();
assert.equal(JSON.stringify(hookWrites.findLast(entry=>entry.index===4).value),JSON.stringify({kind:'account',id:demo.users[0].id}));
const directoryModal=renderDirectory({dialog:{kind:'account',id:demo.users[0].id}});
assert.equal(descendants(directoryModal).find(({element})=>element.type===adminUI.AccountEditor).element.props.user.id,demo.users[0].id);
const groupModal=renderDirectory({dialog:{kind:'group'}});
assert(descendants(groupModal).some(({element})=>element.type===adminUI.GroupEditor));
const deleteModal=renderDirectory({dialog:{kind:'delete-group',id:'group-a'}});
assert(descendants(deleteModal).some(({element})=>element.type===adminUI.GroupDeleteDialog));
assert.equal(adminUI.readAdminSection(JSON.stringify({adminSection:'groups'}),'기획국'),'examiners');
const examinerDraft=adminUI.examinerForm(demo,demo.users[1]);
examinerDraft.name='통합 수정 심사관'; examinerDraft.division='통합 심사과'; examinerDraft.groupId='group-b';
examinerDraft.responsibilities.push({groupId:'group-a',methodId:'chatgpt'});
let examinerAction;
hookIndex=0;hookOverrides=[examinerDraft,false];
const atomicEditor=adminUI.AccountEditor({state:demo,user:demo.users[1],busy:false,dirty(){},onClose(){},save:async action=>{examinerAction=action;return true;}});
assert(!JSON.stringify(atomicEditor).includes('담당자 변경'), 'Adding a parallel AI responsibility must not imply reassignment.');
assert(JSON.stringify(atomicEditor).includes('각 담당자는 검색 결과를 개별 납품합니다.'));
await descendants(atomicEditor).find(({element})=>element.type==='form').element.props.onSubmit({preventDefault(){}});
assert.equal(examinerAction.type,'saveExaminer');
const atomicSaved=domain.applyAction(demo,{admin:true},examinerAction);
assert.equal(atomicSaved.users.find(user=>user.id===demo.users[1].id).division,'통합 심사과');
assert.equal(atomicSaved.personnel.memberships.find(entry=>entry.userId===demo.users[1].id).groupId,'group-b');
assert.deepEqual(Array.from(atomicSaved.personnel.assignments.filter(entry=>entry.groupId==='group-a'&&entry.methodId==='chatgpt'), entry=>entry.userId),[demo.users[0].id,demo.users[1].id], 'Saving an additional AI assignee must retain the existing assignee.');
assert.equal(JSON.stringify(atomicSaved.months),JSON.stringify(demo.months));
assert.equal(atomicSaved.cases[0].groupId,'group-a');
const parallelAssignmentState = structuredClone(demo);
parallelAssignmentState.users[2].roles.push('ai');
parallelAssignmentState.personnel.assignments.push({ groupId: 'group-a', methodId: 'chatgpt', userId: parallelAssignmentState.users[2].id });
const parallelExaminerDraft = adminUI.examinerForm(parallelAssignmentState, parallelAssignmentState.users[1]);
parallelExaminerDraft.responsibilities.push({ groupId: 'group-a', methodId: 'chatgpt' });
hookIndex = 0; hookOverrides = [parallelExaminerDraft, false];
const parallelEditor = adminUI.AccountEditor({ state: parallelAssignmentState, user: parallelAssignmentState.users[1], busy: false, dirty() {}, onClose() {}, save: async () => true });
const parallelChoice = descendants(parallelEditor).find(({ element }) => element.type === 'label' && descendants(element).some(({ element: child }) => child.props['aria-label'] === parallelAssignmentState.groups[0].name + ' ChatGPT 담당')).element;
const parallelChoiceText = JSON.stringify(parallelChoice);
assert(parallelChoiceText.includes('다른 담당자: '));
assert(parallelChoiceText.includes(parallelAssignmentState.users[0].name));
assert(parallelChoiceText.includes(parallelAssignmentState.users[2].name), 'Every other assignee must be shown, not only the first.');
assert(!JSON.stringify(parallelEditor).includes('담당자 변경'));
const parallelCheckbox = descendants(parallelChoice).find(({ element }) => element.type === 'input').element;
assert.equal(parallelCheckbox.props.checked, true);
assert.equal(parallelCheckbox.props.disabled, false);
hookIndex = 0; hookOverrides = [null];
const parallelMethodManager = adminUI.TestMethodManager({ ...methodManagerProps, state: parallelAssignmentState });
const parallelAssignmentSummary = descendants(parallelMethodManager).find(({ element }) => element.props.id === 'adm-ai-assignment-chatgpt').element;
assert.deepEqual(Array.from(parallelAssignmentSummary.props.children), ['담당 배정 ', 2, '개 그룹 · 담당자 ', 3, '명'], 'Multiple assignees in one group must not inflate the group count.');
const settingsDraft=adminUI.operatingSettings(demo.months[0]);settingsDraft.selectionDeadline='2026-11-05';
const latestPersonnelMonth={...demo.months[0],assignments:demo.personnel.assignments};
const droppedAI=adminUI.mergeOperatingMonth(latestPersonnelMonth,{...settingsDraft,methodIds:['chatgpt','baseline']});
assert.deepEqual(droppedAI.assignments,latestPersonnelMonth.assignments);
assert.deepEqual(droppedAI.methodIds,latestPersonnelMonth.methodIds, 'Operating settings must not edit the legacy comparison list.');
// The monthly table exposes independent phase states and deadline dialogs.
const concurrentState = domain.withDefaultOperationMonths(domain.applyAction(demo, { admin: true }, { type: 'saveMonth', month: domain.emptyMonth('2026-11') }));
let monthManagementAction;
hookIndex = 0; hookOverrides = [];
const concurrentManagement = adminUI.MonthManager({ ...managerProps, state: concurrentState, month: concurrentState.months[1], save: async action => { monthManagementAction = action; return true; } });
assert.equal(descendants(concurrentManagement).filter(({element}) => element.type === 'article').length, 0);
assert.equal(descendants(concurrentManagement).filter(({element}) => element.type === 'select').length, 9);
assert(!descendants(concurrentManagement).some(({element}) => element.type === 'input' || element.type === adminUI.MonthlyForm));
for(const stage of domain.OPERATION_STAGES) {
 const control=descendants(concurrentManagement).find(({element})=>element.props['aria-label']==='2026년 11월 '+stage.label+' 상태').element;
 assert.deepEqual(Array.from(control.props.children,option=>option.props.children),['시작 전','진행','중지','마감']);
 await control.props.onChange({target:{value:'running'}});
 assert.equal(monthManagementAction.type,'setMonthStage');assert.equal(monthManagementAction.monthId,'2026-11');assert.equal(monthManagementAction.stage,stage.id);assert.equal(monthManagementAction.status,'running');
}
hookIndex = 0; hookOverrides = [];
const defaultMonthManager = adminUI.MonthManager({ ...managerProps, state: domain.createInitialState(), month: undefined });
assert.deepEqual(Array.from(descendants(defaultMonthManager).filter(({element})=>element.type==='th'&&element.props.scope==='row'),({element})=>element.props.children.props.children),['2026년 11월','2026년 12월','2027년 1월']);
const chooseNovember=descendants(concurrentManagement).find(({element})=>element.props['aria-label']==='2026년 11월 기한 설정').element;
chooseNovember.props.onClick();assert(hookWrites.some(write=>write.index===0&&write.value==='2026-11'));
hookIndex=0;hookOverrides=['2026-11'];
const openDeadlineManager=adminUI.MonthManager({...managerProps,state:concurrentState});
assert.equal(descendants(openDeadlineManager).find(({element})=>element.type===adminUI.MonthlyForm).element.props.month.id,'2026-11');
for(const patch of [{busy:true},{hasUnsaved:true}]) {
 hookIndex=0;hookOverrides=[];
 const blocked=adminUI.MonthManager({...managerProps,state:concurrentState,...patch});
 assert(descendants(blocked).filter(({element})=>element.type==='select'||element.type==='button').every(({element})=>element.props.disabled));
}
const mixedReferences = ['KR1020200000000A', 'Attention Is All You Need', '10.48550/arXiv.1706.03762', 'https://arxiv.org/abs/1706.03762'];
const mixedState = domain.applyAction(demo, { userId: 'demo-user-1' }, { type: 'saveResult', caseId: demo.cases[0].id, methodId: 'chatgpt', documents: mixedReferences, publish: true });
const mixedProps = { state: mixedState, item: mixedState.cases[0], month: mixedState.months[0], busy: false, dirty() {}, save: async () => true };
const commentField = tree => descendants(tree).find(({ element }) => element.type === 'textarea' && element.props['aria-label'] === `${mixedProps.item.applicationNumber} 건 관련 피드백(선택)`)?.element;
function summaryEditor(props, overrides = []) { hookIndex = 0; hookOverrides = overrides; hookOverrides[7] = 'results'; return ui.TestEvaluationEditor(props); }
hookIndex=0; hookOverrides=[];
const evaluationTree=ui.TestEvaluationEditor(mixedProps);
assert.equal(commentField(evaluationTree),undefined,'Case feedback belongs to the result-review step.');
const summaryTree=summaryEditor(mixedProps);
assert.equal(commentField(summaryTree).props.value,'');
assert.equal(commentField(summaryTree).props.maxLength,domain.OVERALL_COMMENT_MAX_LENGTH);
assert(!descendants(evaluationTree).some(({element})=>element.type==='table'),'Reports and evaluations use independent panes.');
const deliveredOnlyState=structuredClone(mixedState); deliveredOnlyState.months[0].methodIds=[];
deliveredOnlyState.results=deliveredOnlyState.results.filter(result=>result.caseId!==mixedProps.item.id||result.methodId!=='claude');
hookIndex=0;hookOverrides=[];
assert.deepEqual(descendants(summaryEditor({...mixedProps,state:deliveredOnlyState})).filter(({element})=>element.props.className==='tw-rank-buttons').map(({element})=>element.props['aria-label']),['ChatGPT 품질 순위','선행기술조사 품질 순위']);
let savedCommentAction;
hookIndex=0;hookOverrides=[];hookOverrides[2]='작성한 총평';
const commentSaveTree=summaryEditor({...mixedProps,save:async action=>{savedCommentAction=action;return false;}},hookOverrides);
await descendants(commentSaveTree).find(({element})=>element.type==='button'&&element.props.children==='임시저장').element.props.onClick();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(savedCommentAction.overallComment,'작성한 총평');
for(const blocked of [{busy:true},{month:{...mixedProps.month,closed:true}}]){assert.equal(commentField(summaryEditor({...mixedProps,...blocked})).props.disabled,true);}
const structuredDocuments=domain.normalizeLiteratureDocuments([
 {kind:'patent',number:'KR20100001234A',url:'https://example.test/published-patent',reportMarkdown:'## 공개 특허 보고서\n\n구성 대비 내용.'},
 {kind:'non-patent',authors:'Lee, S.',title:'A structured reference',publication:'Research Journal',publicationPlace:'Seoul',publisher:'Research Press',publicationDate:'2020-06',volume:'Vol. 1',issue:'No. 3',pages:'pp. 12–16',acquiredDate:'2026-10-30',dateNote:'발행일 미상',url:'https://example.test/published-paper',reportMarkdown:'## 공개 논문 보고서\n\n관련 구성과 근거.'}
]);
let structuredState=domain.applyAction(demo,{userId:'demo-user-1'},{type:'saveResult',caseId:demo.cases[0].id,methodId:'chatgpt',documents:structuredDocuments.map(d=>d.number),documentDetails:structuredDocuments,publish:true});
const privateDraftDocuments=structuredDocuments.map(d=>({...d,url:'https://example.test/private-draft',reportMarkdown:'심사관에게 보이면 안 되는 수정 초안'}));
structuredState=domain.applyAction(structuredState,{userId:'demo-user-1'},{type:'saveResult',caseId:demo.cases[0].id,methodId:'chatgpt',documents:privateDraftDocuments.map(d=>d.number),documentDetails:privateDraftDocuments,publish:false});
const structuredProps={...mixedProps,state:structuredState};
for(let index=0;index<structuredDocuments.length;index++){
 hookIndex=0;hookOverrides=[];hookOverrides[4]=index;
 const tree=ui.TestEvaluationEditor(structuredProps);
 const reader=descendants(tree).find(({element})=>element.type?.name==='LiteratureReader').element;
 assert.deepEqual(JSON.parse(JSON.stringify(reader.props.document)),JSON.parse(JSON.stringify(structuredDocuments[index])));
 const expanded=descendants(reader.type(reader.props));
 assert.equal(expanded.find(({element})=>element.type===NoticeMarkdownStub).element.props.markdown,structuredDocuments[index].reportMarkdown);
 assert(!JSON.stringify(tree).includes('심사관에게 보이면 안 되는 수정 초안'));
}
assert.deepEqual(JSON.parse(JSON.stringify(domain.literatureDetailsFor(domain.resultFor(structuredState,demo.cases[0].id,'chatgpt'),'draft'))),JSON.parse(JSON.stringify(privateDraftDocuments)));
await ui.TestExportPersonal(structuredState,structuredProps.month.id,[structuredProps.item],'기획국');
const exportedLiterature=exportedWorkbook.sheets.find(sheet=>sheet.name==='선행기술 목록');
const literatureHeader=exportedLiterature.rows[0];
for(const document of structuredDocuments){const row=exportedLiterature.rows.find(entry=>entry[literatureHeader.indexOf('문헌번호·서지정보')]===document.number);assert(row);assert.equal(row[literatureHeader.indexOf('URL')],document.url);assert.equal(row[literatureHeader.indexOf('보고서 (마크다운)')],document.reportMarkdown);}

assert.equal(adminUI.filterTargetCases(demo, '2026-10', { status: 'complete' }).length, 20);
assert.equal(adminUI.filterTargetCases(demo, '2026-11').length, 0);
assert.equal(adminUI.filterTargetCases(demo, '2026-10', { query: demo.cases[0].applicationNumber.replace(/\D/g, '') }).length, 1);
assert.equal(adminUI.filterTargetCases(demo, '2026-10', { examinerId: demo.users[0].id }).length, 2);
function renderMonthlyForm(props = {}) {
  hookIndex = 0; hookOverrides = [];
  return adminUI.MonthlyForm({ state: demo, month: demo.months[0], busy: false, hasUnsaved: false, dirty() {}, onNavigate() {}, save: async () => true, ...props });
}
let monthAction; const monthlyDirty = [];
const monthForm = renderMonthlyForm({ dirty: value => monthlyDirty.push(value), save: async action => { monthAction = action; return true; } });
assert(!descendants(monthForm).some(({ element }) => element.props.title === '비교 AI 선택' || element.type === 'input' && element.props.type === 'checkbox'), 'Monthly operation settings must not require comparison AI selection.');
assert(!descendants(monthForm).some(({ element }) => element.type === 'select' && /이달 참여 그룹|담당자$/.test(element.props['aria-label'] || '')), 'Personnel controls must appear only in the unified examiner tab.');
assert(!descendants(monthForm).some(({ element }) => element.props.className === 'adm-save-bar' || ['월별 운영 저장', '설정 변경 취소'].includes(element.props.children)), 'Monthly operations must not show a save/cancel footer.');
await descendants(monthForm).find(({ element }) => element.props['aria-label'] === '대상 건 선정 예정 기한').element.props.onChange({ target: { value: '2026-11-05' } });
assert.equal(monthAction.type, 'saveMonth');
assert.equal(monthAction.month.selectionDeadline, '2026-11-05', 'Changing the date must immediately submit it.');
assert.equal(monthAction.month.assignments.length, demo.months[0].assignments.length, 'Operating settings must preserve personnel assignments.');
assert.deepEqual(monthAction.month.stages, demo.months[0].stages);
assert.deepEqual(monthlyDirty, [], 'Immediate saves must not create manual-save drafts.');
let liveSchedule = demo;
for (const [label, deadline, value] of [['대상 건 선정', 'selectionDeadline', '2026-11-01'], ['AI 검색 결과 입력', 'resultDeadline', '2026-11-10'], ['평가', 'evaluationDeadline', '2026-11-20'], ['대상 건 선정', 'selectionDeadline', '']]) {
  const liveForm = renderMonthlyForm({ state: liveSchedule, month: liveSchedule.months[0], save: async action => { liveSchedule = domain.applyAction(liveSchedule, { admin: true }, action); return true; } });
  await descendants(liveForm).find(({ element }) => element.props['aria-label'] === `${label} 예정 기한`).element.props.onChange({ target: { value } });
  assert.equal(liveSchedule.months[0][deadline], value);
}
assert.equal(liveSchedule.months[0].resultDeadline, '2026-11-10', 'Later date changes must retain earlier immediate saves.');
assert.equal(liveSchedule.months[0].evaluationDeadline, '2026-11-20');
assert.deepEqual(liveSchedule.months[0].stages, demo.months[0].stages);
const closedMonth = { ...demo.months[0], closed: true };
let scheduleAction;
const closedForm = renderMonthlyForm({ month: closedMonth, save: async action => { scheduleAction = action; return true; } });
const modifyingInputs = descendants(closedForm).filter(({ element }) => element.type === 'input' && ['checkbox','date','number'].includes(element.props.type));
assert.equal(modifyingInputs.length, 3);
assert(modifyingInputs.filter(({ element }) => element.props.type === 'date').every(({ element }) => element.props.disabled === false));
await modifyingInputs.find(({ element }) => element.props['aria-label'] === '평가 예정 기한').element.props.onChange({ target: { value: '2026-11-20' } });
assert.equal(scheduleAction.month.evaluationDeadline, '2026-11-20', 'Closed-month dates must also save immediately.');
assert.equal(scheduleAction.month.closed, true);
assert.deepEqual(scheduleAction.month.confirmedUserIds, closedMonth.confirmedUserIds);
let releaseSchedule; const concurrentMonthlyActions = [];
const savingForm = renderMonthlyForm({ save: action => { concurrentMonthlyActions.push(action); return new Promise(resolve => { releaseSchedule = resolve; }); } });
const savingDates = descendants(savingForm).filter(({ element }) => element.type === 'input' && element.props.type === 'date');
const savingRequest = savingDates[0].element.props.onChange({ target: { value: '2026-11-02' } });
await savingDates[1].element.props.onChange({ target: { value: '2026-11-12' } });
assert.equal(concurrentMonthlyActions.length, 1, 'An in-flight date save must prevent overlapping date and stage writes before the busy render.');
releaseSchedule(true); await savingRequest;
const failedSchedule = renderMonthlyForm({ save: async () => false });
const writesBeforeFailure = hookWrites.length;
await descendants(failedSchedule).find(({ element }) => element.props['aria-label'] === '평가 예정 기한').element.props.onChange({ target: { value: '2026-11-25' } });
const failureWrites = hookWrites.slice(writesBeforeFailure).filter(write => write.index === 0);
assert.equal(failureWrites[0].value.evaluationDeadline, '2026-11-25');
assert.equal(failureWrites.at(-1).value.evaluationDeadline, demo.months[0].evaluationDeadline, 'Failed auto-saves must show the last persisted date.');
for (const patch of [{ busy: true }, { hasUnsaved: true }]) {
  let disabledWrites = 0;
  const blockedSchedule = renderMonthlyForm({ ...patch, save: async () => { disabledWrites++; return true; } });
  const dates = descendants(blockedSchedule).filter(({ element }) => element.type === 'input');
  assert(dates.every(({ element }) => element.props.disabled));
  await dates[0].element.props.onChange({ target: { value: '2026-11-30' } });
  assert.equal(disabledWrites, 0);
}
const mixedStages = { ...demo.months[0], stages: { selection: 'closed', result: 'stopped', evaluation: 'running' } };
hookIndex = 0; hookOverrides = [];
const mixedSchedule = OperationSchedule({ month: mixedStages });
assert.equal(JSON.stringify(descendants(mixedSchedule).filter(({ element }) => /operation-stage-status/.test(element.props.className || '')).map(({ element }) => element.props.children)), JSON.stringify(['마감', '중지', '진행']));
for (const status of ['pending', 'stopped', 'closed']) {
  const controlledMonth = { ...demo.months[0], stages: { selection: status, result: status, evaluation: status } };
  for (const [stage, render] of [
    ['selection', () => ui.TestSelectionEditor({ state: demo, month: controlledMonth, user: demo.users[1], busy: false, dirty() {}, save: async () => true })],
    ['evaluation', () => ui.TestEvaluationEditor({ state: demo, month: controlledMonth, item: demo.cases[0], busy: false, dirty() {}, save: async () => true })],
  ]) {
    hookIndex = 0; hookOverrides = stage === 'selection' ? [undefined, { index: null, numberParts: ['10', '2026', '1'], cpc: '', hasPriorArtReport: false }, '', ''] : [];
    if (stage === 'selection') delete hookOverrides[0];
    const editor = render();
    const nestedEditor = descendants(editor).find(({ element }) => element.type?.name === 'LiteratureEditor');
    const inputTree = nestedEditor ? nestedEditor.element.type(nestedEditor.element.props) : editor;
    const inputs = descendants(inputTree).filter(({ element }) => ['input', 'select', 'textarea'].includes(element.type)
      && !element.props.readOnly && element.props.children !== '포맷팅 프롬프트 복사');
    assert(inputs.length > 0); assert(inputs.every(({ element }) => element.props.disabled));
    assert(ui.TestStageNotice({ month: controlledMonth, stage }).props.children.includes('단계가'));
  }
}
// Before evaluation opens, display the examiner's submitted list instead of an editor.
const reviewState = structuredClone(demo);
const reviewUser = reviewState.users[0];
const submitted = reviewState.cases.filter(item => item.examinerId === reviewUser.id);
reviewState.months.push(domain.emptyMonth('2026-11'));
reviewState.cases.push({ ...submitted[0], id: 'other-month-case', monthId: '2026-11', applicationNumber: '10-2020-0000001' }, { ...submitted[0], id: 'draft-case', status: 'draft', applicationNumber: '10-2020-0000002' }, { ...submitted[0], id: 'cancelled-case', status: 'cancelled', applicationNumber: '10-2020-0000003' });
reviewState.results = reviewState.results.filter(result => result.caseId !== submitted[0].id);
function renderReview(month, { selectedId = '', unsaved = false, failed = false, ...props } = {}) {
  hookIndex = 0; hookOverrides = [unsaved, false];
  return ui.TestReviewWorkspace({ state: reviewState, month, user: reviewUser, bureau: '기획국', busy: false, dirty() {}, save: async () => true, notify() {}, ...props });
}
for (const month of [
  { ...reviewState.months[0], stages: { evaluation: 'stopped' } },
  { ...reviewState.months[0], stages: { evaluation: 'closed' } },
  { ...reviewState.months[0], closed: true },
]) {
  const tree = renderReview(month);
  assert.equal(tree.props.title, '제출한 출원 목록');
  const nodes = descendants(tree);
  const shown = nodes.filter(({ element }) => element.type === 'tbody').flatMap(({ element }) => element.props.children.map(row => row.props.children[0].props.children));
  assert.equal(JSON.stringify(shown), JSON.stringify(submitted.map(item => item.applicationNumber)));
  assert(!nodes.some(({ element }) => element.type === ui.TestEvaluationEditor), 'An inactive evaluation stage must not render disabled evaluation forms.');
  const searchStatuses = nodes.filter(({ element }) => ['입력 대기', '입력 완료'].includes(element.props.children)).map(({ element }) => element.props.children);
  assert.equal(JSON.stringify(searchStatuses), JSON.stringify(['입력 대기', '입력 완료']));
  await nodes.find(({ element }) => element.props.children === '내 업무 자료 엑셀 저장').element.props.onClick();
  assert.equal(exportedWorkbook.sheets.find(sheet => sheet.name === '출원별 현황').rows.length, submitted.length + 1);
}
for (const month of [reviewState.months[0], { ...reviewState.months[0], stages: { evaluation: 'running' } }]) {
  const list = renderReview(month);
  const nodes = descendants(list);
  assert(!nodes.some(({ element }) => element.type === ui.TestEvaluationEditor), 'Evaluation opens as a list without automatically selecting a case.');
  assert(!nodes.some(({ element }) => element.props.className === 'ev-stats'), 'Remove the four aggregate evaluation cards.');
  const rows = nodes.filter(({ element }) => element.props.className === 'ev-review-case');
  assert.equal(rows.length, submitted.length, 'Only this examiner’s confirmed cases in the selected month belong in the list.');
  const link=rows.at(-1).element;
  assert.equal(link.type,'a');assert.equal(link.props.target,'_blank');
  assert.equal(new URL(link.props.href,'http://localhost').searchParams.get('caseId'),submitted.at(-1).id);
}
// Counts describe delivered AI literature, independently of private drafts and baseline reports.
const literatureState = structuredClone(demo);
const literatureCase = literatureState.cases.find(item => item.examinerId === reviewUser.id);
for (const result of literatureState.results.filter(result => result.caseId === literatureCase.id)) {
  if (result.methodId === 'chatgpt') result.publishedDocuments = result.publishedDocuments.slice(0, 5);
  if (result.methodId === 'claude') result.publishedDocuments = result.publishedDocuments.slice(0, 3);
  result.draftDocuments = Array.from({ length: 7 }, (_, index) => 'Private draft ' + index);
}
literatureState.methods.push({ id: 'private-ai', name: '미공개 AI', kind: 'ai', active: true });
literatureState.results.push({ ...structuredClone(literatureState.results.find(result => result.caseId === literatureCase.id && result.methodId === 'chatgpt')), methodId: 'private-ai', publishedVersion: 0, publishedDocuments: [] });
const literatureTable = renderReview(literatureState.months[0], { state: literatureState });
const literatureNodes = descendants(literatureTable);
assert.deepEqual(Array.from(literatureNodes.filter(({ element }) => element.type === 'th' && element.props.scope === 'col'), ({ element }) => element.props.children), ['출원번호', 'CPC', 'AI 검색 문헌', '진행 상태', '평가']);
const literatureRows = literatureNodes.find(({ element }) => element.type === 'tbody').element.props.children;
const literatureRow = literatureRows.find(row => row.key === literatureCase.id);
assert.equal(literatureRow.props.children[2].props.children, 'ChatGPT 5, 클로드 3');
assert.equal(literatureRow.props.children[0].props.children.props.children, literatureCase.applicationNumber);
const cpcCellContent = literatureRow.props.children[1].props.children.props.children;
assert.equal(Array.isArray(cpcCellContent) ? cpcCellContent[0] : cpcCellContent, literatureCase.cpc || 'CPC 미입력');
assert.equal(literatureRow.props.children[4].props.children.props.target, '_blank');
// An undelivered assigned AI must not add an input-waiting badge to a finished comparison.
const partialDelivery = structuredClone(demo);
const partialCase = partialDelivery.cases.find(item => item.examinerId === reviewUser.id);
partialDelivery.results = partialDelivery.results.filter(result => result.caseId !== partialCase.id || result.methodId === 'claude');
partialDelivery.evaluations = partialDelivery.evaluations.filter(evaluation => evaluation.caseId !== partialCase.id || evaluation.methodId === 'claude');
const partialRanking = partialDelivery.rankings.find(ranking => ranking.caseId === partialCase.id);
partialRanking.versions = { claude: 1 }; partialRanking.values = { claude: 1, baseline: 2 }; partialRanking.finalized = true;
assert.equal(domain.caseStatus(partialDelivery, partialCase).inputComplete, false);
assert.equal(domain.caseStatus(partialDelivery, partialCase).complete, true);
const draftComparison = structuredClone(partialDelivery);
draftComparison.rankings.find(ranking => ranking.caseId === partialCase.id).finalized = false;
const staleComparison = structuredClone(partialDelivery);
staleComparison.results.find(result => result.caseId === partialCase.id).publishedVersion++;
const unreviewedComparison = structuredClone(partialDelivery);
unreviewedComparison.evaluations = unreviewedComparison.evaluations.filter(evaluation => evaluation.caseId !== partialCase.id);
unreviewedComparison.rankings = unreviewedComparison.rankings.filter(ranking => ranking.caseId !== partialCase.id);
for (const [state, expected] of [[partialDelivery, '평가 완료'], [draftComparison, '평가 중'], [staleComparison, '재확인 필요'], [unreviewedComparison, '미평가']]) {
  const list = renderReview(state.months[0], { state });
  const row = descendants(list).find(({ element }) => element.type === 'tbody').element.props.children.find(row => row.key === partialCase.id);
  const status = descendants(row.props.children[3]).find(({ element }) => typeof element.type === 'function').element;
  const badges = descendants(status.type(status.props)).filter(({ element }) => element.type?.name === 'Badge');
  assert.deepEqual(badges.map(({ element }) => element.props.children), [expected], 'The evaluation status cell shows one evaluation badge, independently of undelivered AI assignments.');
}
const pendingLiteratureState = structuredClone(literatureState);
pendingLiteratureState.results.filter(result => result.caseId === literatureCase.id).forEach(result => { result.publishedVersion = 0; result.publishedDocuments = []; });
const pendingLiterature = renderReview(pendingLiteratureState.months[0], { state: pendingLiteratureState });
const pendingLiteratureRow = descendants(pendingLiterature).find(({ element }) => element.type === 'tbody').element.props.children.find(row => row.key === literatureCase.id);
assert.equal(pendingLiteratureRow.props.children[2].props.children.props.children, '입력 대기');

const noSubmissions = { ...reviewState, cases: reviewState.cases.filter(item => item.examinerId !== reviewUser.id) };
hookIndex = 0; hookOverrides = [];
const emptyReview = ui.TestReviewWorkspace({ state: noSubmissions, month: { ...reviewState.months[0], stages: { evaluation: 'stopped' } }, user: reviewUser, busy: false, dirty() {}, save: async () => true, notify() {} });
assert(descendants(emptyReview).some(({ element }) => element.props.title === '제출한 출원이 없습니다.'));
hookIndex = 0; hookOverrides = [];
const selectingReview = ui.TestReviewWorkspace({ state: noSubmissions, month: { ...reviewState.months[0], confirmedUserIds: [], stages: { evaluation: 'stopped' } }, user: reviewUser, busy: false, dirty() {}, save: async () => true, notify() {} });
assert.equal(selectingReview.type, ui.TestSelectionEditor, 'Before submission, selection remains the primary task.');
const editableSubmittedMonth = { ...reviewState.months[0], stages: { selection: 'running', evaluation: 'stopped' } };
const submittedReview = renderReview(editableSubmittedMonth);
const editSubmitted = descendants(submittedReview.props.action).find(({ element }) => element.props.children === '제출 목록 수정').element;
editSubmitted.props.onClick();
assert(hookWrites.some(write => write.index === 1 && write.value === true));
for (const status of ['stopped', 'closed']) {
  const lockedReview = renderReview({ ...editableSubmittedMonth, stages: { selection: status, evaluation: 'stopped' } });
  assert(!descendants(lockedReview.props.action).some(({ element }) => element.props.children === '제출 목록 수정'));
}
hookIndex = 0; hookOverrides = [false, true];
const revisingReview = ui.TestReviewWorkspace({ state: reviewState, month: editableSubmittedMonth, user: reviewUser, busy: false, dirty() {}, save: async () => true, notify() {} });
assert.equal(revisingReview.type, ui.TestSelectionEditor);
let revisedAction;
hookIndex = 0; hookOverrides = [];
const revisedForm = ui.TestSelectionEditor({ ...revisingReview.props, save: async action => { revisedAction = action; return true; } });
assert.equal(revisedForm.props.title, '제출한 출원 목록 수정');
assert.equal(descendants(revisedForm).filter(({ element }) => element.type === 'button' && element.props.children === '수정').length, submitted.length);
assert(!descendants(revisedForm).some(({ element }) => element.type === 'input'), 'Submitted rows stay read-only until their edit button is selected.');
assert(!descendants(revisedForm).some(({ element }) => element.props.children === '임시저장'), 'Submitted edits must not silently turn published tasks into drafts.');
descendants(revisedForm).find(({ element }) => element.props.children === '수정 사항 저장').element.props.onClick();
await Promise.resolve(); await Promise.resolve();
assert.equal(revisedAction.confirm, true);
assert.equal(revisedAction.rows.length, submitted.length);
hookIndex = 0; hookOverrides = [[]];
const withdrawnForm = ui.TestSelectionEditor({ ...revisingReview.props, save: async () => true });
assert.equal(descendants(withdrawnForm).find(({ element }) => element.props.children === '수정 사항 저장').element.props.disabled, false);

// Selection is a read-only table with one segmented editor opened by an explicit action.
function selectionForm({ initialRows = [], editor = null, localError = '', autoSaveStatus = '', ...props } = {}) {
  hookIndex = 0; hookOverrides = [initialRows, editor, localError, autoSaveStatus];
  return ui.TestSelectionEditor({ state: domain.createInitialState('2026-11'), month: { ...domain.emptyMonth('2026-11'), stages: { selection: 'running' } }, user: reviewUser, busy: false, dirty() {}, save: async () => true, ...props });
}
function selectionNumberForm(numberParts = ['10', '', ''], { editIndex = null, cpcValue = ' G06N 20/00 ', reportValue = false, ...props } = {}) {
  return selectionForm({ ...props, editor: { index: editIndex, numberParts, cpc: cpcValue, hasPriorArtReport: reportValue } });
}
const selectionText = value => value == null || value === false ? '' : Array.isArray(value) ? value.map(selectionText).join('') : typeof value === 'object' ? selectionText(value.props?.children) : String(value);
const selectionNodes = tree => [...descendants(tree), ...descendants(tree.props.action)];
const selectionButtons = (tree, text) => selectionNodes(tree).filter(({ element }) => element.type === 'button' && selectionText(element.props.children) === text).map(({ element }) => element);
const selectionButton = (tree, text) => { const button = selectionButtons(tree, text)[0]; assert(button, 'Missing selection button: ' + text); return button; };
const numberFields = tree => descendants(tree).filter(({ element }) => element.props.maxLength && element.props.inputMode === 'numeric').map(({ element }) => element);
const numberAdd = tree => selectionButton(tree, '추가');
const reportToggle = form => descendants(form).find(({ element }) => element.type?.name === 'ReportPresenceToggle')?.element;
function writtenSelectionState(index, previous) {
  return hookWrites.filter(write => write.index === index).reduce((value, write) => typeof write.value === 'function' ? write.value(value) : write.value, previous);
}
// Preserve hook state and refs across selected renders, as React does during a failed-save retry.
function selectionSession({ initialRows = [], editor = null, localError = '', autoSaveStatus = '', ...props } = {}) {
  const values = [initialRows, editor, localError, autoSaveStatus];
  const refs = [];
  let writes = []; let effects = [];
  return {
    render(extra = {}) {
      for (const write of writes) values[write.index] = typeof write.value === 'function' ? write.value(values[write.index]) : write.value;
      writes = []; hookWrites.length = 0;
      const originalUseRef = hooks.useRef; let refIndex = 0;
      hooks.useRef = initial => refs[refIndex++] ||= { current: initial };
      let tree; const firstEffect = hookEffects.length;
      try { tree = selectionForm({ ...props, ...extra, initialRows: values[0], editor: values[1], localError: values[2], autoSaveStatus: values[3] }); }
      finally { hooks.useRef = originalUseRef; }
      effects = hookEffects.slice(firstEffect);
      return tree;
    },
    capture() { writes.push(...hookWrites); hookWrites.length = 0; },
    runEffects() { for (const effect of effects) effect(); },
    values,
  };
}
const existingSelectionRows = [
  { applicationNumber: '10-2025-0000001', cpc: 'G06F', hasPriorArtReport: true },
  { applicationNumber: '20-2026-0000012', cpc: '', hasPriorArtReport: false },
  { applicationNumber: '10 2026 0000052', cpc: 'G06Q' },
];
const restingSelection = selectionForm({ initialRows: existingSelectionRows });
assert.equal(numberFields(restingSelection).length, 0);
assert(!descendants(restingSelection).some(({ element }) => ['input', 'textarea', 'details'].includes(element.type)), 'The default selection screen must contain the table, without the detached entry or bulk-paste form.');
assert.equal(selectionButtons(restingSelection, '수정').length, existingSelectionRows.length);
assert.equal(selectionButtons(restingSelection, '삭제').length, existingSelectionRows.length);
assert.deepEqual(Array.from(descendants(restingSelection).filter(({ element }) => element.type === 'th' && element.props.scope === 'col').slice(0, 3), ({ element }) => selectionText(element.props.children)), ['출원번호', 'CPC', '선행기술조사 보고서']);
for (const label of ['있음', '없음', '미기록']) assert(selectionText(restingSelection).includes(label));
const beginDirty = [];
const beginNew = selectionForm({ initialRows: existingSelectionRows, dirty: value => beginDirty.push(value) });
hookWrites.length = 0;
selectionButton(beginNew, '출원 추가').props.onClick({ currentTarget: null });
const newEditor = writtenSelectionState(1, null);
assert.equal(newEditor.index, null);
assert.deepEqual(Array.from(newEditor.numberParts), ['10', '', '']);
assert.equal(newEditor.cpc, '');
assert.equal(newEditor.hasPriorArtReport, false);
assert.equal(beginDirty.at(-1), true, 'Opening an editor must protect navigation.');
for (const [index, row] of existingSelectionRows.entries()) {
  const form = selectionForm({ initialRows: existingSelectionRows });
  hookWrites.length = 0;
  selectionButtons(form, '수정')[index].props.onClick({ currentTarget: null });
  const editor = writtenSelectionState(1, null);
  assert.equal(editor.index, index);
  assert.deepEqual(Array.from(editor.numberParts), row.applicationNumber.replace(/\s/g, '-').split('-'));
  assert.equal(editor.cpc, row.cpc);
  assert.equal(editor.hasPriorArtReport, row.hasPriorArtReport, 'Opening a legacy row must preserve unknown report presence.');
  assert(!hookWrites.some(write => write.index === 0), 'Entering edit mode must not modify the selected list.');
}
for (const editIndex of [null, 0]) {
  const cancelDirty = []; let cancelRequests = 0;
  const cancelForm = selectionNumberForm(['10', '2026', '123'], { editIndex, initialRows: existingSelectionRows, dirty: value => cancelDirty.push(value), autoSave: async () => { cancelRequests++; return true; } });
  hookWrites.length = 0;
  selectionButton(cancelForm, '취소').props.onClick();
  assert.equal(writtenSelectionState(1, { index: editIndex }), null);
  assert(!hookWrites.some(write => write.index === 0));
  assert.equal(cancelRequests, 0, 'Cancelling a new or edited row must not write a selection.');
  assert.equal(cancelDirty.at(-1), false);
}
const editingSelection = selectionNumberForm(['10', '2026', '1'], { editIndex: 0, initialRows: existingSelectionRows });
for (const text of ['출원 추가', '임시저장', '선정 확정', '수정', '삭제']) for (const button of selectionButtons(editingSelection, text)) assert.equal(button.props.disabled, true, 'Other list actions are blocked while an editor is open: ' + text);
const editingSubmitted = selectionNumberForm(['10', '2026', '1'], { editIndex: 0, initialRows: existingSelectionRows, month: { ...domain.emptyMonth('2026-11'), confirmedUserIds: [reviewUser.id], stages: { selection: 'running' } } });
assert.equal(selectionButton(editingSubmitted, '수정 사항 저장').props.disabled, true);

// Segmented application numbers retain numeric filtering, focus movement, paste and serial padding.
const blankNumber = selectionNumberForm();
const blankParts = numberFields(blankNumber);
assert.deepEqual(blankParts.map(field => field.props.maxLength), [2, 4, 7]);
assert.equal(blankParts[0].props.value, '10');
assert.equal(numberAdd(blankNumber).props.disabled, true);
let focusedYear = 0; let focusedSerial = 0;
blankParts[1].props.ref({ focus() { focusedYear++; } });
blankParts[2].props.ref({ focus() { focusedSerial++; } });
blankParts[0].props.onChange({ target: { value: '1' } });
assert.equal(focusedYear, 0);
blankParts[0].props.onChange({ target: { value: '10' } });
assert.equal(focusedYear, 1);
blankParts[1].props.onChange({ target: { value: '2026' } });
assert.equal(focusedSerial, 1);
hookWrites.length = 0;
blankParts[2].props.onChange({ target: { value: '12a345678' } });
assert.equal(writtenSelectionState(1, { index: null, numberParts: ['10', '', ''], cpc: '', hasPriorArtReport: false }).numberParts[2], '1234567');
for (const [serial, expected] of [['1', '0000001'], ['0', '0000000'], ['123', '0000123'], ['000123', '0000123'], ['1234567', '1234567']]) {
  let addedAction;
  const form = selectionNumberForm(['10', '2026', serial], { autoSave: async action => { addedAction = action; return true; } });
  hookWrites.length = 0;
  await numberAdd(form).props.onClick();
  assert.equal(addedAction.rows[0].applicationNumber, '10-2026-' + expected);
  assert.equal(addedAction.rows[0].cpc, 'G06N 20/00');
  assert.equal(writtenSelectionState(1, {}), null, 'An added row must close its editor.');
}
for (const parts of [['1', '2026', '1'], ['10', '202', '1'], ['10', '2026', '']]) {
  assert.equal(numberAdd(selectionNumberForm(parts)).props.disabled, true);
  assert.equal(selectionButton(selectionNumberForm(parts, { editIndex: 0, initialRows: existingSelectionRows }), '저장').props.disabled, true);
}
const invalidPrefix = selectionNumberForm(['30', '2026', '1']);
hookWrites.length = 0;
await numberAdd(invalidPrefix).props.onClick();
assert(!hookWrites.some(write => write.index === 0), 'Do not append unsupported application types.');
for (const text of ['10-2026-123', '1020260000123']) {
  const form = selectionNumberForm(); let prevented = false;
  hookWrites.length = 0;
  numberFields(form)[0].props.onPaste({ clipboardData: { getData: () => text }, preventDefault() { prevented = true; } });
  assert(prevented);
  const pastedEditor = writtenSelectionState(1, {});
  assert.deepEqual(Array.from(pastedEditor.numberParts), text.includes('-') ? ['10', '2026', '123'] : ['10', '2026', '0000123']);
}
const backspaceForm = selectionNumberForm(['10', '', '']); let focusedPrefix = false;
const backspaceParts = numberFields(backspaceForm);
backspaceParts[0].props.ref({ focus() { focusedPrefix = true; } });
backspaceParts[1].props.onKeyDown({ key: 'Backspace', preventDefault() {} });
assert(focusedPrefix);
let selectionSaves = 0;
const unfinishedNumber = selectionNumberForm(['10', '202', ''], { save: async () => { selectionSaves++; return true; } });
selectionButton(unfinishedNumber, '임시저장').props.onClick();
selectionButton(unfinishedNumber, '선정 확정').props.onClick();
assert.equal(selectionSaves, 0, 'A pending row editor must not be silently omitted from a final save.');
const untouchedNumber = selectionForm({ save: async () => { selectionSaves++; return true; } });
await selectionButton(untouchedNumber, '임시저장').props.onClick();
await Promise.resolve(); await Promise.resolve();
assert.equal(selectionSaves, 1);

// Every completed row operation persists the entire list and retains its publication state.
for (const alreadySubmitted of [false, true]) {
  const month = { ...domain.emptyMonth('2026-11'), confirmedUserIds: alreadySubmitted ? [reviewUser.id] : [], stages: { selection: 'running' } };
  for (const operation of ['add', 'edit', 'delete']) {
    const persistedActions = []; const selectionDirty = [];
    const options = { initialRows: existingSelectionRows, month, dirty: value => selectionDirty.push(value), autoSave: async action => { persistedActions.push(action); return true; }, save: async () => { throw new Error('A row operation must not call the final-save callback.'); } };
    const form = operation === 'delete' ? selectionForm(options) : selectionNumberForm(['10', '2026', '123'], { ...options, editIndex: operation === 'edit' ? 0 : null, reportValue: false });
    hookWrites.length = 0;
    await (operation === 'delete' ? selectionButtons(form, '삭제')[0] : selectionButton(form, operation === 'edit' ? '저장' : '추가')).props.onClick();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(persistedActions.length, 1, 'Autosave once after a completed row ' + operation);
    const action = persistedActions[0];
    assert.equal(action.type, 'saveSelection');
    assert.equal(action.confirm, alreadySubmitted, 'Keep a new selection private and keep a submitted list published.');
    assert.equal(action.rows.length, existingSelectionRows.length + (operation === 'add' ? 1 : operation === 'delete' ? -1 : 0));
    if (operation === 'delete') assert.equal(action.rows[0], existingSelectionRows[1]);
    else {
      const changed = action.rows[operation === 'edit' ? 0 : action.rows.length - 1];
      assert.equal(changed.applicationNumber, '10-2026-0000123');
      assert.equal(changed.cpc, 'G06N 20/00');
      assert.equal(changed.hasPriorArtReport, false);
      assert.equal(action.rows[1], existingSelectionRows[1], 'Other rows must be preserved.');
    }
    assert.equal(selectionDirty.at(-1), false);
  }
}
for (const editIndex of [null, 1]) {
  let duplicateRequests = 0;
  const duplicateForm = selectionNumberForm(['10', '2026', '52'], { editIndex, initialRows: existingSelectionRows, autoSave: async () => { duplicateRequests++; return true; } });
  hookWrites.length = 0;
  await selectionButton(duplicateForm, editIndex === null ? '추가' : '저장').props.onClick();
  assert.equal(duplicateRequests, 0, 'Formatted duplicate application numbers must be rejected before autosave.');
  assert(!hookWrites.some(write => write.index === 0), 'A duplicate must not replace the local list.');
  assert(hookWrites.some(write => write.index === 2 && write.value), 'A duplicate must show a local error.');
}
let sameNumberAction;
const sameNumberForm = selectionNumberForm(['10', '2025', '1'], { editIndex: 0, initialRows: existingSelectionRows, autoSave: async action => { sameNumberAction = action; return true; } });
await selectionButton(sameNumberForm, '저장').props.onClick();
assert.equal(sameNumberAction.rows.length, existingSelectionRows.length, 'Editing a row without changing its own number is valid.');

const ReportPresenceToggle = loadModule('app/components/report-presence-toggle.tsx').default;
for (const value of [undefined, false, true]) {
  const changes = [];
  const toggle = ReportPresenceToggle({ value, onChange: next => changes.push(next) });
  assert.equal(toggle.props.role, 'group');
  assert.equal(toggle.props['aria-label'], '선행기술조사 보고서 유무');
  const options = descendants(toggle).filter(({ element }) => element.type === 'button').map(({ element }) => element);
  assert.deepEqual(Array.from(options, option => option.props.children), ['있음', '없음']);
  assert.equal(options[0].props['aria-pressed'], value === true);
  assert.equal(options[1].props['aria-pressed'], value === false);
  options[0].props.onClick(); options[1].props.onClick();
  assert.deepEqual(changes, [true, false]);
}
let blockedReportChanges = 0;
const blockedToggle = ReportPresenceToggle({ value: false, disabled: true, onChange: () => { blockedReportChanges++; } });
for (const { element } of descendants(blockedToggle).filter(({ element }) => element.type === 'button')) {
  assert.equal(element.props.disabled, true); element.props.onClick();
}
assert.equal(blockedReportChanges, 0);
const noReportReviewState = domain.createDemoState('2026-11');
noReportReviewState.cases[0].hasPriorArtReport = false;
hookIndex = 0; hookOverrides = [];
const noReportReview = summaryEditor({ state: noReportReviewState, month: noReportReviewState.months[0], item: noReportReviewState.cases[0], busy: false, dirty() {}, save: async () => true });
assert(!descendants(noReportReview).some(({ element }) => /^선행기술조사 (?:품질 순위|[123]위)/.test(element.props['aria-label'] || '')), 'A missing prior-art report must not appear in examiner ranking controls.');
assert(descendants(noReportReview).some(({ element }) => element.props['aria-label'] === 'ChatGPT 품질 순위'));
assert(descendants(noReportReview).some(({ element }) => element.props['aria-label'] === '클로드 품질 순위'));
for (const flag of [undefined, false, true]) {
  let reportAction;
  const reportForm = selectionForm({ editor: { index: null, numberParts: ['10', '2026', '51'], cpc: '', hasPriorArtReport: flag }, autoSave: async action => { reportAction = action; return true; } });
  assert.equal(reportToggle(reportForm).props.value, flag);
  hookWrites.length = 0;
  reportToggle(reportForm).props.onChange(flag !== true);
  assert.equal(writtenSelectionState(1, {}).hasPriorArtReport, flag !== true);
  await numberAdd(reportForm).props.onClick();
  assert.equal(reportAction.rows[0].hasPriorArtReport, flag, 'A completed row must preserve the chosen or legacy report value.');
}
let legacyReportAction;
const legacyEditor = { index: 2, numberParts: ['10', '2026', '52'], cpc: 'G06Q', hasPriorArtReport: undefined };
const legacyReportForm = selectionForm({ initialRows: existingSelectionRows, editor: legacyEditor, autoSave: async action => { legacyReportAction = action; return true; } });
await selectionButton(legacyReportForm, '저장').props.onClick();
assert.equal(legacyReportAction.rows[2].hasPriorArtReport, undefined, 'Saving other fields must not turn a legacy unknown report value into false.');

for (const blocked of [{ busy: true }, { autoSaveStatus: 'saving' }, { month: { ...domain.emptyMonth('2026-11'), stages: { selection: 'closed' } } }]) {
  const form = selectionNumberForm(['10', '2026', '7'], { initialRows: existingSelectionRows, ...blocked });
  assert(numberFields(form).every(field => field.props.disabled));
  assert.equal(reportToggle(form).props.disabled, true);
  assert.equal(numberAdd(form).props.disabled, true);
  assert.equal(selectionButton(form, '취소').props.disabled, true);
  const list = selectionForm({ initialRows: existingSelectionRows, ...blocked });
  for (const text of ['출원 추가', '수정', '삭제']) assert(selectionButtons(list, text).every(button => button.props.disabled));
}

// Restore focus to the newly mounted action after an inline row replaces its original DOM.
for (const source of ['add', 'edit']) {
  const session = selectionSession({ initialRows: existingSelectionRows, autoSave: async () => true });
  let form = session.render(); let oldButtonFocus = 0; let restoredFocus = 0; let editorFocus = 0;
  const trigger = source === 'add' ? selectionButton(form, '출원 추가') : selectionButtons(form, '수정')[0];
  const mountRef = (button, element) => typeof button.props.ref === 'function' ? button.props.ref(element) : button.props.ref.current = element;
  mountRef(trigger, { focus() { oldButtonFocus++; } });
  trigger.props.onClick();
  if (source === 'edit') mountRef(trigger, null);
  session.capture(); form = session.render();
  numberFields(form)[1].props.ref({ focus() { editorFocus++; } });
  session.runEffects();
  assert.equal(editorFocus, 1, 'Opening a row must focus its year field.');
  await selectionButton(form, source === 'add' ? '취소' : '저장').props.onClick();
  session.capture(); form = session.render();
  const restoredButton = source === 'add' ? selectionButton(form, '출원 추가') : selectionButtons(form, '수정')[0];
  mountRef(restoredButton, { focus() { restoredFocus++; } });
  session.runEffects();
  assert.equal(restoredFocus, 1, 'Closing an editor must focus the current action button.');
  assert.equal(oldButtonFocus, 0, 'Do not focus an action DOM node that was replaced by the editor.');
}

// A failed automatic save retains changed rows for manual retry and keeps navigation protected.
for (const operation of ['add', 'edit', 'delete']) {
  const dirtyValues = []; const manualActions = [];
  const session = selectionSession({
    initialRows: existingSelectionRows,
    editor: operation === 'delete' ? null : { index: operation === 'edit' ? 0 : null, numberParts: ['10', '2026', '7'], cpc: 'G06N', hasPriorArtReport: false },
    dirty: value => dirtyValues.push(value),
    autoSave: async () => false,
    save: async action => { manualActions.push(action); return true; },
  });
  let form = session.render();
  await (operation === 'delete' ? selectionButtons(form, '삭제')[0] : selectionButton(form, operation === 'edit' ? '저장' : '추가')).props.onClick();
  await Promise.resolve(); await Promise.resolve();
  session.capture(); form = session.render();
  const expectedCount = existingSelectionRows.length + (operation === 'add' ? 1 : operation === 'delete' ? -1 : 0);
  assert.equal(session.values[0].length, expectedCount);
  assert.equal(session.values[1], null);
  assert.equal(dirtyValues.at(-1), true);
  assert(descendants(form).some(({ element }) => element.props.role === 'alert'), 'Failed saves need a visible retry message.');
  selectionButton(form, '출원 추가').props.onClick({ currentTarget: null });
  session.capture(); form = session.render();
  selectionButton(form, '취소').props.onClick();
  session.capture(); form = session.render();
  assert.equal(dirtyValues.at(-1), true, 'Cancelling another editor must retain the unsaved failed-save protection.');
  await selectionButton(form, '임시저장').props.onClick();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(manualActions.length, 1);
  assert.equal(manualActions[0].rows, session.values[0], 'The retry must use the retained local list.');
}
let finishAutomaticSave; let automaticRequests = 0;
const pendingAutomaticForm = selectionNumberForm(['10', '2026', '7'], { autoSave: () => { automaticRequests++; return new Promise(resolve => { finishAutomaticSave = resolve; }); } });
hookWrites.length = 0;
const automaticRequest = numberAdd(pendingAutomaticForm).props.onClick();
const writesBeforeSecondAdd = hookWrites.length;
await numberAdd(pendingAutomaticForm).props.onClick();
selectionButton(pendingAutomaticForm, '임시저장').props.onClick();
selectionButton(pendingAutomaticForm, '선정 확정').props.onClick();
assert.equal(automaticRequests, 1);
assert.equal(hookWrites.length, writesBeforeSecondAdd, 'Block repeated row actions and parallel final saves while the first request is pending.');
finishAutomaticSave(false); await automaticRequest;
assert.equal(writtenSelectionState(0, []).at(-1).applicationNumber, '10-2026-0000007');
assert(hookWrites.some(write => write.index === 2 && String(write.value).includes('자동 저장하지 못했습니다.')));
hookWrites.length = 0;
await revisingReview.props.autoSave({ type: 'saveSelection', monthId: '2026-10', rows: submitted, confirm: true });
assert(!hookWrites.some(write => write.index === 1 && write.value === false), 'Automatic saves must keep the submitted-list editing screen open.');
await adminUI.exportAdminStatistics(demo, '2026-10', 'group-a', '', '전기국');
assert(exportedWorkbook.filename.includes('전기국'));
assert.deepEqual(Array.from(exportedWorkbook.sheets, sheet => sheet.name), ['그룹별 통계','계정별 현황','출원별 현황','조사 방식별 통계','AI 검색 결과 평가','조회 기준']);
assert.equal(exportedWorkbook.sheets.find(sheet => sheet.name === 'AI 검색 결과 평가').rows.length, 141);
assert.equal(exportedWorkbook.sheets.find(sheet => sheet.name === '출원별 현황').rows.length, 11);
assert.deepEqual(Array.from(exportedWorkbook.sheets.find(sheet => sheet.name === '계정별 현황').rows[0]), ['심사과', '이름', '소속 그룹', '담당 AI', '대상 건 선정', 'AI 입력 대상', 'AI 입력 완료', '평가 완료']);
assert.deepEqual(Array.from(exportedWorkbook.sheets.find(sheet => sheet.name === '계정별 현황').rows[1].slice(4)), [2, 10, 10, 2]);
assert.deepEqual(Array.from(exportedWorkbook.sheets.find(sheet => sheet.name === '계정별 현황').rows[1].slice(2, 4)), ['가상 1그룹', 'ChatGPT']);
// Admin month scope is shared by the overview, target list, filters, and exports.
assert.equal(adminUI.ADMIN_NAV.find(entry => entry.id === 'cases').label, '대상 출원 목록');
const multiMonthState = structuredClone(demo);
multiMonthState.months[0].id = '2026-11';
multiMonthState.cases.forEach(item => { item.monthId = '2026-11'; });
multiMonthState.months.push({ ...domain.emptyMonth('2026-12'), closed: true }, domain.emptyMonth('2027-01'), { ...domain.emptyMonth('2026-10'), archived: true, closed: true });
multiMonthState.cases.push(
  { ...multiMonthState.cases[0], id: 'december-case', monthId: '2026-12', applicationNumber: '10-2026-0012345', cpc: 'H04L' },
  { ...multiMonthState.cases[0], id: 'december-draft', monthId: '2026-12', status: 'draft', applicationNumber: '10-2026-0012346' },
  { ...multiMonthState.cases[0], id: 'archived-case', monthId: '2026-10', applicationNumber: '10-2026-0012347' },
);
function scopePage(section, scope = 'all', admin = true) {
  const key = ui.workspaceSessionKey(`simsadesk-workspace-${admin ? 'admin' : 'user'}`, '기획국');
  hookIndex = 0; hookOverrides = [];
  hookOverrides[0] = multiMonthState; hookOverrides[1] = key; hookOverrides[3] = admin ? '' : demo.users[0].id;
  hookOverrides[4] = scope; hookOverrides[5] = admin ? 'stats' : 'review'; hookOverrides[6] = section; hookOverrides[7] = false; hookOverrides[13] = key;
  return ui.default({ admin, bureau: '기획국' });
}
for (const section of ['overview', 'cases']) {
  const nodes = descendants(scopePage(section));
  const selector = nodes.find(({ element }) => element.props['aria-label'] === '운영월').element;
  assert.equal(selector.props.value, 'all');
  assert(descendants(selector).some(({ element }) => element.type === 'option' && element.props.value === 'all' && element.props.children === '전체 보기'));
  assert(!nodes.some(({ element }) => element.type?.name === 'Badge' && ['운영 전', '운영 중', '운영 종료'].includes(element.props.children)), 'All months must not be labelled with a single month status.');
  const content = nodes.find(({ element }) => element.type?.name === 'AdminWorkspace').element;
  assert.equal(content.props.allMonths, true); assert.equal(content.props.month, undefined);
  hookWrites.length = 0; selector.props.onChange({ target: { value: '2026-11' } });
  assert(hookWrites.some(write => write.index === 4 && write.value === '2026-11'));
  const monthNodes = descendants(scopePage(section, '2026-11'));
  assert.equal(monthNodes.find(({ element }) => element.type?.name === 'AdminWorkspace').element.props.month.id, '2026-11');
}
for (const section of ['examiners', 'ai', 'month', 'notices', 'prompts']) assert(!descendants(scopePage(section)).some(({ element }) => element.props['aria-label'] === '운영월'));
assert(!descendants(scopePage('overview', '2026-11', false)).some(({ element }) => element.type === 'option' && element.props.value === 'all'));
const allAdminProps = { ...managerProps, state: multiMonthState, month: undefined, allMonths: true, section: 'cases', initialStatus: 'all', selectMonth() {}, notify() {} };
function scopedManager(overrides = [], props = {}) { hookIndex = 0; hookOverrides = overrides; return adminUI.TestCaseManager({ ...allAdminProps, ...props }); }
const allTargets = scopedManager();
assert.equal(descendants(allTargets).filter(({ element }) => element.type === 'button' && element.props.className?.startsWith('adm-list-item')).length, 22);
assert.equal(adminUI.filterTargetCases(multiMonthState, 'all', { query: 'H04L' })[0].id, 'december-case');
assert.equal(adminUI.filterTargetCases(multiMonthState, 'all', { status: 'inputPending', examinerId: demo.users[0].id }).length, 1);
assert.equal(adminUI.filterTargetCases(multiMonthState, '2026-11').length, 20);
assert.equal(adminUI.filterTargetCases(multiMonthState, 'all', { status: 'draft' }).length, 1);
assert(JSON.stringify(allTargets).includes('2026년 12월'), 'Every all-month target keeps a visible month label.');
for (const [id, locked] of [['december-case', true], [multiMonthState.cases[0].id, false]]) {
  const selected = scopedManager(['', 'all', '', id]);
  const cancel = descendants(selected).find(({ element }) => element.type?.name === 'Button' && element.props.children === '선정 취소').element;
  assert.equal(cancel.props.disabled, locked, 'Cancellation uses the selected case’s actual month.');
}
function scopedOverview(overrides = [], props = {}) { hookIndex = 0; hookOverrides = overrides; return adminUI.TestOverview({ ...allAdminProps, ...props }); }
const allOverview = scopedOverview();
assert.equal(descendants(allOverview).find(({ element }) => element.type?.name === 'Metric' && element.props.label === '선정 출원').element.props.value, '21건');
assert.equal(descendants(allOverview).find(({ element }) => element.type?.name === 'Metric' && element.props.label === '참여 심사관').element.props.value, '10명');
assert.equal(descendants(allOverview).find(({ element }) => element.type?.name === 'Metric' && element.props.label === 'AI 입력 완료 / AI 입력 대상').element.props.value, '40건 / 42건');
assert(!descendants(allOverview).some(({ element }) => element.props.className === 'adm-followups' || element.props.className === 'adm-link-card'), 'Separate follow-up cards are consolidated into the overview metrics.');
assert(!descendants(allOverview).some(({ element }) => element.type?.name === 'Button' && ['월 운영 마감', '운영 재개방'].includes(element.props.children)));
assert(!descendants(allOverview).some(({ element }) => element.type === 'button' && element.props.children === '출원별 후속 업무'));
assert(!descendants(allOverview).some(({ element }) => element.props['aria-label'] === '후속 업무 상태'));
assert(descendants(allOverview).some(({ element }) => element.type === 'button' && element.props.children === '계정별 진행' && element.props['aria-pressed']));
const accountProgressTable = tree => descendants(tree).find(({ element }) => element.type === 'table' && element.props.children[0]?.props.children === '계정별 심사 및 AI 담당 업무 진행').element;
const accountProgress = accountProgressTable(allOverview);
assert.deepEqual(descendants(accountProgress).filter(({ element }) => element.type === 'th').map(({ element }) => element.props.children), ['심사과', '이름', '소속 그룹', '담당 AI', '대상 건 선정', 'AI 입력 대상', 'AI 입력 완료', '평가 완료']);
const firstAccount = descendants(accountProgress).find(({ element }) => element.type === 'tbody').element.props.children[0];
assert.deepEqual(Array.from(firstAccount.props.children.slice(4), cell => cell.props.children), [3, 11, 10, 2], 'Selection, AI target, AI completion, and evaluation counts stay in their labelled columns.');
assert(descendants(scopedOverview(['', '', 'documents'])).some(({ element }) => element.type === 'th' && element.props.children === '운영월'));
hookIndex = 0; hookOverrides = [];
const rootAll = adminUI.default({ ...allAdminProps, section: 'overview' });
assert(descendants(rootAll).some(({ element }) => element.type === adminUI.TestOverview), 'All-month pages render without inventing a writable month record.');
let registeredAction;
for (const [monthId, writable] of [['2026-11', true], ['2026-12', false]]) {
  registeredAction = undefined;
  hookIndex = 0; hookOverrides = [demo.users[0].id, '10-2026-0000007', '', '', false, monthId];
  const registration = adminUI.TestCaseRegistration({ ...allAdminProps, onClose() {}, save: async action => { registeredAction = action; return true; } });
  const monthSelect = descendants(registration).find(({ element }) => element.props['aria-label'] === '등록 운영월').element;
  assert.equal(descendants(monthSelect).find(({ element }) => element.type === 'option' && element.props.value === '2026-12').element.props.disabled, true);
  await descendants(registration).find(({ element }) => element.type === 'form').element.props.onSubmit({ preventDefault() {} });
  assert.equal(Boolean(registeredAction), writable);
  if (writable) assert.equal(registeredAction.monthId, '2026-11');
}
await adminUI.exportAdminStatistics(multiMonthState, 'all', 'group-a', demo.users[0].id, '기획국');
assert(exportedWorkbook.filename.includes('전체운영월'));
const allExportCases = exportedWorkbook.sheets.find(sheet => sheet.name === '출원별 현황').rows;
assert.equal(allExportCases[0][0], '운영월'); assert.equal(allExportCases.length, 4);
assert.deepEqual([...new Set(allExportCases.slice(1).map(row => row[0]))], ['2026-11', '2026-12']);
assert.equal(exportedWorkbook.sheets.find(sheet => sheet.name === 'AI 검색 결과 평가').rows[0][0], '운영월');
// Selected targets show saved results in the side panel without opening a patent window.
for (const id of [multiMonthState.cases[0].id, 'december-case']) {
  const selected = scopedManager(['', 'all', '', id]);
  const panel = descendants(selected).find(({ element }) => element.props.className === 'adm-editor').element;
  assert.equal(panel.key, id, 'Changing the selected case resets the side panel scroll position.');
  assert.equal(descendants(panel).find(({ element }) => element.type === adminUI.CaseEvaluationDetails).element.props.item.id, id);
  assert(!descendants(panel).some(({ element }) => element.type === 'a'), 'The case lookup new-window action is removed.');
}
const detailCase = structuredState.cases[0];
const deliveredMethods = domain.caseMethods(structuredState, detailCase).filter(method => method.kind === 'ai');
const detailState = domain.applyAction(structuredState, { userId: detailCase.examinerId }, {
  type: 'saveEvaluation', caseId: detailCase.id, finalize: true,
  versions: Object.fromEntries(deliveredMethods.map(method => [method.id, domain.resultFor(structuredState, detailCase.id, method.id).publishedVersion])),
  rankings: { chatgpt: 1, claude: 2, baseline: 3 },
  evaluations: deliveredMethods.map(method => {
    const result = domain.resultFor(structuredState, detailCase.id, method.id);
    return { methodId: method.id, version: result.publishedVersion, documents: result.publishedDocuments.map((number, index) => ({ number, score: index === 0 ? 0 : 4, cited: index === 0 ? 'X' : 'O', note: '' })) };
  }),
});
const renderDetails = state => adminUI.CaseEvaluationDetails({ state, item: state.cases.find(item => item.id === detailCase.id) });
const docTable = tree => descendants(tree).find(({ element }) => element.type === 'table' && element.props.className?.includes('adm-case-documents'))?.element;
const tableRows = table => descendants(table).find(({ element }) => element.type === 'tbody').element.props.children;
const detailTree = renderDetails(detailState), beforeDetailQuery = JSON.stringify(detailState);
assert.deepEqual(descendants(docTable(detailTree)).filter(({ element }) => element.type === 'th').map(({ element }) => element.props.children), ['AI 종류', '특허 여부', '인용문헌 명', '문헌 점수', '인용 여부']);
const savedRows = tableRows(docTable(detailTree));
assert.equal(savedRows.length, 9);
assert.deepEqual(Array.from(savedRows[0].props.children, cell => cell.props.children), ['ChatGPT', '특허', 'KR20100001234A', 0, 'X']);
assert.deepEqual(Array.from(savedRows[1].props.children, cell => cell.props.children), ['ChatGPT', '비특허', 'A structured reference', 4, 'O']);
assert(!JSON.stringify(detailTree).includes('심사관에게 보이면 안 되는 수정 초안'));
assert(!descendants(detailTree).some(({ element }) => ['input', 'textarea', 'select', 'button', 'a'].includes(element.type)), 'Evaluation details are read-only.');
const examinerSummary = summaryEditor({ ...structuredProps, state: detailState });
const examinerTable = descendants(examinerSummary).find(({ element }) => element.type === 'table').element;
assert.deepEqual(Array.from(savedRows, row => Array.from(row.props.children, cell => cell.props.children)), Array.from(tableRows(examinerTable), row => Array.from(row.props.children, (cell, index) => index === 2 ? cell.props.children.props.children : cell.props.children)), 'Administrator and examiner summaries show the same delivered documents and scores.');
const noInput = structuredClone(detailState);
noInput.results = noInput.results.filter(result => result.caseId !== detailCase.id);
assert.deepEqual(descendants(renderDetails(noInput)).filter(({ element }) => element.props.className === 'adm-case-empty').map(({ element }) => element.props.children), ['AI 검색 입력 전', 'AI 검색 입력 전']);
const noReview = structuredClone(detailState);
noReview.evaluations = noReview.evaluations.filter(entry => entry.caseId !== detailCase.id);
noReview.rankings = noReview.rankings.filter(entry => entry.caseId !== detailCase.id);
assert.deepEqual(descendants(renderDetails(noReview)).filter(({ element }) => element.props.className === 'adm-case-empty').map(({ element }) => element.props.children), ['AI 검색 평가 전', 'AI 검색 평가 전']);
const staleReview = structuredClone(detailState);
staleReview.results.find(result => result.caseId === detailCase.id && result.methodId === 'chatgpt').publishedVersion++;
const staleDetails = renderDetails(staleReview);
assert.deepEqual(Array.from(tableRows(docTable(staleDetails))[0].props.children.slice(3), cell => cell.props.children), ['—', '—'], 'Old-version scores must not be attributed to updated AI results.');
assert(!descendants(staleDetails).some(({ element }) => element.props.className === 'adm-table-wrap adm-case-rankings'));
assert(descendants(staleDetails).some(({ element }) => element.props.children === '재확인 필요'));
const partialReview = structuredClone(detailState);
partialReview.rankings.find(entry => entry.caseId === detailCase.id).finalized = false;
const partialDetails = renderDetails(partialReview);
assert(descendants(partialDetails).some(({ element }) => element.props.children === '평가 중'));
assert.equal(tableRows(docTable(partialDetails))[0].props.children[3].props.children, 0);
assert.equal(JSON.stringify(detailState), beforeDetailQuery, 'Viewing selected cases never changes saved evaluations.');
// Two assignees may deliver the same citation for one AI, with separate scores and comparison rows.
const parallelReviewer = detailState.users[2];
let parallelDetailsState = domain.applyAction(detailState, { admin: true }, {
  type: 'saveExaminer', user: { ...parallelReviewer, roles: [...parallelReviewer.roles, 'ai'] }, groupId: 'group-a', responsibilities: [{ groupId: 'group-a', methodId: 'claude' }],
});
const sharedClaudeCitation = domain.resultFor(parallelDetailsState, detailCase.id, 'claude').publishedDocuments[0];
parallelDetailsState = domain.applyAction(parallelDetailsState, { userId: parallelReviewer.id }, { type: 'saveResult', caseId: detailCase.id, methodId: 'claude', documents: [sharedClaudeCitation], publish: true });
const parallelMethods = domain.caseMethods(parallelDetailsState, detailCase).filter(method => method.kind === 'ai');
const parallelClaudeMethods = parallelMethods.filter(method => (method.baseMethodId || method.id) === 'claude');
assert.equal(parallelClaudeMethods.length, 2);
assert.equal(new Set(parallelClaudeMethods.map(method => method.id)).size, 2, 'Assignee results must have independent comparison identities.');
const allParallelMethods = domain.caseMethods(parallelDetailsState, detailCase);
parallelDetailsState = domain.applyAction(parallelDetailsState, { userId: detailCase.examinerId }, {
  type: 'saveEvaluation', caseId: detailCase.id, finalize: true,
  versions: Object.fromEntries(parallelMethods.map(method => [method.id, domain.resultFor(parallelDetailsState, detailCase.id, method.id).publishedVersion])),
  rankings: Object.fromEntries(allParallelMethods.map((method, index) => [method.id, index < 3 ? index + 1 : 'unranked'])),
  evaluations: parallelMethods.map(method => {
    const result = domain.resultFor(parallelDetailsState, detailCase.id, method.id);
    const previous = domain.validEvaluation(parallelDetailsState, detailCase.id, method.id);
    return { methodId: method.id, version: result.publishedVersion, documents: result.publishedDocuments.map(number => previous?.documents.find(document => document.number === number) || { number, score: 5, cited: 'O', note: '추가 담당자의 별도 평가' }) };
  }),
});
const parallelDetails = renderDetails(parallelDetailsState);
const parallelClaudeRows = tableRows(docTable(parallelDetails)).filter(row => row.props.children[0].props.children.startsWith('클로드'));
assert.equal(parallelClaudeRows.length, 8);
assert.equal(new Set(parallelClaudeRows.map(row => row.props.children[0].props.children)).size, 2, 'Administrator details must show both Claude assignee names.');
const duplicateCitationRows = parallelClaudeRows.filter(row => row.props.children[2].props.children === sharedClaudeCitation);
assert.equal(duplicateCitationRows.length, 2);
assert.deepEqual(Array.from(duplicateCitationRows, row => row.props.children[3].props.children).sort(), [0, 5], 'The same citation in separate deliveries must retain separate evaluation scores.');
assert.equal(new Set(duplicateCitationRows.map(row => row.key)).size, 2, 'Independent delivery rows must not share React keys.');
const parallelStats = domain.getStatistics(parallelDetailsState, detailCase.monthId);
assert.equal(adminUI.overviewMethodStatistics(parallelDetailsState, parallelStats).filter(method => method.id === 'claude').length, 1, 'Multiple assignees aggregate into one base AI statistics row.');
await ui.TestExportPersonal(parallelDetailsState, detailCase.monthId, [detailCase], '기획국');
const parallelLiteratureExport = exportedWorkbook.sheets.find(sheet => sheet.name === '선행기술 목록').rows.slice(1).filter(row => row[2] === sharedClaudeCitation);
assert.equal(parallelLiteratureExport.length, 2, 'The literature export must retain the same citation from both Claude deliveries.');
assert.equal(new Set(parallelLiteratureExport.map(row => row[3])).size, 2, 'The exported literature rows must retain both delivering assignees.');
const parallelRankingExport = exportedWorkbook.sheets.find(sheet => sheet.name === '품질 순위').rows.slice(1).filter(row => row[1].startsWith('클로드'));
assert.equal(parallelRankingExport.length, 2, 'Quality rankings must export one row per Claude assignee result.');
assert.deepEqual(Array.from(parallelRankingExport, row => row[1]).sort(), Array.from(parallelClaudeMethods, method => method.name).sort());
assert(parallelRankingExport.every(row => row[2] !== '—' && row[3] === '현재 결과'));
const parallelScoresExport = exportedWorkbook.sheets.find(sheet => sheet.name === '문헌별 평가').rows.slice(1).filter(row => row[2] === sharedClaudeCitation);
assert.equal(parallelScoresExport.length, 2);
assert.deepEqual(Array.from(parallelScoresExport, row => row[3]).sort(), [0, 5], 'Export must preserve each assignee result’s independent score for an identical citation.');
// Input totals count delivered/assigned AI bundles, independently of completed case comparisons.
const pendingInputs = structuredClone(multiMonthState);
pendingInputs.cases = pendingInputs.cases.slice(0, 2); pendingInputs.results = [];
const inputMetric = tree => descendants(tree).find(({ element }) => element.type?.name === 'Metric' && element.props.label === 'AI 입력 완료 / AI 입력 대상').element;
assert.equal(inputMetric(scopedOverview([], { state: pendingInputs })).props.value, '0건 / 4건');
pendingInputs.results.push(structuredClone(multiMonthState.results.find(result => result.caseId === pendingInputs.cases[0].id && result.methodId === 'chatgpt')));
assert.equal(domain.getStatistics(pendingInputs, 'all').summary.inputComplete, 0);
assert.equal(inputMetric(scopedOverview([], { state: pendingInputs })).props.value, '1건 / 4건', 'One delivered AI bundle counts even while other AI results on the case are pending.');
assert.equal(inputMetric(scopedOverview(['group-a', demo.users[0].id], { state: multiMonthState })).props.value, '4건 / 6건');
// Active AI and genuine publication history are visible across months; private drafts do not qualify.
const methodHistory = structuredClone(multiMonthState);
methodHistory.methods.find(method => method.id === 'claude').active = false;
methodHistory.methods.push(
  { id: 'new-active', name: '활성 새 AI', kind: 'ai', active: true },
  { id: 'past-ai', name: '지난 AI', kind: 'ai', active: false, deletedAt: '2026-10-31' },
  { id: 'empty-ai', name: '빈 공개 AI', kind: 'ai', active: false },
  { id: 'removed-unused', name: '삭제된 미사용 AI', kind: 'ai', active: true, deletedAt: '2026-10-31' },
);
const historySeed = methodHistory.results[0];
methodHistory.results.push(
  { ...historySeed, id: 'historical-publication', caseId: 'archived-case', methodId: 'past-ai' },
  { ...historySeed, id: 'private-draft', methodId: 'gemini', publishedVersion: 0, publishedDocuments: [], draftDocuments: ['비공개 초안'] },
  { ...historySeed, id: 'empty-publication', methodId: 'empty-ai', publishedDocuments: [] },
);
const historyBefore = JSON.stringify(methodHistory), scopedStats = domain.getStatistics(methodHistory, '2026-11');
assert(!scopedStats.methods.some(method => method.id === 'past-ai'));
const visibleMethods = adminUI.overviewMethodStatistics(methodHistory, scopedStats);
assert.deepEqual(Array.from(visibleMethods, method => method.name), ['ChatGPT', '클로드', '활성 새 AI', '지난 AI']);
assert.equal(visibleMethods.find(method => method.id === 'past-ai').documents, 0, 'Previously researched AI remain visible with zero results in the selected month.');
assert.equal(visibleMethods.find(method => method.id === 'past-ai').averageScore, null);
assert.equal(visibleMethods.find(method => method.id === 'claude').documents, 140);
const historyOverview = scopedOverview([], { state: methodHistory, allMonths: false, month: methodHistory.months[0] });
const qualityTable = descendants(historyOverview).find(({ element }) => element.type === 'table' && element.props.children[0]?.props.children === '조사 방식별 유효 평가 통계').element;
assert.deepEqual(Array.from(tableRows(qualityTable), row => row.props.children[0].props.children), ['ChatGPT', '클로드', '활성 새 AI', '지난 AI']);
await adminUI.exportAdminStatistics(methodHistory, '2026-11', '', '', '기획국');
assert.deepEqual(Array.from(exportedWorkbook.sheets.find(sheet => sheet.name === '조사 방식별 통계').rows.slice(1), row => row[0]), ['ChatGPT', '클로드', '활성 새 AI', '지난 AI']);
assert.equal(JSON.stringify(methodHistory), historyBefore);
// Account context uses current personnel, not historical case snapshots or repeated group assignments.
assert.deepEqual(JSON.parse(JSON.stringify(adminUI.accountAssignmentLabels(multiMonthState, demo.users[0].id))), { groupName: '가상 1그룹', aiNames: 'ChatGPT' });
assert.deepEqual(Array.from(firstAccount.props.children.slice(2, 4), cell => cell.props.children), ['가상 1그룹', 'ChatGPT']);
const assignedAccount = structuredClone(multiMonthState);
assignedAccount.personnel.assignments.push({ userId: demo.users[0].id, groupId: 'group-b', methodId: 'chatgpt' }, { userId: demo.users[0].id, groupId: 'group-a', methodId: 'claude' });
assignedAccount.personnel.memberships.find(entry => entry.userId === demo.users[0].id).groupId = 'group-b';
const accountBefore = JSON.stringify(assignedAccount);
assert.deepEqual(JSON.parse(JSON.stringify(adminUI.accountAssignmentLabels(assignedAccount, demo.users[0].id))), { groupName: '가상 2그룹', aiNames: 'ChatGPT, 클로드' });
assert.equal(JSON.stringify(assignedAccount), accountBefore, 'Reading account assignments must not change personnel or historical cases.');
assert.equal(assignedAccount.cases[0].groupName, '가상 1그룹');
assert.equal(adminUI.accountAssignmentLabels(assignedAccount, demo.users[2].id).aiNames, '—');
assignedAccount.personnel.memberships = assignedAccount.personnel.memberships.filter(entry => entry.userId !== demo.users[2].id);
assert.equal(adminUI.accountAssignmentLabels(assignedAccount, demo.users[2].id).groupName, '그룹 미배정');
hookIndex = 0; hookOverrides = [];
const customPromptTasks = ui.TestAIWorkspace({ state: { ...archiveState, standardSearchPrompt: { text: '심사국 전용 검색 프롬프트', updatedAt: '2026-10-31T00:00:00Z' } }, month: archiveState.months[0], user: archiveUser, bureau: '기획국', busy: false, dirty() {}, save: async () => true, notify() {} });
assert.equal(descendants(customPromptTasks).find(({ element }) => element.type === StandardPromptButtonStub).element.props.prompt, '심사국 전용 검색 프롬프트');
console.log('Admin and bureau workspace UI tests passed: seven task menus, scoped prompt management, AI prompt delivery, sessions and forms, filters, publication handoff, downloads, closed-month controls, and six-sheet exports.');
