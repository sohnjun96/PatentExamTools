import type { ClaimChangeDocument } from './claim-changes';
import type { NoticeSummary } from './notice-analysis';
export function amendmentInputKey(notice: NoticeSummary, documents: ClaimChangeDocument[]) {
  return JSON.stringify({ notice, documents: [...documents].sort((a, b) => a.documentNumber.localeCompare(b.documentNumber)) });
}
export function claimChangesInputKey(documents: ClaimChangeDocument[]) {
  return JSON.stringify([...documents].sort((a, b) => a.documentNumber.localeCompare(b.documentNumber)));
}
export function inputIsCurrent(stored: string | undefined, current: string) { return Boolean(stored && stored === current); }
