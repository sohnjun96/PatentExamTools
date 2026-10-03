import { appDatabase, getPatentCase, WORKSPACE_USER_ID } from './db';
import { caseHistoryKey } from './analysis-provenance';
import { type HistoryLike, type RoundDocumentLink, classifyAmendmentDocument } from './examination-model';
import { HttpError } from './http';
import { buildDocumentClaimVersions } from './claim-version-model';
import type { ClaimChangeHistory } from './claim-changes';

export async function storedRoundLinks(applicationNumber: string, history: HistoryLike[]) {
  const db = await appDatabase();
  const rows = await db.prepare('SELECT links_json, history_key, updated_at FROM round_document_links WHERE user_id = ? AND application_number = ?')
    .bind(WORKSPACE_USER_ID, applicationNumber).all<{ links_json: string; history_key: string; updated_at: string }>();
  return rows.results.filter((row) => row.history_key === caseHistoryKey(history))
    .map((row) => ({ ...JSON.parse(row.links_json) as RoundDocumentLink, updatedAt: row.updated_at }));
}
export async function workflowCase(applicationNumber: string) {
  if (!/^(10|20)\d{11}$/.test(applicationNumber)) throw new HttpError(400, '출원번호 13자리를 확인해 주세요.');
  const stored = await getPatentCase<{ history?: HistoryLike[]; notices?: HistoryLike[] }>(WORKSPACE_USER_ID, applicationNumber);
  if (!stored) throw new HttpError(404, '먼저 사건을 조회해 주세요.');
  return stored;
}
export async function saveRoundLink(applicationNumber: string, input: RoundDocumentLink, verified: Set<string>) {
  const stored = await workflowCase(applicationNumber);
  const history = stored.payload.history ?? [];
  const currentKey = caseHistoryKey(history);
  if (input.historyKey !== currentKey) throw new HttpError(409, '접수 이력이 변경되었습니다. 최신 사건자료에서 문서 연결을 다시 확인해 주세요.');
  if (!history.some((item) => item.documentNumber === input.noticeNumber && /의견제출통지서/.test(item.title))) throw new HttpError(400, '통지서를 확인해 주세요.');
  const validate = (numbers: string[], predicate: (item: HistoryLike) => boolean) => {
    if (!Array.isArray(numbers) || numbers.length > 40 || numbers.some((number) => !history.some((item) => item.documentNumber === number && predicate(item)))) throw new HttpError(400, '연결할 문서의 종류와 번호를 확인해 주세요.');
    return [...new Set(numbers)];
  };
  const value = { ...input,
    opinionNumbers: validate(input.opinionNumbers, (item) => /의견서|답변서|소명서/.test(item.title)),
    amendmentNumbers: validate(input.amendmentNumbers, (item) => classifyAmendmentDocument(item) === 'claims' || (classifyAmendmentDocument(item) === 'unknown' && verified.has(item.documentNumber))),
    decisionNumbers: validate(input.decisionNumbers, (item) => /거절결정|특허결정|등록결정|심결|결정서/.test(item.title)),
  };
  const other = (await storedRoundLinks(applicationNumber, history)).filter((link) => link.noticeNumber !== input.noticeNumber);
  const taken = new Set(other.flatMap((link) => [...link.opinionNumbers, ...link.amendmentNumbers, ...link.decisionNumbers]));
  if ([...value.opinionNumbers, ...value.amendmentNumbers, ...value.decisionNumbers].some((number) => taken.has(number))) throw new HttpError(409, '다른 회차에 연결된 문서입니다. 해당 회차의 연결을 먼저 수정해 주세요.');
  const db = await appDatabase();
  await db.prepare(`INSERT INTO round_document_links (user_id, application_number, notice_number, links_json, history_key)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, application_number, notice_number) DO UPDATE SET
    links_json = excluded.links_json, history_key = excluded.history_key, updated_at = CURRENT_TIMESTAMP`)
    .bind(WORKSPACE_USER_ID, applicationNumber, input.noticeNumber, JSON.stringify(value), currentKey).run();
  return storedRoundLinks(applicationNumber, history);
}

export async function persistClaimVersions(applicationNumber: string, changes: ClaimChangeHistory) {
  const stored = await getPatentCase<{ history?: HistoryLike[] }>(WORKSPACE_USER_ID, applicationNumber);
  const initial = (stored?.payload.history ?? []).filter((item) => /(?:특허출원서|실용신안등록출원서)/.test(item.title)).map((item) => item.documentNumber);
  const versions = buildDocumentClaimVersions(changes.documents, initial);
  // The standalone changes endpoint can return partial snapshots before a case is saved.
  if (!stored) return versions;
  const db = await appDatabase();
  for (const version of versions) {
    for (const side of ['before', 'after'] as const) {
      // Partial snapshots are useful for a diff, never a complete claim tree.
      const json = JSON.stringify({ claims: version[side], complete: side === 'before' ? version.beforeComplete : version.afterComplete });
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      await db.prepare(`INSERT INTO claim_versions (user_id, application_number, version_key, source_document_number, source_hash, claims_json, is_current)
        VALUES (?, ?, ?, ?, ?, ?, 0) ON CONFLICT(user_id, application_number, version_key) DO UPDATE SET
        source_hash = excluded.source_hash, claims_json = excluded.claims_json, updated_at = CURRENT_TIMESTAMP`)
        .bind(WORKSPACE_USER_ID, applicationNumber, `document-${version.documentNumber}-${side}`, version.documentNumber, hash, json).run();
    }
  }
  return versions;
}
