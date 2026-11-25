'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { documentEvaluationTotals, type getStatistics } from '@/app/lib/evaluation';

type Statistics = ReturnType<typeof getStatistics>;
type ReportDetailProps = { statistics: Statistics; allMonths?: boolean };
function groupPublishedDocuments(statistics: Statistics) {
  const byCase = new Map<string, Map<string, Statistics['rows']>>();
  for (const row of statistics.rows) {
    let methods = byCase.get(row.caseId);
    if (!methods) {
      methods = new Map<string, Statistics['rows']>();
      byCase.set(row.caseId, methods);
    }
    const documents = methods.get(row.baseMethodId);
    if (documents) documents.push(row);
    else methods.set(row.baseMethodId, [row]);
  }
  return byCase;
}

export default function OperationReportDetails(props: ReportDetailProps) {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const beforePrint = () => flushSync(() => setPrinting(true));
    const afterPrint = () => setPrinting(false);
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
    };
  }, []);
  return printing ? <OperationReportDetailTable {...props} /> : null;
}

export function OperationReportDetailTable({ statistics, allMonths = false }: ReportDetailProps) {
  const published = groupPublishedDocuments(statistics);
  const methodNames = new Map(statistics.methods.map(method => [method.id, method.name]));
  const cases = [...statistics.cases].sort((a, b) =>
    a.examinerName.localeCompare(b.examinerName, 'ko') || a.examinerId.localeCompare(b.examinerId)
    || a.monthId.localeCompare(b.monthId) || a.applicationNumber.localeCompare(b.applicationNumber));

  return <table className="adm-report-details">
    <caption className="sr-only">심사관별 출원번호 및 AI 종류별 문헌 평가</caption>
    <thead>
      <tr>
        <th scope="col" rowSpan={2}>심사관</th>
        {allMonths && <th scope="col" rowSpan={2}>운영월</th>}
        <th scope="col" rowSpan={2}>출원번호</th>
        <th scope="col" rowSpan={2}>AI 종류</th>
        <th scope="colgroup" colSpan={2}>AI별 평가</th>
        <th scope="colgroup" colSpan={2}>출원 전체</th>
      </tr>
      <tr>
        <th scope="col">인용여부</th><th scope="col">평균점수</th>
        <th scope="col">인용여부</th><th scope="col">평균점수</th>
      </tr>
    </thead>
    {cases.map(item => {
      const methods = Array.from(published.get(item.id) ?? [], ([id, documents]) => ({
        id, name: methodNames.get(id) ?? documents[0].methodName, ...documentEvaluationTotals(documents),
      }));
      const rows = methods.length ? methods : [undefined];
      return <tbody key={item.id}>{rows.map(method => <tr key={method?.id ?? 'unpublished'}>
        <td>{item.examinerName}{item.division && <><br /><small>{item.division}</small></>}</td>
        {allMonths && <td>{item.monthId}</td>}
        <th scope="row">{item.applicationNumber}</th>
        <td>{method?.name ?? '미입력'}</td>
        <td>{method ? `${method.citedCount}/${method.documentCount}` : '—'}</td>
        <td>{method?.averageScore?.toFixed(2) ?? '—'}</td>
        <td>{item.citedCount}/{item.documentCount}</td>
        <td>{item.averageScore?.toFixed(2) ?? '—'}</td>
      </tr>)}</tbody>;
    })}
    {!cases.length && <tbody><tr><td colSpan={allMonths ? 8 : 7}>선택한 범위에 선정 확정된 출원이 없습니다.</td></tr></tbody>}
  </table>;
}
