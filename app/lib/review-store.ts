import { appDatabase } from '@/app/lib/db';
import { analyzeClaims, buildExaminationRounds, type HistoryLike } from '@/app/lib/examination-model';
import {
  effectiveReviewText,
  type EvidenceLevel,
  type EvidenceRef,
  type ReviewDecisionInput,
  type ReviewEntityType,
  type ReviewItem,
  type ReviewStatus,
} from '@/app/lib/review-model';

type ReviewProposal = {
  entityId: string;
  label: string;
  text: string;
  evidenceLevel: EvidenceLevel;
  sourceRefs: EvidenceRef[];
};

export type IssueProposalInput = {
  issueKey: string;
  roundKey?: string;
  issueType: string;
  title: string;
  description: string;
  evidenceLevel: EvidenceLevel;
  sourceRefs: EvidenceRef[];
  aiPayload?: unknown;
};

export type CaseFoundation = {
  bibliography?: null | { claims?: Array<{ number?: number; text?: string }> };
  history?: HistoryLike[];
  notices?: HistoryLike[];
};

async function runStatementBatches(db: D1Database, statements: D1PreparedStatement[], size = 80) {
  for (let index = 0; index < statements.length; index += size) {
    await db.batch(statements.slice(index, index + size));
  }
}

export async function sha256Text(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function syncCaseReviewFoundation(
  userId: string,
  applicationNumber: string,
  payload: CaseFoundation,
) {
  const db = await appDatabase();
  const claims = (payload.bibliography?.claims ?? [])
    .map((claim, index) => ({ number: Number(claim.number || index + 1), text: claim.text?.trim() ?? '' }))
    .filter((claim) => claim.number > 0 && claim.text);
  const history = payload.history ?? [];
  const notices = payload.notices ?? history.filter((item) => /의견제출통지서/.test(item.title));

  if (claims.length) {
    const analyzedClaims = analyzeClaims(claims);
    const claimsJson = JSON.stringify(analyzedClaims);
    const sourceHash = await sha256Text(claimsJson);
    const latestAmendment = [...history]
      .filter((item) => /보정서/.test(item.title))
      .sort((left, right) => left.date.localeCompare(right.date))
      .at(-1);
    await db.batch([
      db.prepare(
        `UPDATE claim_versions SET is_current = 0, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND application_number = ? AND is_current = 1 AND source_hash != ?`,
      ).bind(userId, applicationNumber, sourceHash),
      db.prepare(
        `INSERT INTO claim_versions (
           user_id, application_number, version_key, source_document_number,
           source_hash, claims_json, is_current
         ) VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(user_id, application_number, version_key) DO UPDATE SET
           source_document_number = excluded.source_document_number,
           source_hash = excluded.source_hash,
           claims_json = excluded.claims_json,
           is_current = 1,
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(
        userId,
        applicationNumber,
        `claims-${sourceHash.slice(0, 24)}`,
        latestAmendment?.documentNumber ?? null,
        sourceHash,
        claimsJson,
      ),
    ]);
  }

  const rounds = buildExaminationRounds(history, notices);
  if (rounds.length) {
    const statements = await Promise.all(rounds.map(async (round) => {
      const documentsJson = JSON.stringify({
        notice: round.notice,
        opinions: round.opinions,
        amendments: round.amendments,
        decisions: round.decisions,
        otherDocuments: round.otherDocuments,
        connectionReason: round.connectionReason,
      });
      const sourceHash = await sha256Text(documentsJson);
      return db.prepare(
        `INSERT INTO examination_rounds (
           user_id, application_number, round_key, round_number,
           notice_document_number, notice_date, documents_json,
           connection_status, source_hash
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, application_number, round_key) DO UPDATE SET
           round_number = excluded.round_number,
           notice_date = excluded.notice_date,
           documents_json = excluded.documents_json,
           connection_status = excluded.connection_status,
           source_hash = excluded.source_hash,
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(
        userId,
        applicationNumber,
        round.notice.documentNumber,
        round.number,
        round.notice.documentNumber,
        round.notice.date,
        documentsJson,
        round.connectionStatus,
        sourceHash,
      );
    }));
    await runStatementBatches(db, statements);
  }
}

export async function saveReviewProposals(
  userId: string,
  applicationNumber: string,
  entityType: ReviewEntityType,
  sourceHash: string,
  proposals: ReviewProposal[],
) {
  if (!proposals.length) return [];
  const db = await appDatabase();
  const statements = proposals.flatMap((proposal) => {
    const initialStatus: ReviewStatus =
      proposal.evidenceLevel === 'unsupported' ||
      proposal.sourceRefs.length === 0 ||
      proposal.sourceRefs.every((reference) => reference.evidenceLevel === 'unsupported')
        ? 'unsupported'
        : 'ai_proposed';
    return [
      db.prepare(
        `INSERT INTO review_decisions (
           user_id, application_number, entity_type, entity_id, label,
           status, original_text, modified_text, reason, source_hash
         ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
         ON CONFLICT(user_id, application_number, entity_type, entity_id) DO UPDATE SET
           label = excluded.label,
           status = CASE
             WHEN review_decisions.source_hash = excluded.source_hash THEN review_decisions.status
             ELSE excluded.status
           END,
           original_text = excluded.original_text,
           modified_text = CASE
             WHEN review_decisions.source_hash = excluded.source_hash THEN review_decisions.modified_text
             ELSE NULL
           END,
           reason = CASE
             WHEN review_decisions.source_hash = excluded.source_hash THEN review_decisions.reason
             ELSE NULL
           END,
           source_hash = excluded.source_hash,
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(
        userId,
        applicationNumber,
        entityType,
        proposal.entityId,
        proposal.label,
        initialStatus,
        proposal.text,
        sourceHash,
      ),
      db.prepare(
        `DELETE FROM evidence_refs
         WHERE user_id = ? AND application_number = ? AND entity_type = ? AND entity_id = ?`,
      ).bind(userId, applicationNumber, entityType, proposal.entityId),
      ...proposal.sourceRefs.map((reference, position) => db.prepare(
        `INSERT INTO evidence_refs (
           user_id, application_number, entity_type, entity_id, position,
           source_type, source_id, locator, excerpt, evidence_level, source_hash
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        userId,
        applicationNumber,
        entityType,
        proposal.entityId,
        position,
        reference.sourceType,
        reference.sourceId,
        reference.locator,
        reference.excerpt,
        reference.evidenceLevel,
        sourceHash,
      )),
    ];
  });
  await runStatementBatches(db, statements);
  return getReviewItems(userId, applicationNumber, entityType, sourceHash);
}

export async function getReviewItems(
  userId: string,
  applicationNumber: string,
  entityType?: ReviewEntityType,
  sourceHash?: string,
) {
  const db = await appDatabase();
  const decisionStatement = db.prepare(
    `SELECT entity_type, entity_id, label, status, original_text, modified_text,
            reason, source_hash, updated_at
     FROM review_decisions
     WHERE user_id = ? AND application_number = ?
       ${entityType ? 'AND entity_type = ?' : ''}
       ${sourceHash ? 'AND source_hash = ?' : ''}
     ORDER BY entity_type, entity_id`,
  );
  const decisionBindings = [userId, applicationNumber, ...(entityType ? [entityType] : []), ...(sourceHash ? [sourceHash] : [])];
  const decisions = await decisionStatement.bind(...decisionBindings)
    .all<{
      entity_type: ReviewEntityType;
      entity_id: string;
      label: string;
      status: ReviewStatus;
      original_text: string;
      modified_text: string | null;
      reason: string | null;
      source_hash: string;
      updated_at: string;
    }>();
  const evidenceStatement = db.prepare(
    `SELECT entity_type, entity_id, source_type, source_id, locator, excerpt, evidence_level
     FROM evidence_refs
     WHERE user_id = ? AND application_number = ?
       ${entityType ? 'AND entity_type = ?' : ''}
       ${sourceHash ? 'AND source_hash = ?' : ''}
     ORDER BY entity_type, entity_id, position`,
  );
  const evidenceBindings = [userId, applicationNumber, ...(entityType ? [entityType] : []), ...(sourceHash ? [sourceHash] : [])];
  const evidence = await evidenceStatement.bind(...evidenceBindings)
    .all<{
      entity_type: ReviewEntityType;
      entity_id: string;
      source_type: EvidenceRef['sourceType'];
      source_id: string;
      locator: string;
      excerpt: string;
      evidence_level: EvidenceLevel;
    }>();
  const refs = new Map<string, EvidenceRef[]>();
  for (const row of evidence.results) {
    const key = `${row.entity_type}:${row.entity_id}`;
    refs.set(key, [...(refs.get(key) ?? []), {
      sourceType: row.source_type,
      sourceId: row.source_id,
      locator: row.locator,
      excerpt: row.excerpt,
      evidenceLevel: row.evidence_level,
    }]);
  }
  return decisions.results.map((row) => {
    const item: ReviewItem = {
      entityType: row.entity_type,
      entityId: row.entity_id,
      label: row.label,
      text: row.modified_text && row.status === 'modified' ? row.modified_text : row.original_text,
      originalText: row.original_text,
      modifiedText: row.modified_text,
      evidenceLevel: 'unsupported',
      sourceRefs: refs.get(`${row.entity_type}:${row.entity_id}`) ?? [],
      reviewStatus: row.status,
      reason: row.reason,
      sourceHash: row.source_hash,
      updatedAt: row.updated_at,
    };
    item.evidenceLevel = item.sourceRefs.some((reference) => reference.evidenceLevel === 'explicit')
      ? 'explicit'
      : item.sourceRefs.some((reference) => reference.evidenceLevel === 'inferred')
        ? 'inferred'
        : 'unsupported';
    item.text = effectiveReviewText(item);
    return item;
  });
}

export async function getReviewWorkspace(userId: string, applicationNumber: string) {
  const db = await appDatabase();
  const [items, claimVersion, rounds, issues] = await Promise.all([
    getReviewItems(userId, applicationNumber),
    db.prepare(
      `SELECT id, version_key, source_document_number, source_hash, claims_json, updated_at
       FROM claim_versions
       WHERE user_id = ? AND application_number = ? AND is_current = 1
       ORDER BY updated_at DESC LIMIT 1`,
    ).bind(userId, applicationNumber).first<{
      id: number;
      version_key: string;
      source_document_number: string | null;
      source_hash: string;
      claims_json: string;
      updated_at: string;
    }>(),
    db.prepare(
      `SELECT id, round_key, round_number, notice_document_number, notice_date,
              documents_json, connection_status, source_hash, updated_at
       FROM examination_rounds
       WHERE user_id = ? AND application_number = ?
       ORDER BY round_number`,
    ).bind(userId, applicationNumber).all<{
      id: number;
      round_key: string;
      round_number: number;
      notice_document_number: string;
      notice_date: string;
      documents_json: string;
      connection_status: 'linked' | 'needs_confirmation';
      source_hash: string;
      updated_at: string;
    }>(),
    db.prepare(
      `SELECT issue_key, examination_round_id, issue_type, title, description,
              review_status, source_hash, updated_at
       FROM issues
       WHERE user_id = ? AND application_number = ?
       ORDER BY updated_at DESC`,
    ).bind(userId, applicationNumber).all<{
      issue_key: string;
      examination_round_id: number | null;
      issue_type: string;
      title: string;
      description: string;
      review_status: ReviewStatus;
      source_hash: string;
      updated_at: string;
    }>(),
  ]);
  const counts = items.reduce<Record<ReviewStatus, number>>((result, item) => {
    result[item.reviewStatus] += 1;
    return result;
  }, {
    ai_proposed: 0,
    reviewing: 0,
    confirmed: 0,
    modified: 0,
    rejected: 0,
    unsupported: 0,
  });
  return {
    applicationNumber,
    claimVersion: claimVersion ? {
      id: claimVersion.id,
      versionKey: claimVersion.version_key,
      sourceDocumentNumber: claimVersion.source_document_number,
      sourceHash: claimVersion.source_hash,
      claims: JSON.parse(claimVersion.claims_json) as unknown[],
      updatedAt: claimVersion.updated_at,
    } : null,
    examinationRounds: rounds.results.map((round) => ({
      id: round.id,
      roundKey: round.round_key,
      roundNumber: round.round_number,
      noticeDocumentNumber: round.notice_document_number,
      noticeDate: round.notice_date,
      documents: JSON.parse(round.documents_json) as unknown,
      connectionStatus: round.connection_status,
      sourceHash: round.source_hash,
      updatedAt: round.updated_at,
    })),
    issues: issues.results.map((issue) => ({
      issueKey: issue.issue_key,
      examinationRoundId: issue.examination_round_id,
      issueType: issue.issue_type,
      title: issue.title,
      description: issue.description,
      reviewStatus: issue.review_status,
      sourceHash: issue.source_hash,
      updatedAt: issue.updated_at,
    })),
    reviewItems: items,
    reviewCounts: counts,
    approvedCount: counts.confirmed + counts.modified,
  };
}

export async function saveIssueProposal(
  userId: string,
  applicationNumber: string,
  issue: IssueProposalInput,
) {
  const db = await appDatabase();
  const sourceHash = await sha256Text(JSON.stringify({
    issueType: issue.issueType,
    title: issue.title,
    description: issue.description,
    sourceRefs: issue.sourceRefs,
  }));
  const initialStatus: ReviewStatus =
    issue.evidenceLevel === 'unsupported' ||
    issue.sourceRefs.length === 0 ||
    issue.sourceRefs.every((reference) => reference.evidenceLevel === 'unsupported')
      ? 'unsupported'
      : 'ai_proposed';
  await db.prepare(
    `INSERT INTO issues (
       user_id, application_number, issue_key, examination_round_id,
       issue_type, title, description, ai_payload_json, source_hash, review_status
     ) VALUES (
       ?, ?, ?,
       (SELECT id FROM examination_rounds
        WHERE user_id = ? AND application_number = ? AND round_key = ? LIMIT 1),
       ?, ?, ?, ?, ?, ?
     )
     ON CONFLICT(user_id, application_number, issue_key) DO UPDATE SET
       examination_round_id = excluded.examination_round_id,
       issue_type = excluded.issue_type,
       title = excluded.title,
       description = excluded.description,
       ai_payload_json = excluded.ai_payload_json,
       review_status = CASE
         WHEN issues.source_hash = excluded.source_hash THEN issues.review_status
         ELSE excluded.review_status
       END,
       source_hash = excluded.source_hash,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    userId,
    applicationNumber,
    issue.issueKey,
    userId,
    applicationNumber,
    issue.roundKey ?? '',
    issue.issueType,
    issue.title,
    issue.description,
    issue.aiPayload === undefined ? null : JSON.stringify(issue.aiPayload),
    sourceHash,
    initialStatus,
  ).run();
  const [reviewItem] = await saveReviewProposals(
    userId,
    applicationNumber,
    'issue',
    sourceHash,
    [{
      entityId: issue.issueKey,
      label: issue.title,
      text: issue.description,
      evidenceLevel: issue.evidenceLevel,
      sourceRefs: issue.sourceRefs,
    }],
  );
  return reviewItem ?? null;
}

export async function updateReviewDecision(userId: string, input: ReviewDecisionInput) {
  const db = await appDatabase();
  const modifiedText = input.status === 'modified' ? input.modifiedText?.trim() : null;
  const reason = input.reason?.trim() || null;
  await db.prepare(
    `UPDATE review_decisions SET
       status = ?, modified_text = ?, reason = ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND application_number = ? AND entity_type = ? AND entity_id = ?`,
  ).bind(
    input.status,
    modifiedText,
    reason,
    userId,
    input.applicationNumber,
    input.entityType,
    input.entityId,
  ).run();
  if (input.entityType === 'issue') {
    await db.prepare(
      `UPDATE issues SET review_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND application_number = ? AND issue_key = ?`,
    ).bind(input.status, userId, input.applicationNumber, input.entityId).run();
  }
  if (input.entityType === 'claim_feature') {
    await db.prepare(
      `UPDATE claim_features SET review_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND application_number = ? AND feature_key = ?`,
    ).bind(input.status, userId, input.applicationNumber, input.entityId).run();
  }
  return (await getReviewItems(userId, input.applicationNumber, input.entityType))
    .find((item) => item.entityId === input.entityId) ?? null;
}
