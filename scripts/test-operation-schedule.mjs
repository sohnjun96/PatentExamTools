import assert from 'node:assert/strict';
import { deadlineInfo, millisecondsUntilNextSeoulDay } from '../app/lib/operation-schedule.ts';

const now = new Date('2026-10-27T05:00:00.000Z');
assert.equal(deadlineInfo('2026-10-30', now).dDayLabel, 'D-3');
assert.equal(deadlineInfo('2026-10-27', now).dDayLabel, 'D-day');
assert.equal(deadlineInfo('2026-10-24', now).dDayLabel, 'D+3');
assert.equal(deadlineInfo('2026-10-27', new Date('2026-10-26T15:00:00Z')).dDayLabel, 'D-day', 'Korean midnight starts the new D-day even if UTC is the previous date.');
assert.equal(deadlineInfo('2026-10-27', new Date('2026-10-27T14:59:59.999Z')).dDayLabel, 'D-day', 'The deadline is inclusive through the last millisecond of the Korean date.');
assert.equal(deadlineInfo('2026-10-27', new Date('2026-10-27T15:00:00Z')).dDayLabel, 'D+1');
assert.equal(deadlineInfo('2026-11-01', new Date('2026-10-31T14:59:59Z')).daysLeft, 1, 'Use calendar days rather than remaining 24-hour periods.');
assert.equal(deadlineInfo('2027-01-01', new Date('2026-12-31T14:00:00Z')).daysLeft, 1);
assert.equal(deadlineInfo('2028-03-01', new Date('2028-02-28T15:00:00Z')).daysLeft, 1);
assert.equal(deadlineInfo('2028-02-29', now).status, 'upcoming');
for (const value of ['', '  ', null, undefined]) {
  const info = deadlineInfo(value, now);
  assert.equal(info.status, 'unset');
  assert.equal(info.dateLabel, '기한 미설정');
  assert.equal(info.daysLeft, null);
}
for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-10-32', 'invalid', '2026/10/27']) {
  assert.equal(deadlineInfo(value, now).status, 'invalid', value);
}
assert.equal(deadlineInfo('2026-10-30', null).status, 'loading', 'The initial render must not depend on the server/browser clock.');
assert.equal(deadlineInfo('2026-10-30', null).date, '2026-10-30');
assert.equal(millisecondsUntilNextSeoulDay(new Date('2026-10-27T14:59:59.999Z')), 1);
assert.equal(millisecondsUntilNextSeoulDay(new Date('2026-10-27T15:00:00Z')), 86_400_000);
assert.equal(millisecondsUntilNextSeoulDay(new Date('2026-10-27T03:00:00Z')), 43_200_000);
console.log('Operation schedule passed: Korean calendar D-days, inclusive deadlines, midnight refresh, month/year/leap boundaries, unset/invalid dates and hydration-safe loading.');
