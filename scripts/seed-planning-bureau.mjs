import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SAMPLE_MONTH = '2026-10';
export const SAMPLE_BUREAU = '기획국';
export const SAMPLE_ORIGIN = 'https://patent-examiner-mvp.sohnjun96.workers.dev';
export const SAMPLE_DIVISIONS = ['생활용품심사과', '식품생물자원심사과', '주거기반심사과', '가전제품심사과'];
const USER_ALLOCATION = [[1, 1, 1, 2, 2], [3, 3, 4, 4, 5], [6, 6, 6, 7, 7], [8, 8, 9, 9, 10]];
const GROUP_NAMES = { 'group-a': '생활용품·식품', 'group-b': '주거기반·가전제품' };
const normalizeNumber = value => value.replace(/[\s-]/g, '');

/** Plan only the known October demo records; other operational data is retained. */
export function buildSeedPlan(state, fixture) {
  assert.equal(state.isDemo, true, '샘플 업무 공간에서만 실행할 수 있습니다.');
  const month = state.months.find(entry => entry.id === SAMPLE_MONTH);
  assert.ok(month && !month.closed, '2026년 10월 샘플 운영월이 열려 있어야 합니다.');
  assert.equal(fixture.patents.length, 20);
  assert.equal(new Set(fixture.patents.map(entry => normalizeNumber(entry.applicationNumber))).size, 20);
  for (const patent of fixture.patents) {
    assert.match(patent.applicationNumber, /^10-\d{4}-\d{7}$/);
    assert.ok(SAMPLE_DIVISIONS.includes(patent.division));
    assert.match(patent.cpc, /^[A-HY]\d{2}[A-Z] \d+\/\d+$/);
    assert.equal(new URL(patent.sourceUrl).hostname, 'patents.google.com');
  }

  const actions = [];
  for (const [id, name] of Object.entries(GROUP_NAMES)) {
    const group = state.groups.find(entry => entry.id === id && !entry.deletedAt);
    assert.ok(group, `샘플 그룹 ${id}가 없습니다.`);
    assert.ok([name, id === 'group-a' ? '가상 1그룹' : '가상 2그룹'].includes(group.name), '사용자가 변경한 그룹은 덮어쓰지 않습니다.');
    if (group.name !== name) actions.push({ type: 'saveGroup', group: { id, name } });
  }

  const desiredCases = [];
  const desiredDivisions = new Map();
  SAMPLE_DIVISIONS.forEach((division, divisionIndex) => {
    const patents = fixture.patents.filter(entry => entry.division === division);
    assert.equal(patents.length, 5, `${division}: 출원 5건이 필요합니다.`);
    patents.forEach((patent, index) => {
      const examinerId = `demo-user-${USER_ALLOCATION[divisionIndex][index]}`;
      desiredDivisions.set(examinerId, division);
      desiredCases.push({ ...patent, examinerId, monthId: SAMPLE_MONTH });
    });
  });
  for (const [id, division] of desiredDivisions) {
    const user = state.users.find(entry => entry.id === id);
    assert.ok(user && user.active && user.roles.includes('examiner'), `샘플 계정 ${id}를 확인해 주세요.`);
    assert.equal(user.bureau, SAMPLE_BUREAU);
    assert.match(user.name, /^(가상|샘플) 심사관 \d+$/, '실제 사용자로 변경한 계정은 덮어쓰지 않습니다.');
    assert.ok(['가상 심사1과', '가상 심사2과', division].includes(user.division), '사용자가 변경한 소속 과는 덮어쓰지 않습니다.');
    const membership = state.personnel?.memberships.find(entry => entry.userId === id)
      ?? [...state.months].sort((a, b) => b.id.localeCompare(a.id)).flatMap(entry => entry.participants).find(entry => entry.userId === id);
    const expectedGroup = Number(id.split('-').at(-1)) <= 5 ? 'group-a' : 'group-b';
    assert.equal(membership?.groupId, expectedGroup, '사용자가 변경한 소속 그룹은 덮어쓰지 않습니다.');
    if (user.division !== division) actions.push({ type: 'saveUser', user: { ...user, division } });
  }
  for (const patent of desiredCases) {
    const existing = state.cases.filter(entry => entry.monthId === SAMPLE_MONTH && entry.examinerId === patent.examinerId
      && entry.status !== 'cancelled' && normalizeNumber(entry.applicationNumber) === normalizeNumber(patent.applicationNumber));
    assert.ok(existing.length <= 1, '동일한 샘플 출원이 중복 등록되어 있습니다.');
    if (existing.length) {
      assert.equal(existing[0].status, 'confirmed', '이미 등록한 출원의 선정 상태를 확인해 주세요.');
      assert.equal(existing[0].cpc, patent.cpc, '이미 등록한 출원의 CPC가 다릅니다.');
      assert.equal(existing[0].division, patent.division, '이미 등록한 출원의 소속 과가 다릅니다.');
      assert.equal(existing[0].groupName, GROUP_NAMES[existing[0].groupId], '이미 등록한 출원의 그룹이 다릅니다.');
    } else actions.push({ type: 'adminAddCase', monthId: SAMPLE_MONTH, examinerId: patent.examinerId,
      row: { applicationNumber: patent.applicationNumber, cpc: patent.cpc } });
  }
  // Cancel only the original twenty generated placeholders, after all additions.
  for (const item of state.cases) {
    const match = /^10-2024-(90000\d{2})$/.exec(item.applicationNumber);
    const index = match ? Number(match[1]) - 9000000 : -1;
    if (item.monthId === SAMPLE_MONTH && index >= 0 && index < 20 && item.status !== 'cancelled'
      && item.examinerId === `demo-user-${Math.floor(index / 2) + 1}`) {
      actions.push({ type: 'cancelCase', caseId: item.id });
    }
  }
  return { actions, desiredCases };
}

export function verifySeed(before, after, fixture) {
  assert.equal(buildSeedPlan(after, fixture).actions.length, 0, '추가로 반영할 샘플 변경이 남아 있습니다.');
  const { desiredCases } = buildSeedPlan(after, fixture);
  for (const desired of desiredCases) {
    const matches = after.cases.filter(entry => entry.monthId === SAMPLE_MONTH && entry.examinerId === desired.examinerId
      && entry.status === 'confirmed' && normalizeNumber(entry.applicationNumber) === normalizeNumber(desired.applicationNumber));
    assert.equal(matches.length, 1);
    assert.equal(matches[0].division, desired.division);
    assert.equal(matches[0].cpc, desired.cpc);
    assert.equal(matches[0].groupName, GROUP_NAMES[matches[0].groupId]);
  }
  assert.deepEqual(after.notice, before.notice);
  assert.deepEqual(after.methods, before.methods);
  // adminAddCase may append a confirmation ID when a resumed run starts with an
  // incomplete demo; all other month settings must stay byte-for-byte equal.
  const settings = months => months.map(({ confirmedUserIds, ...month }) => month);
  assert.deepEqual(settings(after.months), settings(before.months));
  assert.deepEqual(after.personnel, before.personnel);
  assert.deepEqual(after.results, before.results);
  assert.deepEqual(after.evaluations, before.evaluations);
  assert.deepEqual(after.rankings, before.rankings);
  for (const user of before.users) {
    const updated = after.users.find(entry => entry.id === user.id);
    assert.deepEqual({ ...updated, division: user.division }, user);
  }
  const cancelled = new Set(buildSeedPlan(before, fixture).actions.filter(entry => entry.type === 'cancelCase').map(entry => entry.caseId));
  for (const item of before.cases) {
    assert.deepEqual(after.cases.find(entry => entry.id === item.id), cancelled.has(item.id) ? { ...item, status: 'cancelled' } : item);
  }
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.every(arg => arg === '--apply'), '인수는 --apply만 지원합니다. 기본 실행은 미리보기입니다.');
  const fixture = JSON.parse(await readFile(new URL('./data/planning-bureau-samples.json', import.meta.url), 'utf8'));
  const endpoint = `${SAMPLE_ORIGIN}/api/evaluation?admin=1&bureau=${encodeURIComponent(SAMPLE_BUREAU)}`;
  async function request(body) {
    const response = await fetch(endpoint, { redirect: 'error', signal: AbortSignal.timeout(30_000),
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const payload = await response.json();
    if (!response.ok) throw new Error(`${response.status}: ${payload.error ?? '평가 API 오류'}`);
    assert.ok(Number.isSafeInteger(payload.revision) && payload.state, '평가 API 응답 형식 오류');
    return payload;
  }
  let current = await request();
  const before = structuredClone(current.state);
  const { actions, desiredCases } = buildSeedPlan(current.state, fixture);
  const counts = Object.fromEntries([...new Set(actions.map(entry => entry.type))].map(type => [type, actions.filter(entry => entry.type === type).length]));
  console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'preview', bureau: SAMPLE_BUREAU, month: SAMPLE_MONTH,
    revision: current.revision, patents: desiredCases.length, actions: counts }, null, 2));
  if (!args.includes('--apply')) return;
  const outputDirectory = fileURLToPath(new URL('../outputs/', import.meta.url));
  await mkdir(outputDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(outputDirectory, `planning-bureau-backup-${timestamp}.json`);
  await writeFile(backupPath, JSON.stringify(current, null, 2), { flag: 'wx' });
  console.log(`Backup: ${backupPath}`);
  for (const [index, action] of actions.entries()) {
    // The API compares revisions atomically. Never retry a conflicting write.
    const revision = current.revision;
    current = await request({ revision, actor: { admin: true }, action });
    assert.equal(current.revision, revision + 1);
    console.log(`${index + 1}/${actions.length}: ${action.type} (revision ${current.revision})`);
  }
  const verified = await request();
  assert.equal(verified.revision, current.revision, '검증 중 다른 저장이 발생했습니다. 최신 자료를 확인해 주세요.');
  verifySeed(before, verified.state, fixture);
  const resultPath = path.join(outputDirectory, `planning-bureau-after-${timestamp}.json`);
  await writeFile(resultPath, JSON.stringify(verified, null, 2), { flag: 'wx' });
  console.log(`Verified: ${desiredCases.length} real applications, 4 divisions; revision ${verified.revision}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
