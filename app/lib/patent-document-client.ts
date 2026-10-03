import type { ClaimLike } from './examination-model';
import { createSingleFlight } from './document-cache-core';
import { FULLTEXT_PARSER_VERSION } from './fulltext-version';

export type FullTextDocument = {
  applicationNumber: string; title: string;
  abstract: Array<{ number: string | null; text: string }>;
  sections: Array<{ id: string; title: string; paragraphs: Array<{ number: string | null; text: string }> }>;
  claims: ClaimLike[]; sourceFileName: string; sourceFileUrl?: string;
  sourceHash?: string; fetchedAt?: string; parserVersion?: string; cached?: boolean; isDemo?: boolean; figureCount?: number;
  usage?: { total: number; startedAt: string; lastCalledAt: string | null; byOperation: Record<string, number> };
};

const documents = new Map<string, FullTextDocument>();
const singleFlight = createSingleFlight();

export function invalidateFullText(applicationNumber: string) { documents.delete(applicationNumber); }

export function fetchFullText(applicationNumber: string, refresh = false, cachedOnly = false): Promise<FullTextDocument> {
  const stored = documents.get(applicationNumber);
  if (!refresh && stored && (stored.isDemo || stored.parserVersion === FULLTEXT_PARSER_VERSION)) return Promise.resolve(stored);
  return singleFlight(`${applicationNumber}:${refresh}:${cachedOnly}`, async () => {
    const params = new URLSearchParams({ applicationNumber });
    if (refresh) params.set('refresh', 'true');
    if (cachedOnly) params.set('cachedOnly', 'true');
    const response = await fetch(`/api/patent/fulltext?${params}`, { cache: 'no-store' });
    const payload = await response.json() as FullTextDocument & { error?: string };
    if (!response.ok) throw new Error(payload.error || '전문 원문을 불러오지 못했습니다.');
    if (!Array.isArray(payload.sections) || !Array.isArray(payload.claims)) throw new Error('전문 원문 형식을 확인할 수 없습니다.');
    documents.delete(applicationNumber);
    documents.set(applicationNumber, payload);
    while (documents.size > 3) documents.delete(documents.keys().next().value!);
    return payload;
  });
}
