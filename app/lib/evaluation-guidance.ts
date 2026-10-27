import type { RankValue } from './evaluation';

export type RankableMethod = { id: string; available: boolean };
export type RankOption = { value: Exclude<RankValue, null>; label: string; disabled?: boolean };

function rankName(value: Exclude<RankValue, null>) {
  return typeof value === 'number' ? `${value}위` : value === 'unranked' ? '순위 외' : value === 'excluded' ? '평가 제외' : '비교 불가';
}

export function rankOptionsFor(methodId: string, methods: RankableMethod[], values: Record<string, RankValue>): RankOption[] {
  if (!methods.some((method) => method.id === methodId && method.available)) return [];
  // Choosing a rank includes this method again when it was previously excluded.
  const compared = methods.filter((method) => method.available && (method.id === methodId || values[method.id] !== 'excluded'));
  const options: RankOption[] = Array.from({ length: compared.length > 1 ? Math.min(3, compared.length) : 0 }, (_, index) => {
    const value = index + 1 as 1 | 2 | 3;
    const taken = compared.some((method) => method.id !== methodId && values[method.id] === value);
    return { value, label: taken ? `${value}위 (다른 방식에서 선택)` : `${value}위`, disabled: taken };
  });
  if (compared.length > 3) options.push({ value: 'unranked', label: '순위 외' });
  if (compared.length === 1) options.push({ value: 'incomparable', label: '비교 불가' });
  options.push({ value: 'excluded', label: '평가 제외' });
  const current = values[methodId];
  if (current != null && !options.some((option) => option.value === current)) {
    // Changing another method's exclusion must not silently replace this input.
    options.unshift({ value: current, label: `${rankName(current)} (다시 선택해 주세요)`, disabled: true });
  }
  return options;
}

export function rankingGuidance(methods: RankableMethod[], values: Record<string, RankValue>) {
  const available = methods.filter((method) => method.available);
  const compared = available.filter((method) => values[method.id] !== 'excluded').length;
  const pending = methods.length - available.length;
  const lines: string[] = [];
  if (!available.length) lines.push('AI 검색 결과가 공개되면 품질 순위를 선택할 수 있습니다.');
  else if (!compared) lines.push('모든 방식이 평가 제외 상태입니다. 비교할 방식의 평가 제외를 해제해 주세요.');
  else if (compared === 1) lines.push('비교할 방식이 1개입니다. 남은 방식은 비교 불가로 선택해 주세요.');
  else if (compared < 4) lines.push(`비교할 방식이 ${compared}개입니다. 동순위 없이 1위부터 ${compared}위까지 선택해 주세요.`);
  else lines.push(`비교할 방식이 ${compared}개입니다. 상위 3개는 1~3위, 나머지는 순위 외로 선택해 주세요.`);
  if (available.length && compared) lines.push('비교하지 않을 방식만 평가 제외로 선택해 주세요.');
  if (pending && available.length) lines.push(`AI ${pending}개 방식의 결과가 대기 중입니다. 결과가 공개되면 순위를 선택할 수 있습니다.`);
  return lines;
}
