import { personnelOf, type EvaluationState, type OperationMonth } from '@/app/lib/evaluation';

type AssignmentReason = 'user_missing' | 'user_inactive' | 'ai_role_missing' | 'group_missing' | 'method_not_selected' | 'duplicate_assignment';
type ParticipantReason = 'user_missing' | 'examiner_role_missing' | 'group_missing' | 'duplicate_participant';
type AssignmentCell = { groupId: string; groupName: string; methodId: string; methodName: string };
type ParticipantInfo = { userId: string; name: string; groupId: string; groupName: string };

export type AdminReadiness = {
  participantCount: number;
  confirmedUserCount: number;
  confirmedParticipantCount: number;
  groupCount: number;
  participantGroupCount: number;
  selectedAiCount: number;
  assignmentTargetCount: number;
  assignmentReadyCount: number;
  missingAssignments: AssignmentCell[];
  unavailableAssignments: (AssignmentCell & { userId: string; userName: string; reason: AssignmentReason; message: string })[];
  inactiveParticipants: (ParticipantInfo & { message: string })[];
  invalidParticipants: (ParticipantInfo & { reason: ParticipantReason; message: string })[];
  selectedInactiveMethods: { id: string; name: string }[];
  invalidMethodIds: string[];
  duplicateMethodIds: string[];
  closed: boolean;
  canStart: boolean;
};

const assignmentMessages: Record<AssignmentReason, string> = {
  user_missing: '등록되지 않은 사용자가 담당자로 지정되어 있습니다. 담당자를 다시 선택해 주세요.',
  user_inactive: '비활성 사용자는 AI 결과를 입력할 수 없습니다. 활성 담당자를 배정해 주세요.',
  ai_role_missing: '담당자에게 AI 담당자 역할이 없습니다. 역할을 확인하거나 담당자를 다시 선택해 주세요.',
  group_missing: '등록되지 않은 그룹에 담당자가 지정되어 있습니다. 그룹 배정을 확인해 주세요.',
  method_not_selected: '선택한 비교 AI에 포함되지 않은 담당 배정입니다. 비교 방식과 배정을 확인해 주세요.',
  duplicate_assignment: '같은 그룹·AI 방식에 담당자가 중복 지정되어 있습니다. 한 명만 배정해 주세요.',
};

const participantMessages: Record<ParticipantReason, string> = {
  user_missing: '등록되지 않은 사용자가 참여자로 지정되어 있습니다. 참여 명단을 확인해 주세요.',
  examiner_role_missing: '참여자에게 심사관 역할이 없습니다. 역할과 참여 명단을 확인해 주세요.',
  group_missing: '참여자에게 지정한 그룹이 없습니다. 참여 그룹을 다시 선택해 주세요.',
  duplicate_participant: '한 심사관이 여러 번 참여자로 지정되어 있습니다. 한 그룹만 배정해 주세요.',
};

/**
 * Explain operational readiness without changing state or adding save rules.
 * Incomplete month settings remain saveable under the existing domain rules.
 */
export function getAdminReadiness(state: EvaluationState, month?: OperationMonth): AdminReadiness {
  const userById = new Map(state.users.map((user) => [user.id, user]));
  const groupById = new Map(state.groups.map((group) => [group.id, group]));
  const methodById = new Map(state.methods.map((method) => [method.id, method]));
  const personnel = personnelOf(state);
  const participants = personnel.memberships.filter((entry) => { const user = userById.get(entry.userId); return !user || user.active && user.roles.includes('examiner'); });
  const methodIds = month?.methodIds ?? state.methods.filter((method) => method.active).map((method) => method.id);
  const assignments = personnel.assignments.filter((entry) => !month || methodIds.includes(entry.methodId) || !methodById.has(entry.methodId));
  const confirmedUserIds = month?.confirmedUserIds ?? [];
  const closed = month?.closed ?? false;
  const selectedAi = state.methods.filter((method) => method.kind === 'ai' && methodIds.includes(method.id));
  const selectedAiIds = new Set(selectedAi.map((method) => method.id));
  const participantIds = new Set(participants.map((participant) => participant.userId));
  const participantGroupIds = new Set(participants.map((participant) => participant.groupId));
  const cases = state.cases.filter((item) => item.status === 'confirmed' && (month ? item.monthId === month.id : !state.months.find((entry) => entry.id === item.monthId)?.closed));
  // A past case keeps its original group even when current participation changes.
  const groupIds = new Set([...(month ? participantGroupIds : state.groups.map((group) => group.id)), ...cases.map((item) => item.groupId)]);
  const groupName = (id: string) => groupById.get(id)?.name ?? cases.find((item) => item.groupId === id)?.groupName ?? '등록되지 않은 그룹';
  const cell = (groupId: string, methodId: string): AssignmentCell => ({ groupId, groupName: groupName(groupId), methodId, methodName: methodById.get(methodId)?.name ?? '등록되지 않은 조사 방식' });
  const participantOccurrences = new Map<string, number>();
  const assignmentOccurrences = new Map<string, number>();
  participants.forEach((participant) => participantOccurrences.set(participant.userId, (participantOccurrences.get(participant.userId) ?? 0) + 1));
  const assignmentKey = (groupId: string, methodId: string) => JSON.stringify([groupId, methodId]);
  assignments.forEach((assignment) => {
    const key = assignmentKey(assignment.groupId, assignment.methodId);
    assignmentOccurrences.set(key, (assignmentOccurrences.get(key) ?? 0) + 1);
  });
  const assignmentReason = (groupId: string, methodId: string, userId: string): AssignmentReason | null => {
    if (!groupById.has(groupId)) return 'group_missing';
    if (month ? !selectedAiIds.has(methodId) : methodById.get(methodId)?.kind !== 'ai') return 'method_not_selected';
    if ((assignmentOccurrences.get(assignmentKey(groupId, methodId)) ?? 0) > 1) return 'duplicate_assignment';
    const user = userById.get(userId);
    if (!user) return 'user_missing';
    if (!user.active) return 'user_inactive';
    if (!user.roles.includes('ai')) return 'ai_role_missing';
    return null;
  };
  const unavailableAssignments: AdminReadiness['unavailableAssignments'] = [];
  for (const assignment of assignments) {
    const reason = assignmentReason(assignment.groupId, assignment.methodId, assignment.userId);
    if (reason) unavailableAssignments.push({ ...cell(assignment.groupId, assignment.methodId), userId: assignment.userId, userName: userById.get(assignment.userId)?.name ?? '등록되지 않은 사용자', reason, message: assignmentMessages[reason] });
  }
  const missingAssignments: AssignmentCell[] = [];
  let assignmentReadyCount = 0;
  for (const groupId of groupIds) {
    for (const method of selectedAi) {
      const matches = assignments.filter((assignment) => assignment.groupId === groupId && assignment.methodId === method.id);
      if (!matches.length) missingAssignments.push(cell(groupId, method.id));
      else if (matches.length === 1 && !assignmentReason(groupId, method.id, matches[0].userId)) assignmentReadyCount += 1;
    }
  }
  const inactiveParticipants: AdminReadiness['inactiveParticipants'] = [];
  const invalidParticipants: AdminReadiness['invalidParticipants'] = [];
  for (const participant of participants) {
    const user = userById.get(participant.userId);
    const info: ParticipantInfo = { userId: participant.userId, name: user?.name ?? '등록되지 않은 사용자', groupId: participant.groupId, groupName: groupName(participant.groupId) };
    if (user && !user.active) inactiveParticipants.push({ ...info, message: '비활성 참여자는 출원 선정과 평가를 할 수 없습니다. 활성 여부와 참여 명단을 확인해 주세요.' });
    const reason: ParticipantReason | null = !user ? 'user_missing' : !user.roles.includes('examiner') ? 'examiner_role_missing' : !groupById.has(participant.groupId) ? 'group_missing' : (participantOccurrences.get(participant.userId) ?? 0) > 1 ? 'duplicate_participant' : null;
    if (reason) invalidParticipants.push({ ...info, reason, message: participantMessages[reason] });
  }
  const invalidMethodIds = [...new Set(methodIds.filter((id) => !methodById.has(id)))];
  const duplicateMethodIds = [...new Set(methodIds.filter((id, index) => methodIds.indexOf(id) !== index))];
  return {
    participantCount: participantIds.size,
    confirmedUserCount: new Set(confirmedUserIds).size,
    confirmedParticipantCount: [...participantIds].filter((id) => confirmedUserIds.includes(id)).length,
    groupCount: groupIds.size,
    participantGroupCount: participantGroupIds.size,
    selectedAiCount: selectedAi.length,
    assignmentTargetCount: groupIds.size * selectedAi.length,
    assignmentReadyCount,
    missingAssignments,
    unavailableAssignments,
    inactiveParticipants,
    invalidParticipants,
    selectedInactiveMethods: selectedAi.filter((method) => !method.active).map((method) => ({ id: method.id, name: method.name })),
    invalidMethodIds,
    duplicateMethodIds,
    closed: closed,
    canStart: !closed && participantIds.size > 0 && selectedAi.length > 0 && missingAssignments.length === 0 && unavailableAssignments.length === 0 && inactiveParticipants.length === 0 && invalidParticipants.length === 0 && invalidMethodIds.length === 0 && duplicateMethodIds.length === 0,
  };
}
