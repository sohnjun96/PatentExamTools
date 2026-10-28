import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { Miniflare } from 'miniflare';
import * as rules from '../app/lib/evaluation.ts';
import * as bureauRules from '../app/lib/bureaus.ts';

async function loadApplicationModule(path, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const load = vm.runInThisContext(`(function(require, module, exports) { ${compiled}\n})`);
  load((id) => {
    if (id in dependencies) return dependencies[id];
    throw new Error(`Unexpected dependency: ${id}`);
  }, module, module.exports);
  return module.exports;
}

// Exercise the real storage module against an isolated, non-persistent D1.
// The module loader only replaces the application's DB entrypoint and alias.
const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test") } }', compatibilityDate: '2026-05-01', d1Databases: { DB: 'evaluation-storage-test' }, d1Persist: false });
try {
  const db = await mf.getD1Database('DB');
  const bureauMigration = await loadApplicationModule('../app/lib/evaluation-bureau.ts', { '@/app/lib/evaluation': rules });
  const store = await loadApplicationModule('../app/lib/evaluation-store.ts', {
    '@/app/lib/db': { appDatabase: async () => db },
    '@/app/lib/evaluation': rules,
    '@/app/lib/bureaus': bureauRules,
    '@/app/lib/evaluation-bureau': bureauMigration,
  });
  const initial = await store.readEvaluationState();
  assert.equal(initial.revision, 0);
  const attempts = await Promise.allSettled([
    store.mutateEvaluationState(0, { admin: true }, { type: 'saveGroup', group: { name: '그룹 A' } }),
    store.mutateEvaluationState(0, { admin: true }, { type: 'saveGroup', group: { name: '그룹 B' } }),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  const rejected = attempts.find((attempt) => attempt.status === 'rejected');
  assert.equal(rejected.reason.status, 409);
  const afterRace = await store.readEvaluationState();
  assert.equal(afterRace.revision, 1);
  assert.equal(afterRace.state.groups.length, 1);
  await assert.rejects(() => store.mutateEvaluationState(1, { admin: false }, { type: 'saveGroup', group: { name: '권한 없음' } }), (error) => error.status === 403);
  assert.equal((await store.readEvaluationState()).revision, 1);
  const retryName = afterRace.state.groups[0].name === '그룹 A' ? '그룹 B' : '그룹 A';
  await store.mutateEvaluationState(1, { admin: true }, { type: 'saveGroup', group: { name: retryName } });
  const final = await store.readEvaluationState();
  assert.equal(final.revision, 2);
  assert.deepEqual(final.state.groups.map((group) => group.name).sort(), ['그룹 A', '그룹 B']);

  // Simulate a pre-existing main workspace shared by two bureaus. Import is
  // selective and copy-once: it must neither mutate main nor reveal other users.
  const legacy = rules.createDemoState('2026-10');
  legacy.months[0].participants = structuredClone(legacy.personnel.memberships);
  legacy.months[0].assignments = structuredClone(legacy.personnel.assignments);
  delete legacy.personnel; // Exercise a genuine pre-migration payload, not the new shared model.
  legacy.users.forEach((user, index) => { user.bureau = index < 5 ? '기획국' : '전기국'; });
  legacy.cases.forEach((item) => { item.bureau = legacy.users.find((user) => user.id === item.examinerId).bureau; });
  legacy.users.push({ id: 'legacy-unknown', name: '소속 불명', bureau: '', division: '', roles: ['examiner'], active: true });
  legacy.cases.push({ ...legacy.cases[0], id: 'unknown-case', examinerId: 'legacy-unknown', bureau: '' });
  legacy.cases.push({ ...legacy.cases[0], id: 'unknown-snapshot', bureau: '' });
  legacy.methods.push({ id: 'electric-only', name: '전기국 전용 AI', kind: 'ai', active: true }, { id: 'unrelated', name: '소속 불명 AI', kind: 'ai', active: true });
  legacy.months.push({ ...rules.emptyMonth('2026-09'), methodIds: ['electric-only'], participants: [{ userId: 'demo-user-6', groupId: 'group-b' }], assignments: [{ userId: 'demo-user-6', groupId: 'group-b', methodId: 'electric-only' }] });
  const foreignEdit = legacy.results.find((result) => result.caseId === legacy.cases[0].id);
  foreignEdit.draftAuthorId = 'demo-user-6';
  foreignEdit.draftDocuments = ['FOREIGN PRIVATE DRAFT'];
  foreignEdit.publishedBy = { id: 'demo-user-6', name: '외국 등록자 이름' };
  await db.prepare('UPDATE evaluation_workspace SET payload_json = ?, revision = ? WHERE id = ?').bind(JSON.stringify(legacy), 10, 'main').run();
  const mainBefore = await store.readEvaluationState();
  let planning = await store.readEvaluationState('기획국');
  let electric = await store.readEvaluationState('전기국');
  assert.equal(planning.revision, 0);
  assert.equal(electric.revision, 0);
  assert.equal(planning.state.users.length, 5);
  assert.equal(electric.state.users.length, 5);
  assert.equal(planning.state.cases.length, 10);
  assert.equal(electric.state.cases.length, 10);
  assert.equal(planning.state.users.every((user) => user.bureau === '기획국'), true);
  assert.equal(planning.state.cases.every((item) => item.bureau === '기획국'), true);
  assert.equal(planning.state.results.find((result) => result.id === foreignEdit.id).draftDocuments.length, 0);
  assert.equal(planning.state.results.find((result) => result.id === foreignEdit.id).publishedBy, null);
  assert.equal(planning.state.methods.some((method) => method.id === 'electric-only'), false);
  assert.equal(electric.state.methods.some((method) => method.id === 'electric-only'), true);
  assert.equal(planning.state.methods.some((method) => method.id === 'unrelated'), false);
  assert.equal(planning.state.months.some((month) => month.id === '2026-09'), false);
  assert.equal(planning.state.months.every((month) => month.participants.every((participant) => planning.state.users.some((user) => user.id === participant.userId))), true);
  assert.equal(planning.state.months.every((month) => month.assignments.every((assignment) => planning.state.users.some((user) => user.id === assignment.userId))), true);
  assert.equal(planning.state.personnel.memberships.length, 5);
  assert.equal(planning.state.personnel.assignments.length, 2);
  assert.equal(electric.state.personnel.assignments.length, 3);
  assert(planning.state.personnel.assignments.every((entry) => planning.state.users.some((user) => user.id === entry.userId)));
  assert(electric.state.personnel.memberships.every((entry) => electric.state.users.some((user) => user.id === entry.userId)));

  // A period edit and a global personnel edit still share one CAS revision.
  const semiconductor = await store.readEvaluationState('반도체단');
  const independentActions = [{ type: 'saveMonth', month: rules.emptyMonth('2026-11') }, { type: 'savePersonnel', personnel: { memberships: [], assignments: [] } }];
  const operationRace = await Promise.allSettled(independentActions.map((action) => store.mutateEvaluationState(semiconductor.revision, { admin: true }, action, '반도체단')));
  assert.equal(operationRace.filter((entry) => entry.status === 'fulfilled').length, 1);
  const losingIndex = operationRace.findIndex((entry) => entry.status === 'rejected');
  assert.equal(operationRace[losingIndex].reason.status, 409);
  const afterOperationRace = await store.readEvaluationState('반도체단');
  await store.mutateEvaluationState(afterOperationRace.revision, { admin: true }, independentActions[losingIndex], '반도체단');
  const independentSaved = await store.readEvaluationState('반도체단');
  assert(independentSaved.state.months.some((month) => month.id === '2026-11' && !month.closed));
  assert.equal(independentSaved.state.months.filter((month) => !month.closed).length, 2);
  assert.deepEqual(independentSaved.state.personnel, { memberships: [], assignments: [] });

  planning = await store.mutateEvaluationState(0, { admin: true }, { type: 'saveMethod', method: { name: '기획국 신규 AI', kind: 'ai', active: true } }, '기획국');
  assert.equal(planning.revision, 1);
  assert.equal((await store.readEvaluationState('전기국')).revision, 0);
  assert.equal((await store.readEvaluationState('전기국')).state.methods.some((method) => method.name === '기획국 신규 AI'), false);
  electric = await store.mutateEvaluationState(0, { admin: true }, { type: 'saveUser', user: { name: '전기국 신규', bureau: '전기국', division: '전기과', roles: ['examiner'], active: true } }, '전기국');
  assert.equal(electric.revision, 1);
  assert.equal((await store.readEvaluationState('기획국')).state.users.some((user) => user.name === '전기국 신규'), false);
  await assert.rejects(() => store.mutateEvaluationState(1, { admin: true }, { type: 'saveUser', user: { id: 'demo-user-6', name: '다른국 덮어쓰기', bureau: '기획국', division: '', roles: ['examiner'], active: true } }, '기획국'), (error) => error.status === 404);
  await assert.rejects(() => store.mutateEvaluationState(1, { admin: true }, { type: 'saveUser', user: { name: '다른국 등록', bureau: '전기국', division: '', roles: ['examiner'], active: true } }, '기획국'), (error) => error.status === 400);
  for (const attempt of [
    { user: { ...planning.state.users[0], bureau: '전기국' }, groupId: '', responsibilities: [], status: 400 },
    { user: { ...planning.state.users[0], id: 'demo-user-6' }, groupId: '', responsibilities: [], status: 404 },
  ]) await assert.rejects(() => store.mutateEvaluationState(1, { admin: true }, { type: 'saveExaminer', ...attempt }, '기획국'), (error) => error.status === attempt.status);

  // Profile, membership and responsibilities persist in one revision and one scope.
  let merged = await store.readEvaluationState('반도체단');
  merged = await store.mutateEvaluationState(merged.revision, { admin: true }, { type: 'saveGroup', group: { name: '통합 저장 검증 그룹' } }, '반도체단');
  const mergedGroup = merged.state.groups.at(-1);
  const beforeMergedRevision = merged.revision;
  merged = await store.mutateEvaluationState(merged.revision, { admin: true }, { type: 'saveExaminer', user: { name: '통합 저장 검증 심사관', bureau: '반도체단', division: '통합과', roles: ['examiner', 'ai'], active: true }, groupId: mergedGroup.id, responsibilities: [{ groupId: mergedGroup.id, methodId: 'chatgpt' }] }, '반도체단');
  const mergedUser = merged.state.users.at(-1);
  assert.equal(merged.revision, beforeMergedRevision + 1);
  assert.equal(merged.state.personnel.memberships[0].userId, mergedUser.id);
  assert.equal(merged.state.personnel.assignments[0].userId, mergedUser.id);
  assert.deepEqual((await store.readEvaluationState('반도체단')).state.personnel, merged.state.personnel);
  assert.equal((await store.readEvaluationState('기획국')).state.users.some((user) => user.id === mergedUser.id), false);
  await assert.rejects(() => store.mutateEvaluationState(merged.revision, { admin: true }, { type: 'saveExaminer', user: { ...mergedUser, name: '저장되면 안 되는 이름' }, groupId: mergedGroup.id, responsibilities: [{ groupId: mergedGroup.id, methodId: 'baseline' }] }, '반도체단'), (error) => error.status === 400);
  assert.equal((await store.readEvaluationState('반도체단')).revision, merged.revision);
  assert.equal((await store.readEvaluationState('반도체단')).state.users[0].name, mergedUser.name);
  merged = await store.mutateEvaluationState(merged.revision, { admin: true }, { type: 'deleteGroup', groupId: mergedGroup.id }, '반도체단');
  assert.equal(merged.state.groups.find((group) => group.id === mergedGroup.id).deletedAt.length > 0, true);
  assert.deepEqual(merged.state.personnel, { memberships: [], assignments: [] });
  await assert.rejects(() => store.mutateEvaluationState(1, { userId: 'demo-user-6' }, { type: 'saveSelection', monthId: '2026-10', rows: [], confirm: false }, '기획국'), (error) => error.status === 403);
  planning = await store.mutateEvaluationState(1, { userId: 'demo-user-1' }, { type: 'saveResult', caseId: planning.state.cases[0].id, methodId: 'chatgpt', documents: ['PLANNING PRIVATE'], publish: false }, '기획국');
  assert.equal((await store.readEvaluationState('전기국')).state.results.some((result) => result.draftDocuments.includes('PLANNING PRIVATE')), false);
  const scopedRace = await Promise.allSettled([
    store.mutateEvaluationState(2, { admin: true }, { type: 'saveGroup', group: { name: '국별 경합 A' } }, '기획국'),
    store.mutateEvaluationState(2, { admin: true }, { type: 'saveGroup', group: { name: '국별 경합 B' } }, '기획국'),
  ]);
  assert.equal(scopedRace.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  assert.equal(scopedRace.find((attempt) => attempt.status === 'rejected').reason.status, 409);
  const independentWrites = await Promise.all([
    store.mutateEvaluationState(3, { admin: true }, { type: 'saveGroup', group: { name: '기획국 독립 저장' } }, '기획국'),
    store.mutateEvaluationState(1, { admin: true }, { type: 'saveGroup', group: { name: '전기국 독립 저장' } }, '전기국'),
  ]);
  assert.deepEqual(independentWrites.map((write) => write.revision), [4, 2]);

  const api = await loadApplicationModule('../app/api/evaluation/route.ts', {
    'next/server': { NextResponse: { json: (data, options = {}) => new Response(JSON.stringify(data), { ...options, headers: { ...options.headers, 'Content-Type': 'application/json' } }) } },
    '@/app/lib/evaluation': rules,
    '@/app/lib/bureaus': bureauRules,
    '@/app/lib/evaluation-store': store,
  });
  const request = (query = '', body) => ({ nextUrl: new URL(`http://localhost/api/evaluation${query}`), text: async () => JSON.stringify(body) });
  assert.equal((await api.GET(request('?bureau='))).status, 400);
  assert.equal((await api.GET(request('?bureau=알수없음'))).status, 400);
  assert.equal((await api.GET(request('?bureau=기획국&userId=demo-user-6'))).status, 403);
  const scopedGet = await api.GET(request('?bureau=기획국&admin=1'));
  assert.equal(scopedGet.status, 200);
  assert.equal((await scopedGet.json()).state.users.some((user) => user.id === 'demo-user-6'), false);
  const mainGet = await api.GET(request('?admin=1'));
  assert.equal((await mainGet.json()).revision, 10);
  const bodyScopeIgnored = await api.POST(request('?bureau=기획국', { revision: 4, bureau: '전기국', actor: { admin: true }, action: { type: 'saveUser', user: { name: 'URL 국별 등록', bureau: '기획국', division: '기획과', roles: ['examiner'], active: true } } }));
  assert.equal(bodyScopeIgnored.status, 200);
  assert.equal((await bodyScopeIgnored.json()).state.users.find((user) => user.name === 'URL 국별 등록').bureau, '기획국');
  assert.equal((await store.readEvaluationState('전기국')).revision, 2);
  assert.equal((await store.readEvaluationState('전기국')).state.users.some((user) => user.name === 'URL 국별 등록'), false);
  const foreignPost = await api.POST(request('?bureau=기획국', { revision: 5, actor: { userId: 'demo-user-6' }, action: { type: 'saveSelection', monthId: '2026-10', rows: [], confirm: false } }));
  assert.equal(foreignPost.status, 403);
  const chemical = await store.readEvaluationState('화학국');
  assert.equal(chemical.state.users.length, 0);
  assert.equal(chemical.state.cases.length, 0);
  const scopedDemo = await store.mutateEvaluationState(0, { admin: true }, { type: 'loadDemo' }, '화학국');
  assert.equal(scopedDemo.state.users.every((user) => user.bureau === '화학국'), true);
  assert.equal(scopedDemo.state.cases.every((item) => item.bureau === '화학국'), true);
  assert.deepEqual(await store.readEvaluationState(), mainBefore);
  const commentCase = scopedDemo.state.cases[0];
  const commentRanking = scopedDemo.state.rankings.find(entry => entry.caseId === commentCase.id);
  const commentAction = { type: 'saveEvaluation', caseId: commentCase.id, evaluations: [], rankings: commentRanking.values, versions: commentRanking.versions, overallComment: '화학국 출원 총평\n관련성 검토 완료' };
  const commentRequest = revision => request('?bureau=화학국', { revision, actor: { userId: commentCase.examinerId }, action: commentAction });
  const commentResponse = await api.POST(commentRequest(scopedDemo.revision));
  assert.equal(commentResponse.status, 200);
  const savedComment = await commentResponse.json();
  assert.equal(savedComment.state.rankings.find(entry => entry.caseId === commentCase.id).overallComment, commentAction.overallComment);
  const persistedComment = await store.readEvaluationState('화학국');
  assert.equal(persistedComment.state.rankings.find(entry => entry.caseId === commentCase.id).overallComment, commentAction.overallComment, 'Read the comment back from isolated D1.');
  assert(!(await store.readEvaluationState('전기국')).state.rankings.some(entry => entry.overallComment === commentAction.overallComment));
  const otherExaminer = await api.GET(request('?bureau=화학국&userId=demo-user-2'));
  assert(!(await otherExaminer.json()).state.rankings.some(entry => entry.caseId === commentCase.id));
  assert.equal((await api.POST(commentRequest(scopedDemo.revision))).status, 409, 'A stale save must not overwrite the comment.');
  commentAction.overallComment = '';
  const clearedComment = await api.POST(commentRequest(persistedComment.revision));
  assert.equal(clearedComment.status, 200);
  assert.equal((await store.readEvaluationState('화학국')).state.rankings.find(entry => entry.caseId === commentCase.id).overallComment, '');
  // Schedule-only edits persist for existing closed months without reopening them.
  let scheduled = await store.readEvaluationState('화학국');
  scheduled = await store.mutateEvaluationState(scheduled.revision, { admin: true }, { type: 'setMonthClosed', monthId: commentCase.monthId, closed: true }, '화학국');
  const savedMonth = scheduled.state.months.find(month => month.id === commentCase.monthId);
  const scheduleAction = { type: 'saveMonth', month: { ...savedMonth, selectionDeadline: '2000-01-01', resultDeadline: '2000-01-02', evaluationDeadline: '2000-01-03' } };
  const updateSchedule = await api.POST(request('?bureau=화학국', { revision: scheduled.revision, actor: { admin: true }, action: scheduleAction }));
  assert.equal(updateSchedule.status, 200);
  const persistedSchedule = await store.readEvaluationState('화학국');
  assert.deepEqual(persistedSchedule.state.months.find(month => month.id === savedMonth.id), scheduleAction.month);
  assert.deepEqual(persistedSchedule.state.cases, scheduled.state.cases);
  assert.deepEqual(persistedSchedule.state.personnel, scheduled.state.personnel);
  assert.equal((await api.POST(request('?bureau=화학국', { revision: scheduled.revision, actor: { admin: true }, action: scheduleAction }))).status, 409);
  assert.equal((await api.POST(request('?bureau=화학국', { revision: persistedSchedule.revision, actor: { userId: commentCase.examinerId }, action: scheduleAction }))).status, 403);
  scheduled = await store.mutateEvaluationState(persistedSchedule.revision, { admin: true }, { type: 'setMonthClosed', monthId: savedMonth.id, closed: false }, '화학국');
  const lateResult = await api.POST(request('?bureau=화학국', { revision: scheduled.revision, actor: { userId: 'demo-user-1' }, action: { type: 'saveResult', caseId: commentCase.id, methodId: 'chatgpt', documents: ['KR2020000000A'], publish: true } }));
  assert.equal(lateResult.status, 200, 'AI results can be published after the target date.');
  scheduled = await store.readEvaluationState('화학국');
  const publishedVersion = scheduled.state.results.find(result => result.caseId === commentCase.id && result.methodId === 'chatgpt').publishedVersion;
  const lateEvaluation = await api.POST(request('?bureau=화학국', { revision: scheduled.revision, actor: { userId: commentCase.examinerId }, action: { type: 'saveEvaluation', caseId: commentCase.id, evaluations: [{ methodId: 'chatgpt', version: publishedVersion, documents: [{ number: 'KR2020000000A', score: 3, cited: 'O', note: '' }] }], rankings: {}, versions: {}, overallComment: '기한 이후 API 평가' } }));
  assert.equal(lateEvaluation.status, 200, 'Evaluations can be saved after the target date.');
  scheduled = await store.readEvaluationState('화학국');
  assert.equal(scheduled.state.rankings.find(entry => entry.caseId === commentCase.id).overallComment, '기한 이후 API 평가');
  scheduled = await store.mutateEvaluationState(scheduled.revision, { admin: true }, { type: 'saveMonth', month: { ...rules.emptyMonth('2025-01'), selectionDeadline: '2000-01-01' } }, '화학국');
  const lateSelection = await api.POST(request('?bureau=화학국', { revision: scheduled.revision, actor: { userId: commentCase.examinerId }, action: { type: 'saveSelection', monthId: '2025-01', rows: [{ applicationNumber: '10-2020-0093844', cpc: '' }], confirm: true } }));
  assert.equal(lateSelection.status, 200, 'Target cases can be confirmed after the target date.');
  assert.equal((await store.readEvaluationState('화학국')).state.cases.filter(item => item.monthId === '2025-01' && item.status === 'confirmed').length, 1);
  // Stage control is a scoped, revision-checked operation that survives D1 reloads.
  let phases = await store.readEvaluationState('화학국');
  const otherBureauBefore = await store.readEvaluationState('전기국');
  const otherMonthBefore = structuredClone(phases.state.months.find(month => month.id === '2025-01'));
  const stageCommand = { type: 'setMonthStage', monthId: commentCase.monthId, stage: 'result', status: 'stopped' };
  const stagePost = (revision, action, actor = { admin: true }) => api.POST(request('?bureau=화학국', { revision, actor, action }));
  assert.equal((await stagePost(phases.revision, stageCommand, { userId: commentCase.examinerId })).status, 403);
  const previousPhaseRevision = phases.revision;
  assert.equal((await stagePost(phases.revision, stageCommand)).status, 200);
  phases = await store.readEvaluationState('화학국');
  assert.equal(phases.revision, previousPhaseRevision + 1);
  assert.equal(phases.state.months.find(month => month.id === commentCase.monthId).stages.result, 'stopped');
  assert.deepEqual(phases.state.months.find(month => month.id === '2025-01'), otherMonthBefore);
  assert.deepEqual(await store.readEvaluationState('전기국'), otherBureauBefore);
  assert.equal((await stagePost(previousPhaseRevision, { ...stageCommand, status: 'running' })).status, 409);
  const phaseResultAction = { type: 'saveResult', caseId: commentCase.id, methodId: 'chatgpt', documents: ['KR2020000000A'], publish: true };
  const phaseEvaluationAction = { type: 'saveEvaluation', caseId: commentCase.id, evaluations: [], rankings: {}, versions: {} };
  const blockedResult = await stagePost(phases.revision, phaseResultAction, { userId: 'demo-user-1' });
  assert.equal(blockedResult.status, 409); assert((await blockedResult.json()).error.includes('단계가 중지'));
  assert.equal((await store.readEvaluationState('화학국')).revision, phases.revision);
  assert.equal((await stagePost(phases.revision, phaseEvaluationAction, { userId: commentCase.examinerId })).status, 200, 'Stopping result entry does not stop evaluation.');
  phases = await store.readEvaluationState('화학국');
  const currentPhaseMonth = phases.state.months.find(month => month.id === commentCase.monthId);
  assert.equal((await stagePost(phases.revision, { type: 'saveMonth', month: { ...currentPhaseMonth, evaluationDeadline: '2000-01-04', stages: { result: 'running' } } })).status, 200);
  phases = await store.readEvaluationState('화학국');
  assert.equal(phases.state.months.find(month => month.id === commentCase.monthId).stages.result, 'stopped');
  assert.equal((await stagePost(phases.revision, { ...stageCommand, status: 'running' })).status, 200);
  phases = await store.readEvaluationState('화학국');
  assert.equal((await stagePost(phases.revision, phaseResultAction, { userId: 'demo-user-1' })).status, 200);
  phases = await store.readEvaluationState('화학국');
  assert.equal((await stagePost(phases.revision, { ...stageCommand, stage: 'evaluation', status: 'closed' })).status, 200);
  phases = await store.readEvaluationState('화학국');
  assert.equal((await stagePost(phases.revision, phaseEvaluationAction, { userId: commentCase.examinerId })).status, 409);
  assert.equal((await stagePost(phases.revision, { ...stageCommand, stage: 'evaluation', status: 'running' })).status, 200);
  phases = await store.readEvaluationState('화학국');
  assert.equal((await stagePost(phases.revision, phaseEvaluationAction, { userId: commentCase.examinerId })).status, 200);
  assert.deepEqual(await store.readEvaluationState('전기국'), otherBureauBefore);
  // Genuine legacy JSON with a cap still permits a longer selection through the API.
  let uncappedFixture = await store.readEvaluationState('화학국');
  uncappedFixture.state.months.find(month => month.id === '2025-01').caseLimit = 1;
  await db.prepare('UPDATE evaluation_workspace SET payload_json = ? WHERE id = ?').bind(JSON.stringify(uncappedFixture.state), 'bureau:화학국').run();
  const uncappedSelection = { type: 'saveSelection', monthId: '2025-01', rows: [{ applicationNumber: '10-2020-0000001', cpc: '' }, { applicationNumber: '10-2020-0000002', cpc: 'G06N' }], confirm: false };
  const submitUncapped = (revision, confirm) => api.POST(request('?bureau=화학국', { revision, actor: { userId: 'demo-user-2' }, action: { ...uncappedSelection, confirm } }));
  assert.equal((await submitUncapped(uncappedFixture.revision, false)).status, 200);
  uncappedFixture = await store.readEvaluationState('화학국');
  assert.equal((await submitUncapped(uncappedFixture.revision, true)).status, 200);
  uncappedFixture = await store.readEvaluationState('화학국');
  assert.equal(uncappedFixture.state.cases.filter(item => item.monthId === '2025-01' && item.examinerId === 'demo-user-2' && item.status === 'confirmed').length, 2);
  const cleanedMonth = await store.mutateEvaluationState(uncappedFixture.revision, { admin: true }, { type: 'saveMonth', month: uncappedFixture.state.months.find(month => month.id === '2025-01') }, '화학국');
  assert.equal('caseLimit' in cleanedMonth.state.months.find(month => month.id === '2025-01'), false);
  console.log('Evaluation storage: isolated D1 persistence/CAS; bureau-specific accounts, methods, data and revisions; cross-bureau read/write rejection; selective legacy import; untouched main; scoped demo; URL-only scope and concurrent independent writes verified.');
} finally {
  await mf.dispose();
}
