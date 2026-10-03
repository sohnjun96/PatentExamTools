import type { ClaimChangeDocument } from './claim-changes';

export type VersionClaim = { number: number; text: string };
export type DocumentClaimVersion = {
  documentNumber: string;
  before: VersionClaim[];
  after: VersionClaim[];
  beforeComplete: boolean;
  afterComplete: boolean;
  changedClaimNumbers: number[];
};

/** Replay API changes only. Today's XML must never seed an older version. */
export function buildDocumentClaimVersions(
  documents: ClaimChangeDocument[],
  initialDocumentNumbers: string[] = [],
): DocumentClaimVersion[] {
  const initial = new Set(initialDocumentNumbers);
  const state = new Map<number, VersionClaim>();
  let complete = false;
  const ordered = [...documents].sort((a, b) => a.serialNumber - b.serialNumber || a.documentNumber.localeCompare(b.documentNumber));
  return ordered.map((document) => {
    const isBaseline = initial.has(document.documentNumber);
    if (isBaseline) { state.clear(); complete = true; }
    const before = new Map(state);
    let beforeComplete = !isBaseline && complete;
    for (const change of document.changes) {
      const inserted = change.changeTypeCode === 'I' || /신규|추가/u.test(change.changeTypeName);
      const deleted = change.changeTypeCode === 'D' || /삭제/u.test(change.changeTypeName);
      const previous = change.previousClaimText?.trim();
      if (inserted) before.delete(change.claimNumber);
      else if (previous) {
        if (before.has(change.claimNumber) && before.get(change.claimNumber)?.text !== previous) beforeComplete = false;
        before.set(change.claimNumber, { number: change.claimNumber, text: previous });
      } else if (!before.has(change.claimNumber) && !isBaseline) beforeComplete = false;
      if (deleted) state.delete(change.claimNumber);
      else if (change.claimText.trim()) state.set(change.claimNumber, { number: change.claimNumber, text: change.claimText.trim() });
      else { state.delete(change.claimNumber); complete = false; }
    }
    if (!isBaseline && !beforeComplete) complete = false;
    const order = (value: Map<number, VersionClaim>) => [...value.values()].map((claim) => ({ ...claim })).sort((a, b) => a.number - b.number);
    return {
      documentNumber: document.documentNumber,
      before: order(before), after: order(state),
      beforeComplete, afterComplete: complete,
      changedClaimNumbers: [...new Set(document.changes.map((change) => change.claimNumber))].sort((a, b) => a - b),
    };
  });
}
