'use client';

import { useEffect, useState } from 'react';
import { OPERATION_STAGES, OPERATION_STAGE_STATUS_LABELS, operationStageStatus, type OperationMonth } from '@/app/lib/evaluation';
import { deadlineInfo, millisecondsUntilNextSeoulDay } from '@/app/lib/operation-schedule';
import './operation-schedule.css';

export default function OperationSchedule({ month }: { month: OperationMonth }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      const current = new Date();
      setNow(current);
      clearTimeout(timer);
      timer = setTimeout(refresh, millisecondsUntilNextSeoulDay(current) + 25);
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  const title = `${month.id.slice(0, 4)}년 ${Number(month.id.slice(5))}월 업무 일정`;
  return <section className="operation-schedule" aria-labelledby="operation-schedule-title">
    <div className="operation-schedule-heading"><h2 id="operation-schedule-title">{title}</h2></div>
    <ul className="operation-schedule-grid">{OPERATION_STAGES.map(({ id, deadline: key, label }) => {
      const info = deadlineInfo(month[key], now);
      const status = month.closed ? 'closed' : operationStageStatus(month, id);
      return <li className={`operation-schedule-item is-${info.status}`} key={key}>
        <div className="operation-schedule-item-heading"><h3>{label}</h3><span className={`operation-schedule-count is-${info.status}`} aria-label={info.accessibleLabel}>{info.dDayLabel}</span></div>
        <span className={`operation-stage-status is-${status}`}>{OPERATION_STAGE_STATUS_LABELS[status]}</span>
        {info.date ? <p className="operation-schedule-date"><time dateTime={info.date}>{info.dateLabel}</time><span>까지</span></p> : <p className="operation-schedule-date is-unset">{info.dateLabel}</p>}
        {info.status === 'today' && <p className="operation-schedule-status">오늘 예정 기한</p>}
        {info.status === 'overdue' && <p className="operation-schedule-status">기한 {Math.abs(info.daysLeft!)}일 지남</p>}
      </li>;
    })}</ul>
  </section>;
}
