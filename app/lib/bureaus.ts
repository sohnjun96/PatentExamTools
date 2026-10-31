export const BUREAUS = ['기획국', '융합국', '전기국', '화학국', '기계국', '반도체단'] as const;
export const SAMPLE_BUREAU = '샘플';
export type Bureau = typeof BUREAUS[number] | typeof SAMPLE_BUREAU;

export function parseBureau(value: unknown): Bureau | null {
  return typeof value === 'string' && (value === SAMPLE_BUREAU || (BUREAUS as readonly string[]).includes(value)) ? value as Bureau : null;
}

// Vinext can supply an encoded segment, while Next supplies a decoded segment.
export function parseBureauRoute(value: unknown): Bureau | null {
  if (typeof value !== 'string') return null;
  try { return parseBureau(decodeURIComponent(value)); } catch { return null; }
}

export function bureauPath(bureau?: Bureau | null, admin = false) {
  return bureau ? `/${bureau}${admin ? '/rhksfl' : ''}` : admin ? '/admin' : '/';
}

export function evaluationApiUrl(bureau?: Bureau | null, admin = false, userId = '') {
  const query = new URLSearchParams(admin ? { admin: '1' } : { userId });
  if (bureau) query.set('bureau', bureau);
  return `/api/evaluation?${query}`;
}
