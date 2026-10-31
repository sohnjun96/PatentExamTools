import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as domain from '../app/lib/evaluation.ts';
import * as guidance from '../app/lib/evaluation-guidance.ts';
import * as literatureLinks from '../app/lib/literature-link.ts';

const require = createRequire(import.meta.url);
let cells = [], refs = [], cursor = 0, refCursor = 0, props, actions = [];
const hooks = {
  useState(initial) {
    const index = cursor++;
    if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
    return [cells[index], next => { cells[index] = typeof next === 'function' ? next(cells[index]) : next; }];
  },
  useRef(initial) { const index = refCursor++; return refs[index] ||= { current: initial }; },
  useEffect() {},
};
const module = { exports: {} };
const compiled = ts.transpileModule(fs.readFileSync(new URL('../app/evaluation/task/evaluation-reader.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
vm.runInNewContext(compiled, { module, exports: module.exports, require: id => {
  if (id === 'react') return hooks;
  if (id === 'react/jsx-runtime') return require(id);
  if (id.endsWith('/evaluation')) return domain;
  if (id.endsWith('/evaluation-guidance')) return guidance;
  if (id.endsWith('/literature-link')) return literatureLinks;
  return { default: () => null };
} });
const Reader = module.exports.default;
function nodes(value, output = []) {
  if (Array.isArray(value)) { value.forEach(entry => nodes(entry, output)); return output; }
  if (!value?.props) return output;
  output.push(value); nodes(value.props.children, output); return output;
}
function text(value) { return Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
function render() { cursor = refCursor = 0; return Reader(props); }
function button(label) { const found = nodes(render()).find(node => node.type === 'button' && (node.props['aria-label'] === label || text(node) === label)); assert(found, `Missing button: ${label}`); return found; }
function field(label) { return nodes(render()).find(node => node.type === 'textarea' && node.props['aria-label'] === label); }
function choose(label) { const control = button(label); assert.equal(control.props.disabled, false, label); control.props.onClick(); }
function selected(label) { return button(label).props['aria-pressed']; }
function reset(state = domain.createDemoState('2026-11')) {
  state = structuredClone(state); state.cases[0].applicationNumber = '10-2026-0123981';
  state.rankings = state.rankings.filter(entry => entry.caseId !== state.cases[0].id);
  cells = []; refs = []; actions = [];
  props = { state, item: state.cases[0], month: state.months[0], busy: false, dirty() {}, save: async action => { actions.push(action); return true; } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

const hasButton = label => nodes(render()).some(node => node.type === 'button' && (node.props['aria-label'] === label || text(node) === label));
function completeDocuments() {
  for (;;) {
    choose('0'); choose('미인용 X');
    if (button('다음 문헌').props.disabled) break;
    choose('다음 문헌');
  }
}
const incomplete = domain.createDemoState('2026-11');
incomplete.evaluations.find(entry => entry.caseId === incomplete.cases[0].id && entry.methodId === 'chatgpt').documents[0].score = null;
reset(incomplete);
assert(!hasButton('평가 결과 보기'), 'Do not offer final review before every published document is scored and cited.');
assert(!field('10-2026-0123981 건 관련 피드백(선택)'));
assert(!nodes(render()).some(node => node.props.className === 'tw-rank-buttons'));
const progress = nodes(render()).find(node => node.type === 'progress');
assert.equal(progress.props.value, 13); assert.equal(progress.props.max, 14);
field('문헌별 피드백(선택)').props.onChange({ target: { value: '첫 문헌 피드백' } });
choose('0');
assert(hasButton('평가 결과 보기'), 'A score of zero and an X citation still count as evaluated.');
completeDocuments();
assert.equal(nodes(render()).find(node => node.type === 'progress').props.value, 14);
choose('임시저장'); await settle();
assert.equal(actions[0].finalize, false);
assert.equal(domain.caseStatus(domain.applyAction(props.state, { userId: props.item.examinerId }, actions[0]), props.item).complete, false);
choose('평가 결과 보기');
assert.equal(actions.length, 1, 'Opening the summary must not prematurely finalize or save.');
let tableNodes = nodes(render());
assert.deepEqual(tableNodes.filter(node => node.type === 'th').map(node => text(node)), ['AI 종류', '특허 여부', '인용문헌 명', '문헌 점수', '인용 여부']);
assert.equal(tableNodes.find(node => node.type === 'tbody').props.children.length, 14);
assert.equal(button('평가 종료').props.disabled, true, 'Finalization requires complete rankings.');
assert(!field('문헌별 피드백(선택)'));
assert(field('10-2026-0123981 건 관련 피드백(선택)'));
choose('ChatGPT 1위'); choose('클로드 2위'); choose('선행기술조사 3위');
choose('선행기술조사 1위');
assert(selected('ChatGPT 3위')); assert(selected('클로드 2위')); assert(selected('선행기술조사 1위'));
field('10-2026-0123981 건 관련 피드백(선택)').props.onChange({ target: { value: '출원 전체 피드백' } });
const firstCitation = nodes(render()).find(node => node.props.className === 'tw-result-document');
firstCitation.props.onClick();
assert.equal(field('문헌별 피드백(선택)').props.value, '첫 문헌 피드백');
choose('평가 결과 보기');
assert.equal(field('10-2026-0123981 건 관련 피드백(선택)').props.value, '출원 전체 피드백');
assert(selected('ChatGPT 3위'));
choose('평가 종료'); await settle();
const finalAction = actions.at(-1);
assert.equal(finalAction.finalize, true); assert.equal(finalAction.overallComment, '출원 전체 피드백');
assert.equal(finalAction.evaluations[0].documents[0].score, 0); assert.equal(finalAction.evaluations[0].documents[0].cited, 'X');
assert.equal(finalAction.evaluations[0].documents[0].note, '첫 문헌 피드백');
assert(domain.caseStatus(domain.applyAction(props.state, { userId: props.item.examinerId }, finalAction), props.item).complete);
assert(text(render()).includes('평가가 종료되었습니다.')); assert.equal(button('평가 종료됨').props.disabled, true);
assert.equal(field('10-2026-0123981 건 관련 피드백(선택)').props.disabled, true);
choose('평가 수정');
assert(field('문헌별 피드백(선택)')); assert.equal(field('문헌별 피드백(선택)').props.disabled, false);
assert(!nodes(render()).some(node => node.props.className === 'tw-rank-buttons'));

reset(); choose('평가 결과 보기'); choose('ChatGPT 1위'); choose('클로드 2위'); choose('선행기술조사 3위');
field('10-2026-0123981 건 관련 피드백(선택)').props.onChange({ target: { value: '실패해도 유지할 피드백' } });
let finish; props.save = action => { actions.push(action); return new Promise(resolve => { finish = resolve; }); };
const ending = button('평가 종료'); ending.props.onClick(); ending.props.onClick(); button('클로드 1위').props.onClick();
assert.equal(actions.length, 1); assert(selected('ChatGPT 1위')); assert.equal(button('클로드 1위').props.disabled, true);
finish(false); await settle();
assert.equal(field('10-2026-0123981 건 관련 피드백(선택)').props.value, '실패해도 유지할 피드백');
assert(!text(render()).includes('평가가 종료되었습니다.')); assert.equal(button('평가 종료').props.disabled, false);
for (const status of ['pending', 'stopped', 'closed']) {
  props.month = { ...props.month, stages: { ...props.month.stages, evaluation: status } };
  assert.equal(button('평가 종료').props.disabled, true); assert.equal(button('클로드 1위').props.disabled, true);
  assert.equal(field('10-2026-0123981 건 관련 피드백(선택)').props.disabled, true);
}

const structured = domain.createDemoState('2026-11');
const details = domain.normalizeLiteratureDocuments([{ kind: 'patent', number: 'KR20100001234A' }, { kind: 'non-patent', title: '공정 제어 연구', authors: 'Kim, J.' }]);
const mixed = domain.applyAction(structured, { userId: structured.cases[0].examinerId }, { type: 'saveResult', caseId: structured.cases[0].id, methodId: 'chatgpt', documents: details.map(entry => entry.number), documentDetails: details, publish: true });
reset(mixed); completeDocuments(); choose('평가 결과 보기');
const rows = nodes(render()).find(node => node.type === 'tbody').props.children;
assert.equal(text(rows[0].props.children[1]), '특허'); assert.equal(text(rows[0].props.children[2]), 'KR20100001234A');
assert.equal(text(rows[1].props.children[1]), '비특허'); assert.equal(text(rows[1].props.children[2]), '공정 제어 연구');
assert.equal(rows.length, 9); assert.equal(text(rows[0].props.children[3]), '0'); assert.equal(text(rows[0].props.children[4]), 'X');

const four = domain.createDemoState('2026-11');
four.methods.push({ ...four.methods.find(method => method.id === 'chatgpt'), id: 'third-ai', name: '세 번째 AI' });
four.results.push({ ...structuredClone(four.results.find(result => result.caseId === four.cases[0].id && result.methodId === 'chatgpt')), methodId: 'third-ai' });
reset(four); completeDocuments(); choose('평가 결과 보기');
choose('ChatGPT 1위'); choose('클로드 2위'); choose('세 번째 AI 3위'); choose('선행기술조사 순위 외');
assert.equal(button('평가 종료').props.disabled, false);
choose('세 번째 AI 평가 제외'); assert(button('선행기술조사 순위 외 (다시 선택해 주세요)').props.disabled);
choose('선행기술조사 3위'); assert.equal(button('평가 종료').props.disabled, false);
choose('ChatGPT 평가 제외'); choose('클로드 평가 제외'); choose('선행기술조사 비교 불가');
assert.equal(button('평가 종료').props.disabled, false);

reset(domain.createDemoState('2026-11'));
// A persisted final evaluation reopens as a read-only result view, with explicit editing while the phase is open.
const persisted = domain.applyAction(props.state, { userId: props.item.examinerId }, { ...finalAction, caseId: props.item.id });
props = { ...props, state: persisted, item: persisted.cases[0] }; cells = []; refs = [];
assert(text(render()).includes('평가가 종료되었습니다.')); assert(!field('문헌별 피드백(선택)'));
assert.equal(button('평가 종료됨').props.disabled, true); assert(hasButton('평가 수정'));

// Two people delivering the same AI are distinct document and ranking scopes, even for the same citation.
let parallel = domain.createDemoState('2026-11');
parallel.users.find(user => user.id === 'demo-user-3').roles.push('ai');
parallel.personnel.assignments.push({ groupId: 'group-a', methodId: 'claude', userId: 'demo-user-3' });
const sharedCitation = domain.resultFor(parallel, parallel.cases[0].id, 'claude', 'demo-user-2').publishedDocuments[0];
parallel = domain.applyAction(parallel, { userId: 'demo-user-3' }, { type: 'saveResult', caseId: parallel.cases[0].id, methodId: 'claude', documents: [sharedCitation], publish: true });
reset(parallel); completeDocuments(); choose('평가 결과 보기');
const claudeSlots = domain.caseMethods(props.state, props.item).filter(method => (method.baseMethodId ?? method.id) === 'claude');
assert.equal(claudeSlots.length, 2);
assert.notEqual(claudeSlots[0].id, claudeSlots[1].id);
assert.notEqual(claudeSlots[0].name, claudeSlots[1].name);
const parallelRows = nodes(render()).find(node => node.type === 'tbody').props.children;
for (const slot of claudeSlots) assert(parallelRows.some(row => text(row.props.children[0]) === slot.name && text(row.props.children[2]) === sharedCitation));
choose('ChatGPT 1위'); choose(`${claudeSlots[0].name} 2위`); choose(`${claudeSlots[1].name} 3위`); choose('선행기술조사 순위 외');
assert.equal(button('평가 종료').props.disabled, false);
choose('평가 종료'); await settle();
const parallelAction = actions.at(-1);
assert.equal(parallelAction.evaluations.filter(entry => claudeSlots.some(slot => slot.id === entry.methodId)).length, 2);
assert.equal(parallelAction.rankings[claudeSlots[0].id], 2); assert.equal(parallelAction.rankings[claudeSlots[1].id], 3);
assert(domain.caseStatus(domain.applyAction(props.state, { userId: props.item.examinerId }, parallelAction), props.item).complete);
console.log('Evaluation reader passed: gated two-step workflow, progress, five-column summary, patent/paper names, 0/X, draft/final persistence, retained edits, explicit reopening, failure recovery, phase guards and ranking edge cases.');
