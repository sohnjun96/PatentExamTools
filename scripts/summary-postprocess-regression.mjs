import assert from 'node:assert/strict';
import { postProcessSummary } from '../app/lib/summary-postprocess.ts';

const result = postProcessSummary({
  oneLine: '  전압을 보상하는 장치입니다.   전압을 보상하는 장치입니다. ',
  technicalProblem: '원문을 확인해야 합니다. 정밀한 전압 제어를 가능하게 하는 것을 목적로 한다.',
  solution: '스위치를 제어한다. 스위치를 제어한다.',
  operationFlow: ['전압을 측정한다.', '전압을 측정한다.', '스위치를 제어한다.'],
  keyElements: ['양방향 스위치', '양방향 스위치'],
  effects: ['고조파 보상이 필요없는 효과', '고조파 보상이 필요없는 효과'],
  independentClaimSummary: '변압기와 컨버터를 포함한다.',
  dependentClaimGroups: [{ claimNumbers: [2, 2, 3], addition: '필터 구성을 추가한다.' }],
  claimOverview: '청구항 관계를 구성한다.',
  examinationPoints: ['스위치 연결관계', '스위치 연결관계'],
  searchKeywords: ['전압 보상', '전압 보상'],
  cautions: ['수학식은 별도 검토가 필요합니다.'],
  evidenceItems: [{ key: 'technicalProblem', text: '이전 문장' }],
});

assert.equal(result.oneLine, '전압을 보상하는 장치입니다.');
assert.equal(result.technicalProblem, '정밀한 전압 제어를 가능하게 하는 것을 목적으로 한다.');
assert.deepEqual(result.operationFlow, ['전압을 측정한다.', '스위치를 제어한다.']);
assert.deepEqual(result.dependentClaimGroups[0].claimNumbers, [2, 3]);
assert.equal(result.effects[0], '고조파 보상이 필요 없는 효과');
assert.equal(result.evidenceItems[0].text, result.technicalProblem);

console.log('summary postprocess regression: ok');
