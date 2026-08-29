export type AmendmentResolutionStatus =
  | 'resolved'
  | 'partially_resolved'
  | 'not_resolved'
  | 'needs_review'
  | 'insufficient';

export type AmendmentGroundResult = {
  provision: string;
  originalClaimNumbers: number[];
  deletedClaimNumbers: number[];
  amendedClaimNumbers: number[];
  remainingClaimNumbers: number[];
  assessment: AmendmentResolutionStatus;
  summary: string;
};

export type AmendmentResolutionSummary = {
  status: AmendmentResolutionStatus;
  headline: string;
  legalGroundResults: AmendmentGroundResult[];
  outcomeLines: string[];
  cautions: string[];
};

export type AmendmentResolutionPayload = {
  summary: AmendmentResolutionSummary | null;
  sendNumber: string;
  sourceDocumentNumbers: string[];
  model?: string;
  version?: string;
  cached: boolean;
  generatedAt?: string;
  error?: string;
};
