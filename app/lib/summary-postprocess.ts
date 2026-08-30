type EvidenceItem = {
  key: string;
  text: string;
  [key: string]: unknown;
};

export type SummaryForPostProcessing = {
  oneLine: string;
  technicalProblem: string;
  solution: string;
  operationFlow: string[];
  keyElements: string[];
  effects: string[];
  independentClaimSummary: string;
  dependentClaimGroups: Array<{ claimNumbers: number[]; addition: string }>;
  claimOverview: string;
  examinationPoints: string[];
  searchKeywords: string[];
  cautions: string[];
  evidenceItems: EvidenceItem[];
};

const DIRECTIVE_SENTENCE = /(?:원문|명세서|청구항|초록).{0,18}(?:확인|검토)(?:해야|할 필요|가 필요)|(?:확인|검토)(?:해야 합니다|하여야 합니다|할 필요가 있습니다|가 필요합니다)/u;

function normalizeKorean(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/목적로\s+(한다|하였다|하는)/g, '목적으로 $1')
    .replace(/것을\s+목적한다/g, '것을 목적으로 한다')
    .replace(/필요없는/g, '필요 없는')
    .replace(/위상지연/g, '위상 지연')
    .trim();
}

function comparable(value: string) {
  return normalizeKorean(value).toLocaleLowerCase('ko-KR').replace(/[^0-9a-z가-힣]/giu, '');
}

function cleanText(value: string, maxLength: number, removeDirectives = true) {
  const normalized = normalizeKorean(value);
  if (!normalized) return '';
  const parts = normalized.match(/[^.!?。]+[.!?。]?/gu) ?? [normalized];
  const seen = new Set<string>();
  const selected = parts.filter((part) => {
    const sentence = part.trim();
    if (!sentence || (removeDirectives && DIRECTIVE_SENTENCE.test(sentence))) return false;
    const key = comparable(sentence);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const result = selected.join(' ').trim();
  if (result.length <= maxLength) return result;
  return `${result.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function cleanList(values: string[], maxItems: number, maxLength: number, removeDirectives = true) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value, maxLength, removeDirectives);
    const key = comparable(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= maxItems) break;
  }
  return result;
}

function summaryText(summary: SummaryForPostProcessing, key: string) {
  if (key === 'oneLine' || key === 'technicalProblem' || key === 'solution'
    || key === 'independentClaimSummary' || key === 'claimOverview') return summary[key];
  const indexed = key.match(/^(operationFlow|keyElements|effects|examinationPoints)\.(\d+)$/u);
  if (indexed) return summary[indexed[1] as 'operationFlow'][Number(indexed[2])] ?? '';
  const dependent = key.match(/^dependentClaimGroups\.(\d+)$/u);
  if (dependent) return summary.dependentClaimGroups[Number(dependent[1])]?.addition ?? '';
  return '';
}

export function postProcessSummary<T extends SummaryForPostProcessing>(input: T): T {
  const summary: SummaryForPostProcessing = {
    ...input,
    oneLine: cleanText(input.oneLine, 200),
    technicalProblem: cleanText(input.technicalProblem, 300),
    solution: cleanText(input.solution, 450),
    operationFlow: cleanList(input.operationFlow, 5, 100),
    keyElements: cleanList(input.keyElements, 6, 120),
    effects: cleanList(input.effects, 3, 180),
    independentClaimSummary: cleanText(input.independentClaimSummary, 300),
    dependentClaimGroups: input.dependentClaimGroups.slice(0, 5).map((group) => ({
      claimNumbers: [...new Set(group.claimNumbers.filter((number) => Number.isInteger(number) && number > 0))].slice(0, 15),
      addition: cleanText(group.addition, 220),
    })).filter((group) => group.claimNumbers.length > 0 && group.addition),
    claimOverview: cleanText(input.claimOverview, 380),
    examinationPoints: cleanList(input.examinationPoints, 5, 200),
    searchKeywords: cleanList(input.searchKeywords, 10, 100, false),
    cautions: cleanList(input.cautions, 3, 180, false),
    evidenceItems: [],
  };
  summary.evidenceItems = input.evidenceItems.map((item) => ({
    ...item,
    text: summaryText(summary, item.key) || cleanText(item.text, 600, false),
  }));
  return summary as T;
}
