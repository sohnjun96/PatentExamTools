type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function plainText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join(' ');
  return Object.entries(asRecord(value))
    .filter(([key]) => !key.startsWith('@_') && key !== '?xml')
    .map(([, child]) => plainText(child))
    .filter(Boolean)
    .join(' ');
}

function tagName(value: string) {
  return value.split(':').at(-1)?.toLowerCase() ?? value.toLowerCase();
}

function referenceNodes(value: unknown, found: unknown[] = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => referenceNodes(item, found));
    return found;
  }
  if (!value || typeof value !== 'object') return found;

  for (const [key, child] of Object.entries(asRecord(value))) {
    if (['claim-ref', 'claim-reference', 'claimref'].includes(tagName(key))) {
      if (Array.isArray(child)) found.push(...child);
      else found.push(child);
    }
    referenceNodes(child, found);
  }
  return found;
}

function expandRange(start: number, end: number) {
  if (!(start > 0 && end >= start && end - start <= 100)) return [];
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function numbersFromText(value: string) {
  const numbers: number[] = [];
  for (const match of value.matchAll(
    /(?:청구항\s*)?(?:제\s*)?(\d+)\s*항?\s*(?:내지|부터|to|through|~|〜|–|—|-)\s*(?:제\s*)?(\d+)\s*항?/giu,
  )) {
    numbers.push(...expandRange(Number(match[1]), Number(match[2])));
  }
  for (const match of value.matchAll(/(?:청구항\s*(?:제\s*)?|제\s*|claim\s*)(\d+)\s*항?/giu)) {
    numbers.push(Number(match[1]));
  }
  if (numbers.length === 0 && /^\s*\d+\s*$/u.test(value)) numbers.push(Number(value.trim()));
  return numbers;
}

function numbersFromAttributes(value: unknown) {
  return Object.entries(asRecord(value)).flatMap(([key, attribute]) => {
    if (!key.startsWith('@_') || !/(?:idref|ref|claim|num)/iu.test(key)) return [];
    const matches = String(attribute ?? '').match(/\d+/g) ?? [];
    const candidate = matches.at(-1);
    return candidate ? [Number(candidate)] : [];
  });
}

/**
 * KIPO 전문 XML의 구조화된 claim-ref를 우선 읽는다. 태그가 없는 구형 XML은
 * 호출부의 청구항 문언 파서가 보완하므로 여기서는 명시된 참조만 반환한다.
 */
export function extractClaimReferenceNumbers(claim: unknown) {
  const references = referenceNodes(claim).flatMap((node) => [
    ...numbersFromText(plainText(node)),
    ...numbersFromAttributes(node),
  ]);
  return [...new Set(references.filter((number) => Number.isInteger(number) && number > 0))]
    .sort((left, right) => left - right);
}
