import assert from 'node:assert/strict';
import { applyAction, createDemoState, createInitialState, normalizeEvaluationState, withDefaultAIMethods } from '../app/lib/evaluation.ts';

const initial = createInitialState();
assert.deepEqual(initial.methods.filter(method => method.kind === 'ai').map(({ id, name, active }) => ({ id, name, active })), [
  { id: 'chatgpt', name: 'ChatGPT', active: true },
  { id: 'claude', name: '클로드', active: true },
  { id: 'gemini', name: 'Gemini', active: false },
  { id: 'perplexity', name: '퍼플렉시티', active: false },
  { id: 'grok', name: 'Grok', active: false },
]);
assert.equal(initial.defaultAiCatalogVersion, 1);
initial.methods[0].active = false;
assert.equal(createInitialState().methods[0].active, true, 'Each workspace must get independent preset records.');
assert.deepEqual(createDemoState('2026-10').months[0].methodIds, ['chatgpt', 'claude', 'baseline']);

const legacy = createDemoState('2026-10');
delete legacy.defaultAiCatalogVersion;
legacy.methods = [
  { id: 'chatgpt', name: '기관 ChatGPT', kind: 'ai', active: false },
  { id: 'claude', name: '클로드', kind: 'ai', active: true },
  { id: 'baseline', name: '선행기술조사', kind: 'baseline', active: true },
  { id: 'existing-gemini', name: ' Gemini ', kind: 'ai', active: true },
  { id: 'existing-grok', name: '그록', kind: 'ai', active: false, deletedAt: '2026-10-28T00:00:00Z' },
  { id: 'custom-ai', name: '클로드 2', kind: 'ai', active: false },
];
const original = structuredClone(legacy);
const normalized = normalizeEvaluationState(legacy);
assert.deepEqual(legacy, original, 'Legacy catalog migration must not mutate its input.');
assert.equal(normalized.defaultAiCatalogVersion, 1);
assert.equal(normalized.methods.length, original.methods.length + 1, 'Only the missing Perplexity preset should be added.');
assert.deepEqual(normalized.methods.slice(0, original.methods.length), original.methods, 'Preserve IDs, labels, active states, custom tools, and deletion markers.');
assert.deepEqual(normalized.methods.at(-1), { id: 'perplexity', name: '퍼플렉시티', kind: 'ai', active: false });
for (const key of ['users', 'groups', 'months', 'cases', 'results', 'evaluations', 'rankings', 'personnel']) assert.deepEqual(normalized[key], original[key]);
assert.strictEqual(normalizeEvaluationState(normalized), normalized, 'Completed migration must be idempotent.');
assert.strictEqual(withDefaultAIMethods(normalized.methods), normalized.methods, 'Manual presets must not be duplicated by name or alias.');

let edited = applyAction(normalized, { admin: true }, { type: 'saveMethod', method: { ...normalized.methods.find(method => method.id === 'existing-gemini'), name: '기관 Gemini', active: false } });
edited = applyAction(edited, { admin: true }, { type: 'deleteMethod', methodId: 'perplexity' });
const reloaded = normalizeEvaluationState(JSON.parse(JSON.stringify(edited)));
assert.deepEqual(reloaded, edited, 'Later edits and deletions must not be reset by the default catalog backfill.');
assert(!reloaded.methods.some(method => method.id === 'gemini'), 'Renaming a legacy UUID preset must not recreate a second Gemini.');
assert(reloaded.methods.find(method => method.id === 'perplexity').deletedAt);

const english = withDefaultAIMethods([{ id: 'custom-perplexity', name: 'Perplexity', kind: 'ai', active: true }]);
assert.equal(english.filter(method => ['custom-perplexity', 'perplexity'].includes(method.id)).length, 1);
assert.equal(english.find(method => method.id === 'custom-perplexity').active, true);
console.log('Default AI catalog passed: five presets, two active defaults, legacy backfill, duplicate prevention, independent records, and administrator edit/deletion preservation.');
