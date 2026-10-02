export type AnalysisBasis = {
  caseHistoryKey: string;
  caseFetchedAt: string;
  fullTextHash: string;
  fullTextFetchedAt: string;
  sourceFileName: string;
  claimNumbers: number[];
  sourceScope?: 'full' | 'partial';
};
export type BasisStatus = 'current' | 'changed' | 'unverified';

export function caseHistoryKey(history: Array<{ documentNumber: string; date: string; title: string }>) {
  return JSON.stringify(history.map((item) => [item.documentNumber.replace(/\D/g, ''), item.date.replace(/\D/g, ''), item.title.trim()])
    .sort((a, b) => a.join('|').localeCompare(b.join('|'))));
}

export function analysisBasisStatus(basis: AnalysisBasis | undefined, history: Array<{ documentNumber: string; date: string; title: string }>, fullTextHash?: string): BasisStatus {
  if (!basis?.caseHistoryKey || !basis.fullTextHash) return 'unverified';
  if (basis.caseHistoryKey !== caseHistoryKey(history) || (fullTextHash && basis.fullTextHash !== fullTextHash)) return 'changed';
  return 'current';
}

export function formatAnalysisDate(value: string | undefined) {
  if (!value) return '기록 없음';
  const date = new Date(/^[\d-]+ [\d:]+$/.test(value) ? value.replace(' ', 'T') + 'Z' : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
