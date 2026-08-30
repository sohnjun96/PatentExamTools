import assert from 'node:assert/strict';

import { analyzeClaims } from '../app/lib/examination-model.ts';
import { extractClaimReferenceNumbers } from '../app/lib/patent-claim-xml.ts';

const analyzed = analyzeClaims([
  { number: 1, text: '영상을 처리하는 인식 시스템.' },
  { number: 2, text: '[청구항 2] 제 1 항에 있어서, 판정부를 더 포함하는 인식 시스템.' },
  { number: 3, text: '3. 제2항에 따른 인식 시스템.' },
  { number: 4, text: '제1항 내지 제3항 중 어느 한 항에 있어서, 저장부를 포함하는 인식 시스템.' },
  { number: 5, text: '청구항1 또는 2 중 어느 한 항에 있어서, 통신부를 포함하는 인식 시스템.' },
  { number: 6, text: 'The system according to any one of claims 1 to 3, further comprising a controller.' },
  { number: 7, text: '표시부를 포함하는 인식 시스템.', referenceNumbers: [2] },
  { number: 8, text: '제1항 및 제2항에 각각 종속되는 인식 시스템.' },
]);

const byNumber = new Map(analyzed.map((claim) => [claim.number, claim]));
assert.equal(byNumber.get(1)?.isIndependent, true);
assert.deepEqual(byNumber.get(2)?.directReferences, [1]);
assert.equal(byNumber.get(2)?.depth, 1);
assert.deepEqual(byNumber.get(3)?.directReferences, [2]);
assert.equal(byNumber.get(3)?.depth, 2);
assert.deepEqual(byNumber.get(4)?.directReferences, [1, 2, 3]);
assert.equal(byNumber.get(4)?.multipleDependent, true);
assert.deepEqual(byNumber.get(5)?.directReferences, [1, 2]);
assert.deepEqual(byNumber.get(6)?.directReferences, [1, 2, 3]);
assert.deepEqual(byNumber.get(7)?.directReferences, [2]);
assert.deepEqual(byNumber.get(8)?.directReferences, [1, 2]);
assert.deepEqual(byNumber.get(1)?.children, [2, 4, 5, 6, 8]);

const cyclic = analyzeClaims([
  { number: 1, text: '청구항 2를 인용하는 장치.', referenceNumbers: [2] },
  { number: 2, text: '청구항 1을 인용하는 장치.', referenceNumbers: [1] },
]);
assert.equal(cyclic.every((claim) => claim.errors.includes('청구항 인용관계가 순환합니다.')), true);

assert.deepEqual(
  extractClaimReferenceNumbers({
    'claim-text': {
      '#text': '복수 항을 인용하는 청구항',
      'claim-ref': [
        { '@_idref': 'CLM-0001', '#text': '제1항' },
        { '@_idref': 'CLM-0003', '#text': '제3항' },
      ],
    },
  }),
  [1, 3],
);
assert.deepEqual(
  extractClaimReferenceNumbers({
    'kipo:claim-ref': { '@_refid': 'claim0002', '#text': '' },
  }),
  [2],
);
assert.deepEqual(
  extractClaimReferenceNumbers({
    'claim-ref': { '#text': '청구항 1 내지 3' },
  }),
  [1, 2, 3],
);

console.log('claim structure regression: ok');
