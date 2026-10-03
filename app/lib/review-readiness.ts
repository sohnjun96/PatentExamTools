import { analysisBasisStatus, type AnalysisBasis, type BasisStatus } from './analysis-provenance';
import { amendmentInputKey, claimChangesInputKey, inputIsCurrent } from './analysis-input-key';
import type { ExaminationRound, HistoryLike } from './examination-model';
import type { ClaimChangeDocument } from './claim-changes';
import type { NoticeAnalysis } from './notice-analysis';
import type { AmendmentResolutionPayload } from './amendment-resolution';
export function reviewReadiness(input: {
  history: HistoryLike[]; fullTextHash?: string; fullTextParserVersion?: string; summary: { summary: unknown; sourceBasis?: AnalysisBasis; basisStatus?: BasisStatus } | null;
  rounds: ExaminationRound[]; notices: Record<string, NoticeAnalysis>; resolutions: Record<string, AmendmentResolutionPayload>;
  documents: ClaimChangeDocument[]; changeSummary: { summary: unknown; inputKey?: string } | null;
}) {
  const basis = input.summary?.basisStatus === 'changed' ? 'changed' : input.summary?.summary ? analysisBasisStatus(input.summary.sourceBasis, input.history, input.fullTextHash, input.fullTextParserVersion) : 'unverified';
  const technology = Boolean(input.summary?.summary && basis === 'current');
  const notices = input.rounds.every((round) => input.notices[round.notice.documentNumber]?.basisStatus === 'current');
  const amendmentRounds = input.rounds.filter((round) => round.amendments.length);
  const documents = input.documents.filter((document) => amendmentRounds.some((round) => round.amendments.some((item) => item.documentNumber === document.documentNumber)));
  const changes = !amendmentRounds.length || Boolean(input.changeSummary?.summary && inputIsCurrent(input.changeSummary.inputKey, claimChangesInputKey(documents)));
  const amendments = !amendmentRounds.length || (changes && amendmentRounds.every((round) => {
    const related = documents.filter((document) => round.amendments.some((item) => item.documentNumber === document.documentNumber));
    const notice = input.notices[round.notice.documentNumber];
    const result = input.resolutions[round.notice.documentNumber];
    return round.connectionStatus === 'linked' && related.length === round.amendments.length && notice?.basisStatus === 'current' && result?.summary
      && inputIsCurrent(result.inputKey, amendmentInputKey(notice.summary, related));
  }));
  return { basis, technology, notices, amendments, changes, complete: technology && notices && amendments };
}
