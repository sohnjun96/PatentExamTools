export type NoticeRejectionGround = {
  provision: string;
  claimNumbers: number[];
  reason: string;
};

export type NoticeSummary = {
  oneLine: string;
  rejectionGrounds: NoticeRejectionGround[];
  allowableClaims: number[];
  keyIssues: string[];
  affectedClaims: string[];
  citedReferences: string[];
  deadlines: string[];
  requiredActions: string[];
  cautions: string[];
};

export type NoticeAnalysis = {
  markdown: string;
  summary: NoticeSummary;
  parser: 'kordoc' | 'openai-pdf';
  model: string;
  cached: boolean;
  generatedAt: string;
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
};
