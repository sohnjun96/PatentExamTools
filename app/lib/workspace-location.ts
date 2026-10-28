export type WorkspaceView = 'review' | 'ai' | 'stats' | 'settings';
export type WorkspaceLocation = { userId: string; monthId: string; view: WorkspaceView };

export function readWorkspaceLocation(raw: string | null, admin: boolean): WorkspaceLocation {
  const fallback: WorkspaceLocation = { userId: '', monthId: '', view: admin ? 'stats' : 'review' };
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
    const stored = value as Record<string, unknown>;
    const allowed = admin ? ['stats', 'settings'] : ['review', 'ai'];
    return {
      userId: !admin && typeof stored.userId === 'string' && stored.userId.length < 200 ? stored.userId : '',
      monthId: typeof stored.monthId === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(stored.monthId) ? stored.monthId : '',
      view: typeof stored.view === 'string' && allowed.includes(stored.view) ? stored.view as WorkspaceView : fallback.view,
    };
  } catch { return fallback; }
}

export function viewForRoles(roles: string[], requested: WorkspaceView = 'review'): 'review' | 'ai' {
  if (!roles.includes('examiner') && roles.includes('ai')) return 'ai';
  return requested === 'ai' && roles.includes('ai') ? 'ai' : 'review';
}

export function saveFailureGuidance(status: number, message: string) {
  if (status >= 500) return { conflict: false, message: '저장하지 못했습니다. 잠시 후 다시 저장해 주세요. 계속되면 관리자에게 알려 주세요. 입력 내용은 이 화면에 남아 있습니다.' };
  const safeMessage = /[가-힣]/.test(message) ? message : '저장하지 못했습니다.';
  if (status === 401 || status === 403) return { conflict: false, message: `${safeMessage} 사용자와 담당 배정을 확인하거나 관리자에게 문의해 주세요. 입력 내용은 이 화면에 남아 있습니다.` };
  if (status !== 409) return { conflict: false, message: `${safeMessage} 입력 내용을 확인한 뒤 다시 저장해 주세요. 입력 내용은 이 화면에 남아 있습니다.` };
  if (/마감|재개방/.test(message)) return { conflict: false, message: '이 운영월은 마감되어 저장할 수 없습니다. 관리자에게 운영 재개방을 요청하세요. 입력 내용은 이 화면에 남아 있습니다.' };
  if (/선정 확정한 목록/.test(message)) return { conflict: false, message: '이미 확정한 선정 목록은 변경할 수 없습니다. 출원을 추가하거나 취소하려면 관리자에게 요청해 주세요. 입력 내용은 이 화면에 남아 있습니다.' };
  return { conflict: true, message: `${safeMessage} 입력 내용은 이 화면에 남아 있습니다. 입력 내용을 보관하고 최신 자료와 비교해 주세요.` };
}
