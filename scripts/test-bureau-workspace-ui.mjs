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
    if (id.endsWith('/pdf-download')) return PdfStub;
    if (id.endsWith('/target-publication-download')) return TargetStub;
    if (id.endsWith('/target-publication-archive')) return TargetArchiveStub;
    if (id.endsWith('/accessible-dialog')) return loadModule('app/components/accessible-dialog.tsx');
    if (id === './examiner-manager') return loadModule('app/evaluation/examiner-manager.tsx');
    if (id === './admin-workspace') return loadModule('app/evaluation/admin-workspace.tsx');
    if (id === './notice-manager') return NoticeManagerStub;
    if (id === './literature-editor') return loadModule('app/evaluation/literature-editor.tsx');
    if (id.endsWith('/bureau-notice')) return loadModule('app/components/bureau-notice.tsx');
    if (id === '@/app/components/operation-schedule') return loadModule('app/components/operation-schedule.tsx');
    if (id === '@/app/lib/operation-schedule') return loadModule('app/lib/operation-schedule.ts');
    if (id === '@/app/components/literature-link') return loadModule('app/components/literature-link.tsx');
    if (id === '@/app/components/literature-details') return loadModule('app/components/literature-details.tsx');
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
const ui = loadModule('app/evaluation/workspace.tsx', '\nexport { CaseResource as TestCaseResource, EvaluationEditor as TestEvaluationEditor, AIResultEditor as TestAIResultEditor, AIWorkspace as TestAIWorkspace, SelectionEditor as TestSelectionEditor, StageNotice as TestStageNotice, ReviewWorkspace as TestReviewWorkspace, exportPersonal as TestExportPersonal };');
const adminUI = loadModule('app/evaluation/admin-workspace.tsx', '\nexport { AccountManager as TestAccountManager, MethodManager as TestMethodManager };');
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
assert(!JSON.stringify(noticeAdmin).includes('가상 자료로 업무 흐름 확인'), 'Demo loading should not interrupt notice editing.');
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
const fakeItem = { ...item, applicationNumber: '10-2024-9000000' };
const demoCard = ui.AITaskCard({ item: fakeItem, methodName: 'AI', selected: false, complete: true, demo: true, onSelect: () => selections++ });
const demoPdf = descendants(demoCard).find(({ element }) => element.type === TargetStub);
assert.equal(demoPdf.element.props.disabled, true);
TargetStub(demoPdf.element.props).props.onClick();
assert.equal(downloads, 1, 'A fictional case must not request a real PDF.');
const realSampleCard = ui.AITaskCard({ item, methodName: 'AI', selected: false, complete: false, demo: true, onSelect: () => selections++ });
const realSampleNodes = descendants(realSampleCard);
const realSamplePdf = realSampleNodes.find(({ element }) => element.type === TargetStub).element;
assert.equal(realSamplePdf.props.disabled, false, 'A real application in a sample workspace must allow PDF downloads.');
assert(!JSON.stringify(realSampleCard).includes('가상 출원번호는 PDF'), 'Real samples must not display the fictional-number warning.');
TargetStub(realSamplePdf.props).props.onClick();
assert.equal(downloads, 2);
assert.equal(selections, 1, 'A sample PDF download must not change task selection.');
for (const ai of [false, true]) {
  for (const [applicationNumber, disabled] of [[item.applicationNumber, false], ['10-2024-9000019', true], ['1020249000000', true]]) {
    const resource = ui.TestCaseResource({ item: { ...item, applicationNumber }, demo: true, ai });
    const controls = descendants(resource).filter(({ element }) => element.type === PdfStub || element.type === TargetStub);
    assert(controls.length > 0);
    assert(controls.every(({ element }) => element.props.disabled === disabled), 'Detail downloads must distinguish real samples and generated numbers.');
    assert.equal(JSON.stringify(resource).includes('가상 출원번호 · PDF 다운로드 불가'), disabled);
  }
}
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

// Bulk targets come from all assigned work, even when the visible list only shows pending work.
const archiveState = domain.createDemoState('2026-10'); archiveState.isDemo = false;
const archiveUser = archiveState.users.find(user => user.id === 'demo-user-1');
const ownAssignments = archiveState.personnel.assignments.filter(entry => entry.userId === archiveUser.id && archiveState.months[0].methodIds.includes(entry.methodId));
const expectedTargets = archiveState.cases.filter(entry => entry.status === 'confirmed' && entry.monthId === '2026-10').flatMap(entry => ownAssignments.filter(assignment => assignment.groupId === entry.groupId).map(() => entry.applicationNumber));
for (const filter of ['', 'pending']) {
  hookIndex = 0; hookOverrides = ['', false, filter];
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

// AI tasks open their own dialog; completed pending tasks must not switch to another case mid-save.
const taskKey = `${archiveState.cases[0].id}:chatgpt`;
function renderAITaskDialog({ selectedKey = '', unsaved = false, failed = false, filter = '', ...props } = {}) {
  hookIndex = 0;
  hookOverrides = [selectedKey, unsaved, { key: ui.workspaceSessionKey(`simsadesk-ai-filter:${archiveUser.id}:2026-10`, '기획국'), value: filter }, failed];
  return ui.TestAIWorkspace({ state: archiveState, month: archiveState.months[0], user: archiveUser, bureau: '기획국', busy: false, dirty() {}, save: async () => true, notify() {}, ...props });
}
const dialogNode = tree => descendants(tree).find(({ element }) => element.props.labelledBy === 'ev-ai-result-dialog-title')?.element;
const dialogEditor = tree => descendants(dialogNode(tree)).find(({ element }) => element.props.item && element.props.methodId && element.props.save).element;
const taskList = renderAITaskDialog();
assert.equal(dialogNode(taskList), undefined, 'The list must not open an editor automatically.');
const firstTask = descendants(taskList).find(({ element }) => element.type === ui.AITaskCard).element;
firstTask.props.onSelect();
assert(hookWrites.some(write => write.index === 0 && write.value === taskKey), 'Choosing a row must open that task.');
const modalTree = renderAITaskDialog({ selectedKey: taskKey, filter: 'pending' });
assert(dialogNode(modalTree));
assert.equal(dialogEditor(modalTree).props.item.id, archiveState.cases[0].id, 'Filtering a published task must not substitute another case in its open editor.');
assert.equal(dialogEditor(modalTree).props.methodId, 'chatgpt');
allowDiscard = false;
const dirtyModal = renderAITaskDialog({ selectedKey: taskKey, unsaved: true });
const writesBeforeClose = hookWrites.length;
dialogNode(dirtyModal).props.onClose();
assert.equal(hookWrites.length, writesBeforeClose, 'Declining discard must preserve the open form.');
allowDiscard = true;
dialogNode(dirtyModal).props.onClose();
assert(hookWrites.slice(writesBeforeClose).some(write => write.index === 0 && write.value === ''));
let finishModalSave;
const pendingModal = renderAITaskDialog({ selectedKey: taskKey, unsaved: true, save: () => new Promise(resolve => { finishModalSave = resolve; }) });
const pendingSave = dialogEditor(pendingModal).props.save({ type: 'saveResult', caseId: archiveState.cases[0].id, methodId: 'chatgpt', documents: ['Modal literature'], publish: true });
const writesBeforeBusyClose = hookWrites.length;
dialogNode(pendingModal).props.onClose();
assert.equal(hookWrites.length, writesBeforeBusyClose, 'Closing must be blocked immediately while a save is in flight.');
finishModalSave(false); assert.equal(await pendingSave, false);
assert(!hookWrites.slice(writesBeforeBusyClose).some(write => write.index === 0 && write.value === ''), 'Failed saves must leave the form open.');
const successfulModal = renderAITaskDialog({ selectedKey: taskKey, unsaved: true });
const writesBeforeSuccess = hookWrites.length;
assert.equal(await dialogEditor(successfulModal).props.save({ type: 'saveResult', caseId: archiveState.cases[0].id, methodId: 'chatgpt', documents: ['Modal literature'], publish: false }), true);
assert(hookWrites.slice(writesBeforeSuccess).some(write => write.index === 0 && write.value === ''), 'Successful saves must return to the task list.');
assert(JSON.stringify(renderAITaskDialog({ selectedKey: taskKey, failed: true, saveFeedback: '검증용 저장 오류' })).includes('검증용 저장 오류'), 'Errors must also appear inside the dialog.');

assert.deepEqual(Array.from(adminUI.ADMIN_NAV, entry => entry.id), ['overview', 'examiners', 'ai', 'month', 'cases', 'notices']);
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
assert(JSON.stringify(atomicEditor).includes('담당자 변경'));
await descendants(atomicEditor).find(({element})=>element.type==='form').element.props.onSubmit({preventDefault(){}});
assert.equal(examinerAction.type,'saveExaminer');
const atomicSaved=domain.applyAction(demo,{admin:true},examinerAction);
assert.equal(atomicSaved.users.find(user=>user.id===demo.users[1].id).division,'통합 심사과');
assert.equal(atomicSaved.personnel.memberships.find(entry=>entry.userId===demo.users[1].id).groupId,'group-b');
assert.equal(atomicSaved.personnel.assignments.find(entry=>entry.groupId==='group-a'&&entry.methodId==='chatgpt').userId,demo.users[1].id);
assert.equal(JSON.stringify(atomicSaved.months),JSON.stringify(demo.months));
assert.equal(atomicSaved.cases[0].groupId,'group-a');
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
const mixedProps = { state: mixedState, item: mixedState.cases[0], month: mixedState.months[0], methodId: 'chatgpt', busy: false, dirty() {}, save: async () => true };
hookIndex = 0; hookOverrides = [];
const evaluationTree = ui.TestEvaluationEditor(mixedProps);
const evaluationLinks = descendants(evaluationTree).filter(({ element }) => element.type?.name === 'LiteratureLink');
const evaluationPanels = descendants(evaluationTree).filter(({ element }) => ['AI 문헌별 평가', '조사 방식별 품질 순위', '총평'].includes(element.props.title));
assert.deepEqual(Array.from(evaluationPanels, ({ element }) => element.props.title), ['AI 문헌별 평가', '조사 방식별 품질 순위', '총평']);
const commentField = tree => descendants(tree).find(({ element }) => element.type === 'textarea' && element.props.id?.startsWith('overall-comment-')).element;
assert.equal(commentField(evaluationTree).props.value, '', 'Legacy records must start with an empty optional comment.');
assert.equal(commentField(evaluationTree).props.required, undefined);
const deliveredOnlyState = structuredClone(mixedState);
deliveredOnlyState.months[0].methodIds = [];
deliveredOnlyState.results = deliveredOnlyState.results.filter(result => result.caseId !== mixedProps.item.id || result.methodId !== 'claude');
hookIndex = 0; hookOverrides = [];
const deliveredOnlyTree = ui.TestEvaluationEditor({ ...mixedProps, state: deliveredOnlyState });
const comparisonLabels = descendants(deliveredOnlyTree).filter(({ element }) => element.type === 'select' && /품질 순위$/.test(element.props['aria-label'] || '')).map(({ element }) => element.props['aria-label']);
assert.deepEqual(comparisonLabels, ['ChatGPT 품질 순위', '선행기술조사 품질 순위'], 'Only delivered AI results and the report belong in the comparison form.');
assert.equal(commentField(evaluationTree).props.maxLength, domain.OVERALL_COMMENT_MAX_LENGTH);
const restoredCommentState = structuredClone(mixedState);
restoredCommentState.rankings.find(entry => entry.caseId === mixedProps.item.id).overallComment = '이전에 저장한 총평\n검색 결과 검토';
const commentDirty = [];
hookIndex = 0; hookOverrides = [];
const restoredCommentTree = ui.TestEvaluationEditor({ ...mixedProps, state: restoredCommentState, dirty: value => commentDirty.push(value) });
assert.equal(commentField(restoredCommentTree).props.value, '이전에 저장한 총평\n검색 결과 검토', 'Restore comments even when AI result versions changed.');
commentField(restoredCommentTree).props.onChange({ target: { value: '수정한 총평' } });
assert.equal(commentDirty.at(-1), true, 'Comment changes must trigger the existing unsaved-input protection.');
let savedCommentAction;
hookIndex = 0; hookOverrides = []; hookOverrides[2] = '작성 중인 총평'; hookWrites.length = 0;
const commentSaveTree = ui.TestEvaluationEditor({ ...mixedProps, save: async action => { savedCommentAction = action; return false; } });
descendants(commentSaveTree).find(({ element }) => element.type === 'button' && element.props.children === '평가 저장').element.props.onClick();
assert.equal(savedCommentAction.overallComment, '작성 중인 총평');
assert.equal(savedCommentAction.type, 'saveEvaluation');
assert(!hookWrites.some(write => write.index === 2), 'A failed save must not reset the comment input.');
for (const blocked of [{ busy: true }, { month: { ...mixedProps.month, closed: true } }]) {
  hookIndex = 0; hookOverrides = [];
  assert.equal(commentField(ui.TestEvaluationEditor({ ...mixedProps, ...blocked })).props.disabled, true);
}
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
const structuredDocuments = domain.normalizeLiteratureDocuments([
  { kind: 'patent', number: 'KR20100001234A', url: 'https://example.test/published-patent', reportMarkdown: '## 공개 특허 보고서\n\n구성 대비 내용.' },
  { kind: 'non-patent', authors: 'Lee, S.', title: 'A structured reference', publication: 'Research Journal', publicationPlace: 'Seoul', publisher: 'Research Press', publicationDate: '2020-06', volume: 'Vol. 1', issue: 'No. 3', pages: 'pp. 12–16', acquiredDate: '2026-10-30', dateNote: '발행일 미상', url: 'https://example.test/published-paper', reportMarkdown: '## 공개 논문 보고서\n\n관련 구성과 근거.' },
]);
let structuredState = domain.applyAction(demo, { userId: 'demo-user-1' }, { type: 'saveResult', caseId: demo.cases[0].id, methodId: 'chatgpt', documents: structuredDocuments.map(document => document.number), documentDetails: structuredDocuments, publish: true });
const privateDraftDocuments = structuredDocuments.map(document => ({ ...document, url: 'https://example.test/private-draft', reportMarkdown: '심사관에게 보이면 안 되는 수정 초안' }));
structuredState = domain.applyAction(structuredState, { userId: 'demo-user-1' }, { type: 'saveResult', caseId: demo.cases[0].id, methodId: 'chatgpt', documents: privateDraftDocuments.map(document => document.number), documentDetails: privateDraftDocuments, publish: false });
const structuredProps = { ...mixedProps, state: structuredState };
hookIndex = 0; hookOverrides = [];
const structuredEvaluation = ui.TestEvaluationEditor(structuredProps);
const structuredEvaluationNodes = descendants(structuredEvaluation);
for (const document of structuredDocuments) {
  const link = structuredEvaluationNodes.find(({ element }) => element.type?.name === 'LiteratureLink' && element.props.reference === document.number).element;
  assert.equal(link.props.url, document.url, 'Examiner links must use the published source URL.');
  assert.equal(link.type(link.props).props.href, document.url);
  const detail = structuredEvaluationNodes.find(({ element }) => element.type?.name === 'LiteratureDetails' && element.props.document.number === document.number).element;
  assert.deepEqual(JSON.parse(JSON.stringify(detail.props.document)), JSON.parse(JSON.stringify(document)), 'Examiner details must receive the published bibliography and report.');
  const expandedDetails = descendants(detail.type(detail.props));
  assert.equal(expandedDetails.find(({ element }) => element.type === NoticeMarkdownStub).element.props.markdown, document.reportMarkdown);
}
assert(!JSON.stringify(structuredEvaluation).includes('심사관에게 보이면 안 되는 수정 초안'));
let savedStructuredAction;
hookIndex = 0; hookOverrides = [];
const structuredAI = ui.TestAIResultEditor({ ...structuredProps, save: async action => { savedStructuredAction = action; return true; } });
const structuredAINodes = descendants(structuredAI);
const structuredInputEditor = structuredAINodes.find(({ element }) => element.type?.name === 'LiteratureEditor').element;
assert.deepEqual(JSON.parse(JSON.stringify(structuredInputEditor.props.initialDocuments)), JSON.parse(JSON.stringify(privateDraftDocuments)), 'AI editors must restore the private draft separately from publication.');
for (const document of structuredDocuments) {
  const detail = structuredAINodes.find(({ element }) => element.type?.name === 'LiteratureDetails' && element.props.document.number === document.number).element;
  assert.deepEqual(JSON.parse(JSON.stringify(detail.props.document)), JSON.parse(JSON.stringify(document)), 'The AI publication preview must keep showing the published report.');
}
await structuredInputEditor.props.onSave(privateDraftDocuments, false);
assert.equal(savedStructuredAction.type, 'saveResult');
assert.equal(savedStructuredAction.publish, false);
assert.deepEqual(savedStructuredAction.documentDetails, privateDraftDocuments);
assert.equal(JSON.stringify(savedStructuredAction.documents), JSON.stringify(privateDraftDocuments.map(document => document.number)));
await structuredInputEditor.props.onSave(privateDraftDocuments, true);
assert.equal(savedStructuredAction.publish, true);
await ui.TestExportPersonal(structuredState, structuredProps.month.id, [structuredProps.item], '기획국');
const exportedLiterature = exportedWorkbook.sheets.find(sheet => sheet.name === '선행기술 목록');
const literatureHeader = exportedLiterature.rows[0];
for (const document of structuredDocuments) {
  const row = exportedLiterature.rows.find(entry => entry[literatureHeader.indexOf('문헌번호·서지정보')] === document.number);
  assert(row);
  assert.equal(row[literatureHeader.indexOf('URL')], document.url, 'Exports must use published source URLs.');
  assert.equal(row[literatureHeader.indexOf('보고서 (마크다운)')], document.reportMarkdown);
  if (document.kind === 'non-patent') {
    assert.equal(row[literatureHeader.indexOf('논문명·문서명')], document.title);
    assert.equal(row[literatureHeader.indexOf('발행장소')], document.publicationPlace);
    assert.equal(row[literatureHeader.indexOf('페이지')], document.pages);
  }
}
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
    ['result', () => ui.TestAIResultEditor({ state: demo, month: controlledMonth, item: demo.cases[0], methodId: 'chatgpt', busy: false, dirty() {}, save: async () => true })],
    ['evaluation', () => ui.TestEvaluationEditor({ state: demo, month: controlledMonth, item: demo.cases[0], busy: false, dirty() {}, save: async () => true })],
  ]) {
    hookIndex = 0; hookOverrides = [];
    const editor = render();
    const nestedEditor = descendants(editor).find(({ element }) => element.type?.name === 'LiteratureEditor');
    const inputTree = nestedEditor ? nestedEditor.element.type(nestedEditor.element.props) : editor;
    const inputs = descendants(inputTree).filter(({ element }) => ['input', 'select', 'textarea', 'button'].includes(element.type)
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
  hookIndex = 0; hookOverrides = [selectedId, unsaved, false, failed];
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
  hookWrites.length = 0;
  rows.at(-1).element.props.onClick();
  assert(hookWrites.some(write => write.index === 0 && write.value === submitted.at(-1).id));
  const selectedTree = renderReview(month, { selectedId: submitted.at(-1).id });
  const selectedEditor = descendants(selectedTree).find(({ element }) => element.type === ui.TestEvaluationEditor).element;
  assert.equal(selectedEditor.props.item, submitted.at(-1), 'Open the chosen case without substituting the first case.');
}
const reviewDialog = tree => descendants(tree).find(({ element }) => element.props.labelledBy === 'ev-evaluation-dialog-title')?.element;
const reviewEditor = tree => descendants(reviewDialog(tree)).find(({ element }) => element.type === ui.TestEvaluationEditor).element;
const activeReviewMonth = { ...reviewState.months[0], stages: { evaluation: 'running' } };
assert.equal(reviewDialog(renderReview(activeReviewMonth, { selectedId: 'other-month-case' })), undefined);
const dirtyReview = renderReview(activeReviewMonth, { selectedId: submitted[0].id, unsaved: true });
allowDiscard = false;
hookWrites.length = 0;
reviewDialog(dirtyReview).props.onClose();
assert.equal(hookWrites.length, 0, 'Declining discard preserves the evaluation form and dirty state.');
allowDiscard = true;
reviewDialog(dirtyReview).props.onClose();
assert(hookWrites.some(write => write.index === 0 && write.value === ''));
assert(reviewDialog(dirtyReview).props.fallbackFocusRef, 'Return keyboard focus to the list if its trigger disappears.');
let finishReviewSave; let reviewSaveRequests = 0;
const savingReview = renderReview(activeReviewMonth, { selectedId: submitted[0].id, unsaved: true, save: () => { reviewSaveRequests++; return new Promise(resolve => { finishReviewSave = resolve; }); } });
const evaluationAction = { type: 'saveEvaluation', caseId: submitted[0].id, evaluations: [], rankings: {}, versions: {} };
const savingReviewRequest = reviewEditor(savingReview).props.save(evaluationAction);
hookWrites.length = 0;
reviewDialog(savingReview).props.onClose();
assert.equal(hookWrites.length, 0, 'Block closing the evaluation immediately while its save is pending.');
assert.equal(await reviewEditor(savingReview).props.save(evaluationAction), false);
assert.equal(reviewSaveRequests, 1, 'Avoid duplicate evaluation requests while saving.');
finishReviewSave(false); assert.equal(await savingReviewRequest, false);
assert(!hookWrites.some(write => write.index === 0 && write.value === ''), 'A failed save must preserve the selected case and its form.');
assert(hookWrites.some(write => write.index === 3 && write.value === true));
assert(JSON.stringify(renderReview(activeReviewMonth, { selectedId: submitted[0].id, failed: true, saveFeedback: '평가 저장 오류' })).includes('평가 저장 오류'), 'Show actionable errors inside the evaluation dialog.');
const savedReview = renderReview(activeReviewMonth, { selectedId: submitted[0].id, unsaved: true });
hookWrites.length = 0;
assert.equal(await reviewEditor(savedReview).props.save(evaluationAction), true);
assert(hookWrites.some(write => write.index === 0 && write.value === ''), 'A successful save returns to the evaluation list.');
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
assert(hookWrites.some(write => write.index === 2 && write.value === true));
for (const status of ['stopped', 'closed']) {
  const lockedReview = renderReview({ ...editableSubmittedMonth, stages: { selection: status, evaluation: 'stopped' } });
  assert(!descendants(lockedReview.props.action).some(({ element }) => element.props.children === '제출 목록 수정'));
}
hookIndex = 0; hookOverrides = ['', false, true];
const revisingReview = ui.TestReviewWorkspace({ state: reviewState, month: editableSubmittedMonth, user: reviewUser, busy: false, dirty() {}, save: async () => true, notify() {} });
assert.equal(revisingReview.type, ui.TestSelectionEditor);
let revisedAction;
hookIndex = 0; hookOverrides = [];
const revisedForm = ui.TestSelectionEditor({ ...revisingReview.props, save: async action => { revisedAction = action; return true; } });
assert.equal(revisedForm.props.title, '제출한 출원 목록 수정');
assert.equal(descendants(revisedForm).filter(({ element }) => /^출원번호 \d+$/.test(element.props['aria-label'] || '')).length, submitted.length);
assert(!descendants(revisedForm).some(({ element }) => element.props.children === '임시저장'), 'Submitted edits must not silently turn published tasks into drafts.');
descendants(revisedForm).find(({ element }) => element.props.children === '수정 사항 저장').element.props.onClick();
assert.equal(revisedAction.confirm, true);
assert.equal(revisedAction.rows.length, submitted.length);
hookIndex = 0; hookOverrides = [[]];
const withdrawnForm = ui.TestSelectionEditor({ ...revisingReview.props, save: async () => true });
assert.equal(descendants(withdrawnForm).find(({ element }) => element.props.children === '수정 사항 저장').element.props.disabled, false);

// Segmented application numbers advance at 2/4 digits and pad serials on addition.
function selectionNumberForm(parts, props = {}) {
  hookIndex = 0; hookOverrides = [[], parts, ' G06N 20/00 '];
  if (parts === undefined) delete hookOverrides[1];
  return ui.TestSelectionEditor({ state: domain.createInitialState('2026-11'), month: { ...domain.emptyMonth('2026-11'), stages: { selection: 'running' } }, user: reviewUser, busy: false, dirty() {}, save: async () => true, ...props });
}
const numberFields = tree => descendants(tree).filter(({ element }) => element.props.maxLength && element.props.inputMode === 'numeric').map(({ element }) => element);
const numberAdd = tree => descendants(tree).find(({ element }) => element.props.children === '선정 목록에 추가').element;
const blankNumber = selectionNumberForm();
const blankParts = numberFields(blankNumber);
assert.deepEqual(blankParts.map(field => field.props.maxLength), [2, 4, 7]);
assert.equal(blankParts[0].props.value, '10', 'The application type defaults to patent 10.');
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
assert.equal(hookWrites.find(write => write.index === 1).value(['', '', ''])[2], '1234567', 'Keep digits only and limit the serial to seven digits.');
for (const [serial, expected] of [['1', '0000001'], ['0', '0000000'], ['123', '0000123'], ['000123', '0000123'], ['1234567', '1234567']]) {
  const form = selectionNumberForm(['10', '2026', serial]);
  hookWrites.length = 0;
  numberAdd(form).props.onClick();
  const added = hookWrites.find(write => write.index === 0).value([]);
  assert.equal(added[0].applicationNumber, '10-2026-' + expected);
  assert.equal(added[0].cpc, 'G06N 20/00');
  assert(hookWrites.some(write => write.index === 1 && JSON.stringify(write.value) === '["10","",""]'));
}
for (const parts of [['1', '2026', '1'], ['10', '202', '1'], ['10', '2026', '']]) assert.equal(numberAdd(selectionNumberForm(parts)).props.disabled, true);
const invalidPrefix = selectionNumberForm(['30', '2026', '1']);
hookWrites.length = 0;
numberAdd(invalidPrefix).props.onClick();
assert(!hookWrites.some(write => write.index === 0), 'Do not append unsupported application types.');
for (const text of ['10-2026-123', '1020260000123']) {
  const form = selectionNumberForm(); let prevented = false;
  hookWrites.length = 0;
  numberFields(form)[0].props.onPaste({ clipboardData: { getData: () => text }, preventDefault() { prevented = true; } });
  assert(prevented);
  assert.equal(JSON.stringify(hookWrites.find(write => write.index === 1).value), text.includes('-') ? '["10","2026","123"]' : '["10","2026","0000123"]');
}
let selectionSaves = 0;
const unfinishedNumber = selectionNumberForm(['10', '202', ''], { save: async () => { selectionSaves++; return true; } });
descendants(unfinishedNumber).find(({ element }) => element.props.children === '임시저장').element.props.onClick();
assert.equal(selectionSaves, 0, 'Do not silently omit a partially entered number when saving the list.');
const untouchedNumber = selectionNumberForm(undefined, { save: async () => { selectionSaves++; return true; } });
await descendants(untouchedNumber).find(({ element }) => element.props.children === '임시저장').element.props.onClick();
assert.equal(selectionSaves, 1, 'The prefilled 10 alone must not block saving an existing selection list.');
const backspaceForm = selectionNumberForm(['10', '', '']); let focusedPrefix = false;
const backspaceParts = numberFields(backspaceForm);
backspaceParts[0].props.ref({ focus() { focusedPrefix = true; } });
backspaceParts[1].props.onKeyDown({ key: 'Backspace', preventDefault() {} });
assert(focusedPrefix);
await adminUI.exportAdminStatistics(demo, '2026-10', 'group-a', '', '전기국');
assert(exportedWorkbook.filename.includes('전기국'));
assert.deepEqual(Array.from(exportedWorkbook.sheets, sheet => sheet.name), ['그룹별 통계','계정별 현황','출원별 현황','조사 방식별 통계','AI 검색 결과 평가','조회 기준']);
assert.equal(exportedWorkbook.sheets.find(sheet => sheet.name === 'AI 검색 결과 평가').rows.length, 141);
assert.equal(exportedWorkbook.sheets.find(sheet => sheet.name === '출원별 현황').rows.length, 11);
console.log('Admin and bureau workspace UI tests passed: six task menus, scoped sessions and forms, search/filter combinations, target publication handoff, independent downloads, draft-save guidance, closed-month controls, and six-sheet filtered exports.');
