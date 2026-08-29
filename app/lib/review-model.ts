export const REVIEW_STATUSES = [
  'ai_proposed',
  'reviewing',
  'confirmed',
  'modified',
  'rejected',
  'unsupported',
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export type EvidenceLevel = 'explicit' | 'inferred' | 'unsupported';
export type ReviewEntityType = 'summary' | 'issue' | 'claim_feature' | 'candidate_document';

export type EvidenceRef = {
  sourceType: 'claim' | 'specification' | 'abstract' | 'drawing' | 'notice' | 'opinion' | 'amendment' | 'document';
  sourceId: string;
  locator: string;
  excerpt: string;
  evidenceLevel: EvidenceLevel;
};

export type ReviewItem = {
  entityType: ReviewEntityType;
  entityId: string;
  label: string;
  text: string;
  originalText: string;
  modifiedText: string | null;
  evidenceLevel: EvidenceLevel;
  sourceRefs: EvidenceRef[];
  reviewStatus: ReviewStatus;
  reason: string | null;
  sourceHash: string;
  updatedAt: string;
};

export type ClaimVersionRecord = {
  id: number;
  versionKey: string;
  sourceDocumentNumber: string | null;
  sourceHash: string;
  claims: unknown[];
  updatedAt: string;
};

export type ExaminationRoundRecord = {
  id: number;
  roundKey: string;
  roundNumber: number;
  noticeDocumentNumber: string;
  noticeDate: string;
  documents: unknown;
  connectionStatus: 'linked' | 'needs_confirmation';
  sourceHash: string;
  updatedAt: string;
};

export type IssueRecord = {
  issueKey: string;
  examinationRoundId: number | null;
  issueType: string;
  title: string;
  description: string;
  reviewStatus: ReviewStatus;
  sourceHash: string;
  updatedAt: string;
};

export type ClaimFeatureRecord = {
  featureKey: string;
  claimVersionId: number;
  claimNumber: number;
  featureText: string;
  relation: unknown;
  reviewStatus: ReviewStatus;
  sourceHash: string;
};

export type SearchStrategyVersionRecord = {
  versionNumber: number;
  strategy: unknown;
  sourceHash: string;
  createdAt: string;
};

export type CandidateDocumentRecord = {
  documentKey: string;
  document: unknown;
  reviewStatus: ReviewStatus;
  updatedAt: string;
};

export type ReviewDecisionInput = {
  applicationNumber: string;
  entityType: ReviewEntityType;
  entityId: string;
  status: Exclude<ReviewStatus, 'ai_proposed' | 'unsupported'>;
  modifiedText?: string;
  reason?: string;
};

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === 'string' && REVIEW_STATUSES.includes(value as ReviewStatus);
}

export function isApprovedReviewStatus(status: ReviewStatus) {
  return status === 'confirmed' || status === 'modified';
}

export function effectiveReviewText(item: Pick<ReviewItem, 'originalText' | 'modifiedText' | 'reviewStatus'>) {
  return item.reviewStatus === 'modified' && item.modifiedText?.trim()
    ? item.modifiedText.trim()
    : item.originalText;
}
