import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as domain from '../app/lib/evaluation.ts';
import * as guidance from '../app/lib/evaluation-guidance.ts';

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

reset();
assert(text(render()).includes('10-2026-0123981 건에 대한 조사 방식별 검색 품질 순위'));
assert(!text(render()).includes('미선택으로 변경'));
assert(!nodes(render()).some(node => node.type === 'select'));
assert(field('문헌별 피드백(선택)'));
assert(field('10-2026-0123981 건 관련 피드백(선택)'));
assert(text(render()).includes('순위 선택 0/3'));
choose('ChatGPT 1위'); choose('클로드 2위'); choose('선행기술조사 3위');
assert(text(render()).includes('선택 완료'));
// Reordering a complete ranking should take one click and preserve uniqueness.
choose('선행기술조사 1위');
assert(selected('ChatGPT 3위')); assert(selected('클로드 2위')); assert(selected('선행기술조사 1위'));
field('문헌별 피드백(선택)').props.onChange({ target: { value: '문헌의 구성 대응을 확인했습니다.' } });
field('10-2026-0123981 건 관련 피드백(선택)').props.onChange({ target: { value: '출원 전체에 대한 피드백' } });
choose('0'); choose('미인용 X');
const firstNote = field('문헌별 피드백(선택)').props.value;
choose('다음 문헌');
assert.notEqual(field('문헌별 피드백(선택)').props.value, firstNote, 'Feedback stays attached to its document.');
choose('평가 저장'); await settle();
const action = actions[0];
assert.equal(action.rankings.chatgpt, 3); assert.equal(action.rankings.claude, 2); assert.equal(action.rankings.baseline, 1);
assert.equal(action.overallComment, '출원 전체에 대한 피드백');
const first = action.evaluations.find(entry => entry.methodId === 'chatgpt').documents[0];
assert.equal(first.score, 0); assert.equal(first.cited, 'X'); assert.equal(first.note, firstNote);
const persisted = domain.applyAction(props.state, { userId: props.item.examinerId }, action);
assert.equal(persisted.rankings.find(entry => entry.caseId === props.item.id).overallComment, action.overallComment);

reset(); choose('ChatGPT 1위');
choose('클로드 1위');
assert(!selected('ChatGPT 1위'), 'Assigning an occupied rank clears an unranked method rather than inventing a tie.');
choose('평가 저장'); await settle();
assert(text(render()).includes('중간 저장됨')); assert(text(render()).includes('검색 품질 순위가 미완료'));
assert.equal(actions[0].rankings.claude, 1);
assert(nodes(render()).some(node => node.props['aria-label'] === 'ChatGPT 품질 순위' && node.props['aria-invalid']));

reset();
let finish;
props.save = action => { actions.push(action); return new Promise(resolve => { finish = resolve; }); };
choose('ChatGPT 1위'); field('문헌별 피드백(선택)').props.onChange({ target: { value: '저장 실패 후에도 보관' } });
const saveButton = button('평가 저장'); saveButton.props.onClick(); saveButton.props.onClick();
button('클로드 1위').props.onClick();
assert.equal(actions.length, 1); assert(selected('ChatGPT 1위')); assert.equal(button('클로드 1위').props.disabled, true);
finish(false); await settle();
assert.equal(field('문헌별 피드백(선택)').props.value, '저장 실패 후에도 보관'); assert(selected('ChatGPT 1위'));
for (const status of ['pending', 'stopped', 'closed']) {
  props.month = { ...props.month, stages: { ...props.month.stages, evaluation: status } };
  assert.equal(button('클로드 1위').props.disabled, true); assert.equal(field('문헌별 피드백(선택)').props.disabled, true);
}

const four = domain.createDemoState('2026-11');
four.methods.push({ ...four.methods.find(method => method.id === 'chatgpt'), id: 'third-ai', name: '세 번째 AI' });
four.results.push({ ...structuredClone(four.results.find(result => result.caseId === four.cases[0].id && result.methodId === 'chatgpt')), methodId: 'third-ai' });
reset(four); choose('ChatGPT 1위'); choose('클로드 2위'); choose('세 번째 AI 3위'); choose('선행기술조사 순위 외');
assert(text(render()).includes('선택 완료'));
choose('세 번째 AI 평가 제외');
assert(button('선행기술조사 순위 외 (다시 선택해 주세요)').props.disabled);
choose('선행기술조사 3위'); assert(text(render()).includes('선택 완료'));
choose('ChatGPT 평가 제외'); choose('클로드 평가 제외'); choose('선행기술조사 비교 불가');
assert(text(render()).includes('선택 완료'), 'Existing exclusion and single-comparable rules must remain valid.');
console.log('Evaluation reader passed: per-case feedback, rank toggles/swaps, incomplete-rank reminders, 0/X preservation, persistence, failure recovery, duplicate-save lock, phase guards and comparison edge cases.');
