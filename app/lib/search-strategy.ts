export type SearchRole = '핵심 검색' | '조합 검색' | '일반 구성' | '검색 제외' | '확인 필요';
export type SearchFeature = { id: string; label: string; text: string; role: SearchRole };
export type SearchOptions = { includeTitle: boolean; cpcCodes: string[]; customExpression: string; useCustomExpression?: boolean };
export const DEFAULT_SEARCH_OPTIONS: SearchOptions = { includeTitle: false, cpcCodes: [], customExpression: '' };

const key = (value: string) => value.toLocaleLowerCase('ko-KR').replace(/[^a-z0-9가-힣]/gu, '');
export function keywordMatchesFeature(keyword: string, feature: SearchFeature) {
  const word = key(keyword);
  return word.length >= 2 && (key(feature.label).includes(word) || key(feature.text).includes(word) || word.includes(key(feature.label)));
}
export function allowedSearchKeywords(features: SearchFeature[], keywords: string[]) {
  const excluded = features.filter((feature) => feature.role === '검색 제외' || feature.role === '확인 필요');
  return [...new Set(keywords.map((word) => word.trim()).filter(Boolean))]
    .filter((word) => !excluded.some((feature) => keywordMatchesFeature(word, feature)));
}
export function buildKeywordGroups(
  data: { title: string; titleEnglish?: string },
  features: SearchFeature[], keywords: string[], options: SearchOptions = DEFAULT_SEARCH_OPTIONS,
) {
  const allowed = allowedSearchKeywords(features, keywords);
  const searchable = features.filter((feature) => feature.role !== '검색 제외' && feature.role !== '확인 필요');
  const groups = searchable.map((feature) => ({
    name: `${feature.id} · ${feature.role}`,
    terms: [...new Set([feature.label, ...allowed.filter((word) => keywordMatchesFeature(word, feature))])].filter(Boolean),
  }));
  const unassigned = allowed.filter((word) => !searchable.some((feature) => keywordMatchesFeature(word, feature)));
  if (unassigned.length) groups.push({ name: '직접 선택한 용어', terms: unassigned });
  if (options.includeTitle) groups.unshift({ name: '발명의 명칭', terms: [data.title, data.titleEnglish ?? ''].filter(Boolean) });
  return groups;
}
export function buildSearchExpression(
  data: { title: string; titleEnglish?: string }, features: SearchFeature[], keywords: string[],
  options: SearchOptions = DEFAULT_SEARCH_OPTIONS,
) {
  if (options.useCustomExpression || options.customExpression.trim()) return options.customExpression.trim();
  const groups = buildKeywordGroups(data, features, keywords, options);
  const quoted = (term: string) => `"${term.replace(/["\\]/g, ' ').trim()}"`;
  return [...groups.map((group) => `(${group.terms.map(quoted).join(' OR ')})`),
    ...(options.cpcCodes.length ? [`(${options.cpcCodes.map((code) => `CPC=${code.replace(/\s+/g, '')}`).join(' OR ')})`] : []),
  ].join('\nAND\n');
}
