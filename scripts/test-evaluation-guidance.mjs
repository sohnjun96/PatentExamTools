import assert from 'node:assert/strict';
import { rankOptionsFor, rankingGuidance } from '../app/lib/evaluation-guidance.ts';

const methods = [{ id: 'baseline', available: true }, { id: 'chatgpt', available: true }, { id: 'claude', available: false }];
assert.deepEqual(rankOptionsFor('claude', methods, {}), [], 'unpublished AI cannot be ranked');
assert.deepEqual(rankOptionsFor('baseline', methods, {}).map((option) => option.value), [1, 2, 'excluded'], 'baseline counts even without document registration');
assert.equal(rankOptionsFor('chatgpt', methods, { baseline: 1 }).find((option) => option.value === 1).disabled, true, 'a rank already used by another method is unavailable');
assert.deepEqual(rankOptionsFor('baseline', methods, { chatgpt: 'excluded' }).map((option) => option.value), ['incomparable', 'excluded']);
assert.deepEqual(rankOptionsFor('chatgpt', methods, { chatgpt: 'excluded' }).map((option) => option.value), [1, 2, 'excluded'], 'excluded method can be included again');
const four = [...methods.map((method) => ({ ...method, available: true })), { id: 'other', available: true }];
assert(rankOptionsFor('other', four, {}).some((option) => option.value === 'unranked'));
const afterExclusion = rankOptionsFor('other', four, { baseline: 'excluded', other: 'unranked' });
assert.equal(afterExclusion.find((option) => option.value === 'unranked').disabled, true, 'invalidated old input remains visible for explicit correction');
assert(!rankOptionsFor('other', four, { baseline: 'excluded' }).some((option) => option.value === 'unranked'));
assert(rankingGuidance(methods, {}).some((line) => line.includes('2개')));
assert(rankingGuidance(methods, {}).some((line) => line.includes('대기 중')));
assert(rankingGuidance(methods, { baseline: 'excluded', chatgpt: 'excluded' })[0].includes('모든 방식'));
assert(rankingGuidance(methods.map((method) => ({ ...method, available: false })), {})[0].includes('공개되면'));
console.log('Evaluation guidance passed: available baseline, pending AI, unique ranks, re-inclusion, one/two/four comparables, invalidated input retention.');
