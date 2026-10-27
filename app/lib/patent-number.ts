export const SAMPLE_APPLICATION_NUMBER = '1020200093844';

/** Accept formatted domestic application numbers without discarding bad input. */
export function normalizeApplicationNumber(value: string): string | null {
  const input = value.trim();
  if (!/^[\d\s-]+$/.test(input)) return null;
  const digits = input.replace(/[\s-]/g, '');
  return /^(10|20)\d{11}$/.test(digits) ? digits : null;
}

export function applicationNumberLabel(value: string) {
  const normalized = normalizeApplicationNumber(value);
  return normalized
    ? `${normalized.slice(0, 2)}-${normalized.slice(2, 6)}-${normalized.slice(6)}`
    : value.trim();
}

export function fullTextRequest(value: string | undefined, explicitDemo = false) {
  const requested = value?.trim() ?? '';
  if (explicitDemo && !requested) return { requested: SAMPLE_APPLICATION_NUMBER, normalized: SAMPLE_APPLICATION_NUMBER, demo: true };
  return { requested, normalized: normalizeApplicationNumber(requested), demo: explicitDemo && normalizeApplicationNumber(requested) === SAMPLE_APPLICATION_NUMBER };
}
