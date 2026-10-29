import { createInitialState, personnelOf, withDefaultAIMethods, type EvaluationState } from '@/app/lib/evaluation';
import type { Bureau } from '@/app/lib/bureaus';

/** Copy only records with an unambiguous legacy bureau, leaving main untouched. */
export function migrateEvaluationBureau(legacy: EvaluationState, bureau: Bureau): EvaluationState {
  const initial = createInitialState();
  const users = legacy.users.filter((user) => user.bureau === bureau);
  const userIds = new Set(users.map((user) => user.id));
  const cases = legacy.cases.filter((item) => item.bureau === bureau && userIds.has(item.examinerId));
  const caseIds = new Set(cases.map((item) => item.id));
  const personnel = personnelOf(legacy);
  const memberships = personnel.memberships.filter((entry) => userIds.has(entry.userId));
  const relevantMonths = legacy.months.filter((month) => month.participants.some((participant) => userIds.has(participant.userId)) || month.assignments.some((assignment) => userIds.has(assignment.userId)) || cases.some((item) => item.monthId === month.id) || (!month.participants.length && !month.assignments.length && memberships.length > 0));
  const groupIds = new Set([
    ...cases.map((item) => item.groupId),
    ...memberships.map((entry) => entry.groupId),
    ...personnel.assignments.filter((entry) => userIds.has(entry.userId)).map((entry) => entry.groupId),
    ...relevantMonths.flatMap((month) => month.participants.filter((participant) => userIds.has(participant.userId)).map((participant) => participant.groupId)),
  ]);
  const months = relevantMonths.map((month) => ({
    ...month,
    participants: month.participants.filter((participant) => userIds.has(participant.userId)),
    assignments: month.assignments.filter((assignment) => userIds.has(assignment.userId) && groupIds.has(assignment.groupId)),
    confirmedUserIds: month.confirmedUserIds.filter((id) => userIds.has(id)),
  }));
  const methodIds = new Set([
    ...personnel.assignments.filter((entry) => userIds.has(entry.userId) && groupIds.has(entry.groupId)).map((entry) => entry.methodId),
    ...months.flatMap((month) => month.methodIds),
    ...legacy.results.filter((result) => caseIds.has(result.caseId)).map((result) => result.methodId),
  ]);
  const methods = withDefaultAIMethods([
    ...initial.methods.filter((method) => method.kind === 'baseline' && !methodIds.has(method.id)),
    ...legacy.methods.filter((method) => methodIds.has(method.id)),
  ]);
  const state: EvaluationState = {
    schemaVersion: 1,
    defaultAiCatalogVersion: 1,
    personnel: { memberships, assignments: personnel.assignments.filter((entry) => userIds.has(entry.userId) && groupIds.has(entry.groupId)) },
    users,
    groups: legacy.groups.filter((group) => groupIds.has(group.id)),
    methods,
    months: months.length ? months : initial.months,
    cases,
    results: legacy.results.filter((result) => caseIds.has(result.caseId)).map((result) => ({
      ...result,
      // Published literature belongs to the scoped case; another bureau's
      // identity and unpublished edit do not belong to this workspace.
      draftDocuments: userIds.has(result.draftAuthorId) ? result.draftDocuments : [],
      draftDocumentDetails: userIds.has(result.draftAuthorId) ? result.draftDocumentDetails : [],
      draftAuthorId: userIds.has(result.draftAuthorId) ? result.draftAuthorId : '',
      publishedBy: result.publishedBy && userIds.has(result.publishedBy.id) ? result.publishedBy : null,
    })),
    evaluations: legacy.evaluations.filter((evaluation) => caseIds.has(evaluation.caseId)),
    rankings: legacy.rankings.filter((ranking) => caseIds.has(ranking.caseId)),
    isDemo: legacy.isDemo && Boolean(users.length || cases.length),
    // A shared legacy announcement has no unambiguous bureau ownership.
    notice: null,
  };
  return structuredClone(state);
}

export function demoForBureau(state: EvaluationState, bureau: Bureau): EvaluationState {
  return { ...state, users: state.users.map((user) => ({ ...user, bureau })), cases: state.cases.map((item) => ({ ...item, bureau })) };
}
