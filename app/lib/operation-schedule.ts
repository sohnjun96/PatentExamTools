const DAY_MS = 86_400_000;
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const seoulCalendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const deadlineFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });

export type DeadlineInfo = {
  date: string;
  dateLabel: string;
  daysLeft: number | null;
  dDayLabel: string;
  accessibleLabel: string;
  status: 'upcoming' | 'today' | 'overdue' | 'unset' | 'invalid' | 'loading';
};

/** Compare calendar dates in Korea; a deadline remains D-day until 23:59:59 KST. */
export function deadlineInfo(deadline: string | null | undefined, now: Date | null): DeadlineInfo {
  const date = deadline?.trim() || '';
  if (!date) return { date: '', dateLabel: '기한 미설정', daysLeft: null, dDayLabel: '—', accessibleLabel: '기한이 설정되지 않았습니다.', status: 'unset' };
  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00.000Z`) : NaN;
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    return { date: '', dateLabel: '기한 확인 필요', daysLeft: null, dDayLabel: '—', accessibleLabel: '설정된 기한을 확인해 주세요.', status: 'invalid' };
  }
  const dateLabel = deadlineFormat.format(new Date(timestamp));
  // The server and first client render share this state to avoid midnight hydration mismatches.
  if (!now || !Number.isFinite(now.getTime())) return { date, dateLabel, daysLeft: null, dDayLabel: '—', accessibleLabel: '남은 일수 계산 중', status: 'loading' };
  const parts = seoulCalendar.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(entry => entry.type === type)!.value;
  const today = Date.parse(`${part('year').padStart(4, '0')}-${part('month')}-${part('day')}T00:00:00.000Z`);
  const daysLeft = Math.round((timestamp - today) / DAY_MS);
  return {
    date, dateLabel, daysLeft,
    dDayLabel: daysLeft > 0 ? `D-${daysLeft}` : daysLeft === 0 ? 'D-day' : `D+${-daysLeft}`,
    accessibleLabel: daysLeft > 0 ? `마감까지 ${daysLeft}일 남음` : daysLeft === 0 ? '오늘 마감, 23시 59분까지' : `기한 ${-daysLeft}일 지남`,
    status: daysLeft > 0 ? 'upcoming' : daysLeft === 0 ? 'today' : 'overdue',
  };
}

export function millisecondsUntilNextSeoulDay(now: Date) {
  const koreanTime = now.getTime() + SEOUL_OFFSET_MS;
  return (Math.floor(koreanTime / DAY_MS) + 1) * DAY_MS - koreanTime;
}
