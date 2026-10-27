'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  caseStatus, emptyMonth, getStatistics,
  type EvaluationAction, type EvaluationCase, type EvaluationGroup, type EvaluationState,
  type EvaluationUser, type InvestigationMethod, type OperationMonth, type Role,
} from '@/app/lib/evaluation';
import { getAdminReadiness } from '@/app/lib/admin-guidance';
import { exportWorkbook } from '@/app/lib/export-workbook';
import type { Bureau } from '@/app/lib/bureaus';
import AccessibleDialog from '@/app/components/accessible-dialog';
import NoticeManager from './notice-manager';
import './admin.css';

export const ADMIN_NAV = [
  { id: 'overview', label: '운영 현황', icon: '▦', description: '월별 진행을 확인하고 후속 업무를 찾습니다.' },
  { id: 'examiners', label: '심사관 관리', icon: '▤', description: '사용자 계정과 월별 참여·그룹·AI 담당 배정을 함께 관리합니다.' },
  { id: 'ai', label: 'AI 종류', icon: '◇', description: '비교에 사용할 AI 종류를 등록하고 관리합니다.' },
  { id: 'groups', label: '그룹', icon: '▥', description: '참여자와 AI 담당 업무를 묶는 그룹을 관리합니다.' },
  { id: 'month', label: '월별 운영', icon: '◷', description: '운영 기한과 선정 건수, 비교할 AI 종류를 설정합니다.' },
  { id: 'cases', label: '대상 출원', icon: '▧', description: '대상 출원을 찾고 운영상 필요한 등록과 취소를 처리합니다.' },
  { id: 'notices', label: '공지사항 관리', icon: '▣', description: '메인 페이지에 표시할 공지사항을 마크다운으로 작성하고 관리합니다.' },
] as const;
export type AdminSection = typeof ADMIN_NAV[number]['id'];
type Save = (action: EvaluationAction, message?: string) => Promise<boolean>;
export type AdminProps = {
  state: EvaluationState; month: OperationMonth; bureau?: Bureau; busy: boolean;
  save: Save; dirty: (value: boolean) => void; hasUnsaved: boolean;
  section: AdminSection; onNavigate: (section: AdminSection) => void;
  selectMonth: (id: string) => void; notify: (message: string) => void;
  saveFeedback?: React.ReactNode;
};
type FormProps = Pick<AdminProps, 'state' | 'month' | 'bureau' | 'busy' | 'save' | 'dirty' | 'hasUnsaved' | 'onNavigate' | 'saveFeedback'>;
const roles: { value: Role; label: string }[] = [{ value: 'examiner', label: '심사관' }, { value: 'ai', label: 'AI 담당자' }, { value: 'admin', label: '관리자' }];
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const monthLabel = (id: string) => `${id.slice(0, 4)}년 ${Number(id.slice(5))}월`;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const queryValue = (value: string) => value.trim().toLocaleLowerCase();

export function readAdminSection(raw: string | null, bureau?: Bureau, legacyView?: string): AdminSection {
  try {
    const value = raw ? JSON.parse(raw) as { adminSection?: unknown } : null;
    if (value?.adminSection === 'accounts') return 'examiners';
    if (ADMIN_NAV.some((entry) => entry.id === value?.adminSection)) return value!.adminSection as AdminSection;
  } catch { /* Invalid optional session data falls back to the entry page. */ }
  if (legacyView === 'stats') return 'overview';
  return bureau ? 'examiners' : 'overview';
}

function Button({ children, primary = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button type="button" {...props} className={`krds-btn medium ev-button ${primary ? 'primary' : ''} ${props.className || ''}`}>{children}</button>;
}
function Pill({ children, tone = '' }: { children: React.ReactNode; tone?: string }) { return <span className={`adm-pill ${tone}`}>{children}</span>; }
function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) { return <div className="adm-metric"><span className="adm-metric-label">{label}</span><strong className="adm-metric-value">{value}</strong>{hint && <span className="adm-secondary">{hint}</span>}</div>; }
function Empty({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) { return <div className="adm-empty"><h3>{title}</h3>{children && <p>{children}</p>}{actions && <div className="adm-empty-actions">{actions}</div>}</div>; }
function EditorHeader({ title, children }: { title: string; children?: React.ReactNode }) { return <div className="adm-list-head"><div><h2>{title}</h2>{children && <p className="adm-secondary">{children}</p>}</div></div>; }
function confirmDiscard(changed: boolean) { return !changed || window.confirm('저장하지 않은 입력이 있습니다. 입력을 버리고 이동하시겠습니까?'); }

export default function AdminWorkspace(props: AdminProps) {
  const { state, month, section, onNavigate } = props;
  const [caseFocus, setCaseFocus] = useState('all');
  const navigateCases = (focus: string) => { setCaseFocus(focus); onNavigate('cases'); };
  return <div className="adm">
    {section === 'overview' ? <Overview {...props} navigateCases={navigateCases} />
      : section === 'examiners' ? <AccountManager {...props} />
      : section === 'ai' ? <MethodManager {...props} />
      : section === 'groups' ? <GroupManager {...props} />
      : section === 'month' ? <MonthManager {...props} />
      : section === 'notices' ? <NoticeManager {...props} />
      : <CaseManager key={caseFocus} {...props} initialStatus={caseFocus} />}
    {section !== 'notices' && !state.users.length && !state.groups.length && !state.cases.length && <section className="adm-demo ev-notice">
      <strong>가상 자료로 업무 흐름 확인</strong><p>가상 자료: 사용자 10명·그룹 2개·출원 20건</p>
      <Button disabled={props.busy || month.closed} onClick={() => { if (window.confirm('가상 검증 자료를 불러오시겠습니까? 실제 출원과 실적이 아닌 예시가 저장됩니다.')) void props.save({ type: 'loadDemo' }, '가상 검증 자료를 불러왔습니다.'); }}>가상 검증 자료 불러오기</Button>
    </section>}
  </div>;
}

export function filterAdminUsers(users: EvaluationUser[], query = '', role = 'all', status = 'all') {
  const search = queryValue(query);
  return users.filter((user) => (!search || `${user.name} ${user.division}`.toLocaleLowerCase().includes(search))
    && (role === 'all' || user.roles.includes(role as Role))
    && (status === 'all' || user.active === (status === 'active')));
}

type PersonnelDraft = Pick<OperationMonth, 'participants' | 'assignments'>;
export function personnelDraft(month: OperationMonth): PersonnelDraft {
  return structuredClone({ participants: month.participants, assignments: month.assignments });
}
export function mergePersonnelMonth(month: OperationMonth, draft: PersonnelDraft): OperationMonth {
  return { ...month, participants: structuredClone(draft.participants), assignments: structuredClone(draft.assignments) };
}

function AccountManager(props: FormProps) {
  const { state, month, busy, dirty, onNavigate } = props;
  const [query, setQuery] = useState(''); const [role, setRole] = useState('all'); const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [participation, setParticipation] = useState('all');
  const [allocation, setAllocation] = useState<PersonnelDraft>(() => personnelDraft(month));
  const [accountDirty, setAccountDirty] = useState(false);
  const changed = !same(allocation, personnelDraft(month));
  useEffect(() => dirty(changed || accountDirty), [changed, accountDirty, dirty]);
  const plannedMonth = mergePersonnelMonth(month, allocation);
  const readiness = getAdminReadiness(state, plannedMonth);
  const disabled = busy || month.closed;
  const selectedAI = state.methods.filter((method) => method.kind === 'ai' && month.methodIds.includes(method.id));
  const relevantGroupIds = new Set([...allocation.participants.map((entry) => entry.groupId), ...allocation.assignments.map((entry) => entry.groupId), ...state.cases.filter((item) => item.monthId === month.id && item.status === 'confirmed').map((item) => item.groupId)]);
  const groups = state.groups.filter((group) => relevantGroupIds.has(group.id));
  const availableAI = state.users.filter((user) => user.active && user.roles.includes('ai'));
  const visible = filterAdminUsers(state.users, query, role, status).filter((user) => participation === 'all' || allocation.participants.some((entry) => entry.userId === user.id) === (participation === 'included'));
  const selected = state.users.find((user) => user.id === editing);
  function update(patch: Partial<PersonnelDraft>) { setAllocation((previous) => ({ ...previous, ...patch })); dirty(true); }
  function open(id: string) { if (!busy) { setAccountDirty(false); setEditing(id); } }
  const saveAccount: Save = async (action, message) => {
    const saved = await props.save(action, message);
    if (saved) { setQuery(''); setRole('all'); setStatus('all'); setParticipation('all'); }
    return saved;
  };
  function setGroup(userId: string, groupId: string) {
    const exists = allocation.participants.some((entry) => entry.userId === userId);
    update({ participants: !groupId ? allocation.participants.filter((entry) => entry.userId !== userId) : exists ? allocation.participants.map((entry) => entry.userId === userId ? { userId, groupId } : entry) : [...allocation.participants, { userId, groupId }] });
  }
  function setAssignee(groupId: string, methodId: string, userId: string) {
    const matching = (entry: OperationMonth['assignments'][number]) => entry.groupId === groupId && entry.methodId === methodId;
    update({ assignments: !userId ? allocation.assignments.filter((entry) => !matching(entry)) : allocation.assignments.some(matching) ? allocation.assignments.map((entry) => matching(entry) ? { groupId, methodId, userId } : entry) : [...allocation.assignments, { groupId, methodId, userId }] });
  }
  async function savePersonnel() {
    if (disabled || !changed || !selectedAI.length) return;
    if (await props.save({ type: 'saveMonth', month: plannedMonth }, monthLabel(month.id) + ' 심사관 참여·그룹·AI 담당 배정을 저장했습니다.')) dirty(accountDirty);
  }
  return <>
    <div className="adm-metrics"><Metric label="등록된 사용자" value={state.users.length + '명'} /><Metric label="이달 참여 심사관" value={allocation.participants.length + '명'} /><Metric label="활성 AI 담당자" value={availableAI.length + '명'} /><Metric label="그룹별 AI 배정" value={readiness.assignmentReadyCount + ' / ' + readiness.assignmentTargetCount} hint={'미배정 ' + readiness.missingAssignments.length + '건'} /></div>

    <nav className="adm-steps-nav" aria-label="심사관 관리 영역"><a href="#adm-examiner-list">사용자·참여 그룹</a><a href="#adm-examiner-ai">그룹별 AI 담당 배정</a></nav>
    <div className="adm-toolbar">
      <div className="adm-search"><label className="sr-only" htmlFor="adm-account-search">이름 또는 심사과 검색</label><input id="adm-account-search" className="krds-input" placeholder="이름 또는 심사과 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <select className="krds-form-select adm-filter" aria-label="계정 역할 필터" value={role} onChange={(event) => setRole(event.target.value)}><option value="all">전체 역할</option>{roles.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select>
      <select className="krds-form-select adm-filter" aria-label="계정 활성 상태 필터" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">전체 상태</option><option value="active">활성</option><option value="inactive">비활성</option></select>
      <select className="krds-form-select adm-filter" aria-label="참여 상태 필터" value={participation} onChange={(event) => setParticipation(event.target.value)}><option value="all">전체 참여 상태</option><option value="included">이달 참여</option><option value="excluded">이달 미참여</option></select>
      <Button primary disabled={busy} aria-haspopup="dialog" onClick={() => open('new')}>신규 계정 등록</Button>
    </div>
    <section className="adm-list adm-examiner-list" id="adm-examiner-list" aria-labelledby="adm-examiner-list-title">
      <div className="adm-list-head"><h2 id="adm-examiner-list-title">사용자·참여 그룹</h2><span className="adm-secondary">{visible.length} / {state.users.length}명</span></div>
      {visible.length ? visible.map((user) => {
        const participant = allocation.participants.find((entry) => entry.userId === user.id);
        const responsibilities = allocation.assignments.filter((entry) => entry.userId === user.id);
        const eligible = user.active && user.roles.includes('examiner');
        return <article className="adm-examiner-row" key={user.id}>
          <div className="adm-examiner-profile"><div className="adm-examiner-name"><strong>{user.name}</strong><Button disabled={busy} aria-haspopup="dialog" aria-label={user.name + ' 계정 수정'} onClick={() => open(user.id)}>계정 수정</Button></div><span className="adm-secondary">{user.division || '심사과 미입력'}</span><div className="adm-personnel-tags"><Pill tone={user.active ? 'is-active' : 'is-inactive'}>{user.active ? '활성' : '비활성'}</Pill>{user.roles.map((value) => <Pill key={value}>{roles.find((entry) => entry.value === value)?.label}</Pill>)}</div></div>
          <div><label className="adm-field">이달 참여 그룹<select className="krds-form-select" aria-label={user.name + ' 이달 참여 그룹'} disabled={disabled || !eligible && !participant} value={participant?.groupId || ''} onChange={(event) => setGroup(user.id, event.target.value)}><option value="">참여하지 않음</option>{participant && !state.groups.some((group) => group.id === participant.groupId) && <option value={participant.groupId}>등록되지 않은 그룹 · 확인 필요</option>}{state.groups.map((group) => <option key={group.id} value={group.id} disabled={!eligible}>{group.name}</option>)}</select></label>{!eligible && <p className="adm-secondary">{participant ? '계정 확인 또는 참여 해제 필요' : '활성 심사관만 참여 가능'}</p>}</div>
          <div><span className="adm-label">AI 담당 업무</span>{responsibilities.length ? <ul className="adm-responsibilities">{responsibilities.map((entry) => <li key={entry.groupId + ':' + entry.methodId}>{state.groups.find((group) => group.id === entry.groupId)?.name || '그룹 확인 필요'} · {state.methods.find((method) => method.id === entry.methodId)?.name || 'AI 확인 필요'}</li>)}</ul> : <p className="adm-secondary">{user.roles.includes('ai') ? '담당 업무 없음' : 'AI 담당자 역할 없음'}</p>}</div>
        </article>;
      }) : <Empty title={state.users.length ? '검색 조건에 맞는 계정이 없습니다.' : '등록된 계정이 없습니다.'} actions={state.users.length ? <Button onClick={() => { setQuery(''); setRole('all'); setStatus('all'); setParticipation('all'); }}>검색 조건 초기화</Button> : undefined} />}
    </section>
    {(readiness.inactiveParticipants.length > 0 || readiness.invalidParticipants.length > 0) && <div className="ev-notice warning">참여 배정 중 계정 상태·역할·그룹 확인이 필요한 심사관 {readiness.inactiveParticipants.length + readiness.invalidParticipants.length}명</div>}
    {!state.groups.length && <div className="ev-notice">참여 그룹을 먼저 등록하세요. <Button onClick={() => onNavigate('groups')}>그룹 관리</Button></div>}
    <section className="adm-personnel-ai" id="adm-examiner-ai" aria-labelledby="adm-examiner-ai-title">
      <div className="adm-list-head"><div><h2 id="adm-examiner-ai-title">그룹별 AI 담당자 배정</h2></div><Pill tone={readiness.missingAssignments.length || readiness.unavailableAssignments.length ? 'is-warning' : 'is-active'}>{readiness.assignmentReadyCount} / {readiness.assignmentTargetCount}건 배정</Pill></div>
      {groups.length && selectedAI.length ? <div className="adm-table-wrap"><table className="adm-table"><caption className="sr-only">그룹과 AI 종류별 검색 결과 입력 담당자</caption><thead><tr><th scope="col">대상 그룹</th>{selectedAI.map((method) => <th key={method.id} scope="col">{method.name}</th>)}</tr></thead><tbody>{groups.map((group) => <tr key={group.id}><th scope="row">{group.name}</th>{selectedAI.map((method) => {
        const assignment = allocation.assignments.find((entry) => entry.groupId === group.id && entry.methodId === method.id);
        const current = state.users.find((user) => user.id === assignment?.userId);
        return <td key={method.id}><select className="krds-form-select" aria-label={group.name + ' ' + method.name + ' 담당자'} disabled={disabled} value={assignment?.userId || ''} onChange={(event) => setAssignee(group.id, method.id, event.target.value)}><option value="">담당자 미배정</option>{assignment && !availableAI.some((user) => user.id === assignment.userId) && <option value={assignment.userId}>{current?.name || '계정 없음'} · 확인 필요</option>}{availableAI.map((user) => <option key={user.id} value={user.id}>{user.division || '소속 미지정'} - {user.name}</option>)}</select></td>;
      })}</tr>)}</tbody></table></div> : <div className="adm-inset"><p>{!selectedAI.length ? '월별 운영에서 비교할 AI를 먼저 선택하세요.' : '참여 그룹을 먼저 배정하세요.'}</p>{!selectedAI.length && <Button onClick={() => onNavigate('month')}>비교 AI 선택</Button>}</div>}
      <div className="adm-inset"><p className="adm-secondary">미배정 상태로도 저장 가능 · 확정 출원의 그룹은 유지</p>{readiness.missingAssignments.length > 0 && <p className="adm-inline-error">담당자 미배정 {readiness.missingAssignments.length}건: {readiness.missingAssignments.map((entry) => entry.groupName + ' · ' + entry.methodName).join(', ')}</p>}{readiness.unavailableAssignments.length > 0 && <p className="adm-inline-error">확인할 AI 배정 {readiness.unavailableAssignments.length}건이 있습니다.</p>}{!availableAI.length && <p className="adm-inline-error">활성 AI 담당자가 없습니다. 계정 역할을 확인하세요.</p>}</div>
    </section>
    <div className="adm-save-bar"><div><strong>{monthLabel(month.id)} 심사관 관리</strong>{changed && <p className="adm-secondary adm-dirty is-dirty" role="status">배정 변경 미저장</p>}</div><div className="adm-actions"><Button disabled={disabled || !changed} onClick={() => { if (confirmDiscard(changed)) { setAllocation(personnelDraft(month)); dirty(accountDirty); } }}>배정 변경 취소</Button><Button primary disabled={disabled || !changed || !selectedAI.length} onClick={() => void savePersonnel()}>심사관 관리 저장</Button></div></div>
    {(editing === 'new' || selected) && <AccountEditor key={editing} user={selected} bureau={props.bureau} busy={busy} save={saveAccount} dirty={setAccountDirty} saveFeedback={props.saveFeedback} onClose={() => { setAccountDirty(false); setEditing(null); }} />}
  </>;
}

export function AccountEditor({ user, bureau, busy, save, dirty, onClose, saveFeedback }: {
  user?: EvaluationUser; bureau?: Bureau; busy: boolean; save: Save; dirty: (value: boolean) => void; onClose: () => void; saveFeedback?: React.ReactNode;
}) {
  const original = useMemo(() => user ? { ...user, bureau: bureau || user.bureau } : { name: '', bureau: bureau || '', division: '', roles: ['examiner'] as Role[], active: true }, [user, bureau]);
  const [form, setForm] = useState(original);
  const [submitFailed, setSubmitFailed] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);
  const changed = !same(form, original);
  useEffect(() => dirty(changed), [changed, dirty]);
  useEffect(() => { if (submitFailed && !busy) feedback.current?.focus(); }, [submitFailed, busy]);
  function update(patch: Partial<typeof form>) { setForm((previous) => ({ ...previous, ...patch })); dirty(true); }
  function requestClose() { if (!busy && confirmDiscard(changed)) onClose(); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !form.name.trim() || !form.roles.length) return;
    setSubmitFailed(false);
    if (await save({ type: 'saveUser', user: { ...form, bureau: bureau || form.bureau } }, user ? `${form.name} 계정 정보를 저장했습니다.` : `${form.name} 계정을 등록했습니다. 심사관 관리에서 참여 그룹과 담당 업무를 정해 주세요.`)) {
      dirty(false); onClose();
    } else setSubmitFailed(true);
  }
  return <AccessibleDialog labelledBy="adm-account-dialog-title" className="adm-form-modal" onClose={requestClose}>
    <header>
      <div><h2 id="adm-account-dialog-title">{user ? `${user.name} 계정 수정` : '신규 계정 등록'}</h2></div>
      <Button disabled={busy} aria-label="계정 편집 닫기" onClick={requestClose}>닫기</Button>
    </header>
    <form className="adm-modal-form" onSubmit={submit} aria-busy={busy}>
      <div className="adm-editor-body adm-modal-fields">
        {submitFailed && <div ref={feedback} className="adm-modal-feedback" tabIndex={-1}>{saveFeedback || <div className="ev-alert" role="alert"><p>계정을 저장하지 못했습니다. 입력한 내용은 유지되어 있습니다. 잠시 후 다시 시도해 주세요.</p></div>}</div>}
        <div className="adm-form-grid">
          <label className="adm-field">이름 <span className="adm-required">필수</span><input className="krds-input" data-dialog-autofocus required maxLength={200} disabled={busy} value={form.name} onChange={(event) => update({ name: event.target.value })} /></label>
          <label className="adm-field">심사국<input className="krds-input" maxLength={200} disabled={busy} readOnly={Boolean(bureau)} value={bureau || form.bureau} onChange={(event) => update({ bureau: event.target.value })} /></label>
          <label className="adm-field">심사과<input className="krds-input" maxLength={200} disabled={busy} value={form.division} onChange={(event) => update({ division: event.target.value })} /></label>
        </div>
        <fieldset className="adm-fieldset" disabled={busy}><legend className="adm-label">역할 <span className="adm-required">1개 이상</span></legend><div className="adm-check-list">{roles.map((role) => <label key={role.value} className="adm-check-row"><input type="checkbox" checked={form.roles.includes(role.value)} onChange={(event) => update({ roles: event.target.checked ? [...form.roles, role.value] : form.roles.filter((entry) => entry !== role.value) })} /><span>{role.label}</span></label>)}</div></fieldset>
        <label className="adm-field">계정 상태<select className="krds-form-select" disabled={busy} value={form.active ? 'active' : 'inactive'} onChange={(event) => update({ active: event.target.value === 'active' })}><option value="active">활성 · 업무 화면에 표시</option><option value="inactive">비활성 · 신규 접속 제한</option></select></label>
        {!form.active && <p className="adm-secondary">비활성화해도 기존 기록과 배정은 유지됩니다.</p>}
      </div>
      <footer className="adm-actions adm-modal-actions">{changed && <span className="adm-dirty is-dirty" role="status">미저장 변경 있음</span>}<Button disabled={busy} onClick={requestClose}>취소</Button><button type="submit" className="krds-btn medium ev-button primary" disabled={busy || !form.name.trim() || !form.roles.length || (Boolean(user) && !changed)}>{busy ? '저장 중…' : user ? '계정 변경 저장' : '계정 등록'}</button></footer>
    </form>
  </AccessibleDialog>;
}

function MethodManager(props: FormProps) {
  const { state, month, busy, dirty, hasUnsaved } = props;
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [editing, setEditing] = useState<string | null>(null);
  const ai = state.methods.filter((method) => method.kind === 'ai');
  const comparisonMethods = state.methods.filter((method) => method.kind === 'baseline');
  const selected = state.methods.find((method) => method.id === editing);
  const visible = ai.filter((method) => (!queryValue(query) || method.name.toLocaleLowerCase().includes(queryValue(query))) && (status === 'all' || method.active === (status === 'active')));
  function open(id: string) { if (!busy && confirmDiscard(hasUnsaved)) { dirty(false); setEditing(id); } }
  const saveMethod: Save = async (action, message) => {
    const saved = await props.save(action, message);
    if (saved) { setQuery(''); setStatus('all'); }
    return saved;
  };
  return <>
    <div className="adm-ai-summary"><span>등록된 AI <strong>{ai.length}개</strong></span><span>활성 AI <strong>{ai.filter((method) => method.active).length}개</strong></span><span>이달 비교 참여 <strong>{ai.filter((method) => month.methodIds.includes(method.id)).length}개</strong></span></div>
    <div className="adm-toolbar">
      <div className="adm-search"><label className="sr-only" htmlFor="adm-method-search">AI 이름 검색</label><input id="adm-method-search" className="krds-input" placeholder="AI 이름으로 검색하세요" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <select className="krds-form-select adm-filter" aria-label="AI 활성 상태 필터" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">전체 상태</option><option value="active">활성</option><option value="inactive">비활성</option></select>
      <Button primary disabled={busy} aria-haspopup="dialog" onClick={() => open('new')}>AI 종류 추가</Button>
    </div>
    <section className="adm-ai-catalog" aria-labelledby="adm-ai-catalog-title">
      <div className="adm-ai-catalog-head"><h2 id="adm-ai-catalog-title">등록된 AI 종류</h2><span className="adm-secondary">{visible.length} / {ai.length}개</span></div>
      {visible.length ? <div className="adm-ai-grid">{visible.map((method) => <button type="button" key={method.id} className={'adm-ai-card ' + (method.active ? '' : 'is-inactive')} disabled={busy} aria-haspopup="dialog" aria-label={'AI 종류 ' + method.name + ' 수정'} aria-describedby={'adm-ai-state-' + method.id + ' adm-ai-month-' + method.id + ' adm-ai-assignment-' + method.id} onClick={() => open(method.id)}>
        <span className="adm-ai-card-top" id={'adm-ai-state-' + method.id}><span className="adm-ai-mark" aria-hidden="true">AI</span><Pill tone={method.active ? 'is-active' : 'is-inactive'}>{method.active ? '활성' : '비활성'}</Pill></span>
        <strong className="adm-ai-name">{method.name}</strong>
        <span id={'adm-ai-month-' + method.id} className={'adm-ai-month ' + (month.methodIds.includes(method.id) ? 'is-included' : '')}>{month.methodIds.includes(method.id) ? '이달 비교 참여' : '이달 비교 미참여'}</span>
        <span className="adm-secondary" id={'adm-ai-assignment-' + method.id}>담당 배정 {month.assignments.filter((entry) => entry.methodId === method.id).length}개 그룹</span>
        <span className="adm-ai-edit">수정하기 <span aria-hidden="true">→</span></span>
      </button>)}</div> : <Empty title={ai.length ? '검색 조건에 맞는 AI가 없습니다.' : '등록된 AI 종류가 없습니다.'} actions={ai.length ? <Button onClick={() => { setQuery(''); setStatus('all'); }}>검색 조건 초기화</Button> : undefined}>{!ai.length && 'AI 종류 추가를 눌러 ChatGPT·클로드 같은 AI 도구를 등록하세요.'}</Empty>}
    </section>
    {comparisonMethods.length > 0 && <section className="adm-ai-comparisons" aria-labelledby="adm-ai-comparisons-title">
      <div><h2 id="adm-ai-comparisons-title">순위 비교 전용 방식</h2></div>
      <div className="adm-ai-comparison-list">{comparisonMethods.map((method) => <button key={method.id} type="button" className="adm-ai-comparison" disabled={busy} aria-haspopup="dialog" aria-label={'비교 방식 ' + method.name + ' 수정'} onClick={() => open(method.id)}><strong>{method.name}</strong><Pill>순위 비교 전용</Pill><Pill tone={method.active ? 'is-active' : 'is-inactive'}>{method.active ? '활성' : '비활성'}</Pill><span className="adm-ai-edit">수정하기 <span aria-hidden="true">→</span></span></button>)}</div>
    </section>}
    {(editing === 'new' || selected) && <MethodEditor key={editing} method={selected} busy={busy} dirty={dirty} save={saveMethod} saveFeedback={props.saveFeedback} onClose={() => { dirty(false); setEditing(null); }} />}
  </>;
}

export function MethodEditor({ method, busy, dirty, save, onClose, saveFeedback }: {
  method?: InvestigationMethod; busy: boolean; dirty: (value: boolean) => void; save: Save; onClose: () => void; saveFeedback?: React.ReactNode;
}) {
  const original = useMemo(() => method || { name: '', kind: 'ai' as const, active: true }, [method]);
  const [form, setForm] = useState(original);
  const [submitFailed, setSubmitFailed] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);
  const changed = !same(form, original);
  const isBaseline = form.kind === 'baseline';
  useEffect(() => dirty(changed), [changed, dirty]);
  useEffect(() => { if (submitFailed && !busy) feedback.current?.focus(); }, [submitFailed, busy]);
  function update(patch: Partial<Pick<InvestigationMethod, 'name' | 'active'>>) { setForm((previous) => ({ ...previous, ...patch })); dirty(true); }
  function requestClose() { if (!busy && confirmDiscard(changed)) onClose(); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !form.name.trim()) return;
    setSubmitFailed(false);
    if (await save({ type: 'saveMethod', method: form }, method ? form.name + (isBaseline ? ' 비교 방식을 저장했습니다.' : ' AI 종류를 저장했습니다.') : form.name + ' AI 종류를 추가했습니다. 월별 운영에서 비교 대상으로 선택해 주세요.')) {
      dirty(false); onClose();
    } else setSubmitFailed(true);
  }
  return <AccessibleDialog labelledBy="adm-method-dialog-title" className="adm-form-modal adm-ai-modal" onClose={requestClose}>
    <header>
      <div><h2 id="adm-method-dialog-title">{method ? method.name + ' 수정' : 'AI 종류 추가'}</h2></div>
      <Button disabled={busy} aria-label={isBaseline ? '비교 방식 편집 닫기' : 'AI 종류 편집 닫기'} onClick={requestClose}>닫기</Button>
    </header>
    <form className="adm-modal-form" onSubmit={submit} aria-busy={busy}>
      <div className="adm-editor-body adm-modal-fields">
        {submitFailed && <div ref={feedback} className="adm-modal-feedback" tabIndex={-1}>{saveFeedback || <div className="ev-alert" role="alert"><p>저장하지 못했습니다. 입력한 내용은 유지되어 있습니다. 잠시 후 다시 시도해 주세요.</p></div>}</div>}
        <label className="adm-field">{isBaseline ? '비교 방식 이름' : 'AI 종류 이름'} <span className="adm-required">필수</span><input className="krds-input" data-dialog-autofocus required disabled={busy} maxLength={200} placeholder={isBaseline ? '예: 선행기술조사' : '예: ChatGPT, 클로드'} value={form.name} onChange={(event) => update({ name: event.target.value })} /></label>
        <label className="adm-field">활성 상태<select className="krds-form-select" disabled={busy} value={form.active ? 'active' : 'inactive'} onChange={(event) => update({ active: event.target.value === 'active' })}><option value="active">활성</option><option value="inactive">비활성</option></select></label>
        {isBaseline && <p className="adm-secondary">순위 비교 전용입니다.</p>}
        {!form.active && <p className="adm-secondary">비활성화해도 기존 월의 비교 설정은 유지됩니다.</p>}
      </div>
      <footer className="adm-actions adm-modal-actions">{changed && <span className="adm-dirty is-dirty" role="status">미저장 변경 있음</span>}<Button disabled={busy} onClick={requestClose}>취소</Button><button type="submit" className="krds-btn medium ev-button primary" disabled={busy || !form.name.trim() || (Boolean(method) && !changed)}>{busy ? '저장 중…' : method ? '변경 저장' : 'AI 종류 추가'}</button></footer>
    </form>
  </AccessibleDialog>;
}

function GroupManager(props: FormProps) {
  const { state, month, busy, hasUnsaved, dirty } = props; const [query, setQuery] = useState(''); const [editing, setEditing] = useState<string | null>(null);
  const selected = state.groups.find((group) => group.id === editing); const visible = state.groups.filter((group) => group.name.toLocaleLowerCase().includes(queryValue(query)));
  function open(id: string) { if (confirmDiscard(hasUnsaved)) { dirty(false); setEditing(id); } }
  return <><div className="adm-toolbar"><div className="adm-search"><label className="sr-only" htmlFor="adm-group-search">그룹 이름 검색</label><input id="adm-group-search" className="krds-input" placeholder="그룹 이름 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></div><span className="adm-secondary">전체 {state.groups.length}개 그룹</span><Button primary disabled={busy} onClick={() => open('new')}>신규 그룹 등록</Button></div><div className="adm-split"><section className="adm-list"><div className="adm-list-head"><h2>그룹 목록</h2><span className="adm-secondary">{visible.length}개</span></div>{visible.length ? visible.map((group) => <button type="button" key={group.id} className={`adm-list-item ${editing === group.id ? 'is-selected' : ''}`} disabled={busy} aria-pressed={editing === group.id} onClick={() => open(group.id)}><span className="adm-name">{group.name}</span><span className="adm-secondary">이달 참여 심사관 {month.participants.filter((entry) => entry.groupId === group.id).length}명 · AI 담당 배정 {month.assignments.filter((entry) => entry.groupId === group.id).length}건</span></button>) : <Empty title={state.groups.length ? '검색한 그룹이 없습니다.' : '등록된 그룹이 없습니다.'} actions={state.groups.length ? <Button onClick={() => setQuery('')}>검색 초기화</Button> : undefined} />}</section><section className="adm-editor">{editing === 'new' || selected ? <GroupEditor key={editing} group={selected} busy={busy} dirty={dirty} save={props.save} onClose={() => { dirty(false); setEditing(null); }} /> : <Empty title="관리할 그룹을 선택하세요.">그룹을 등록한 뒤 심사관 관리에서 참여자와 AI 담당자를 연결합니다.</Empty>}</section></div></>;
}

export function GroupEditor({ group, busy, dirty, save, onClose }: { group?: EvaluationGroup; busy: boolean; dirty: (value: boolean) => void; save: Save; onClose: () => void }) {
  const [name, setName] = useState(group?.name || ''); const changed = name !== (group?.name || ''); useEffect(() => dirty(changed), [changed, dirty]);
  async function submit(event: React.FormEvent) { event.preventDefault(); if (await save({ type: 'saveGroup', group: { id: group?.id, name } }, group ? `${name} 그룹 정보를 저장했습니다.` : `${name} 그룹을 등록했습니다. 심사관 관리에서 참여자를 배정해 주세요.`)) { dirty(false); onClose(); } }
  return <><EditorHeader title={group ? `${group.name} 그룹 수정` : '신규 그룹 등록'} /><form className="adm-editor-body" onSubmit={(event) => void submit(event)}><label className="adm-field">그룹 이름 <span className="adm-required">필수</span><input className="krds-input" required maxLength={200} disabled={busy} value={name} onChange={(event) => { setName(event.target.value); dirty(true); }} /></label>{group && <p className="adm-secondary">확정 출원의 그룹명은 바뀌지 않습니다.</p>}<div className="adm-actions">{changed && <span className="adm-dirty is-dirty" role="status">미저장 변경 있음</span>}<Button disabled={busy} onClick={() => { if (confirmDiscard(changed)) onClose(); }}>취소</Button><button type="submit" className="krds-btn medium ev-button primary" disabled={busy || !name.trim() || (Boolean(group) && !changed)}>{group ? '그룹 변경 저장' : '그룹 등록'}</button></div></form></>;
}

function Step({ number, title, status, children, complete = false, missing = false }: { number: number; title: string; status: string; children: React.ReactNode; complete?: boolean; missing?: boolean }) {
  return <section className={`adm-step ${complete ? 'is-complete' : ''} ${missing ? 'has-missing' : ''}`} id={`adm-step-${number}`}><div className="adm-step-head"><div><span className="adm-step-number">{number}</span><h2>{title}</h2></div><span className="adm-step-count">{status}</span></div><div className="adm-step-body">{children}</div></section>;
}

function MonthManager(props: AdminProps) {
  const [newMonth, setNewMonth] = useState('');
  return <><div className="adm-toolbar"><label className="adm-new-month">새 운영월<input className="krds-input" type="month" value={newMonth} disabled={props.busy} onChange={(event) => setNewMonth(event.target.value)} /></label><Button disabled={props.busy || !newMonth || props.state.months.some((month) => month.id === newMonth)} onClick={async () => { if (!confirmDiscard(props.hasUnsaved)) return; if (await props.save({ type: 'saveMonth', month: emptyMonth(newMonth) }, `${monthLabel(newMonth)} 운영월을 추가했습니다. 비교 AI와 참여자·담당자를 설정해 주세요.`)) { props.selectMonth(newMonth); setNewMonth(''); } }}>운영월 추가</Button></div><MonthlyForm key={props.month.id} {...props} /></>;
}

type OperatingSettings = Pick<OperationMonth, 'methodIds' | 'caseLimit' | 'selectionDeadline' | 'resultDeadline' | 'evaluationDeadline'>;
export function operatingSettings(month: OperationMonth): OperatingSettings {
  return { methodIds: [...month.methodIds], caseLimit: month.caseLimit, selectionDeadline: month.selectionDeadline, resultDeadline: month.resultDeadline, evaluationDeadline: month.evaluationDeadline };
}
export function mergeOperatingMonth(month: OperationMonth, settings: OperatingSettings): OperationMonth {
  return { ...month, ...operatingSettings({ ...month, ...settings }), assignments: month.assignments.filter((entry) => settings.methodIds.includes(entry.methodId)) };
}

export function MonthlyForm({ state, month, busy, dirty, save, onNavigate }: FormProps) {
  const [form, setForm] = useState<OperatingSettings>(() => operatingSettings(month));
  const changed = !same(form, operatingSettings(month)); useEffect(() => dirty(changed), [changed, dirty]);
  function update(patch: Partial<OperatingSettings>) { setForm((previous) => ({ ...previous, ...patch })); dirty(true); }
  const selectedAI = state.methods.filter((method) => method.kind === 'ai' && form.methodIds.includes(method.id));
  const disabled = busy || month.closed;
  return <>

    <Step number={1} title="기본 설정" status={month.closed ? '마감 · 읽기 전용' : '기한·건수 선택 사항'} complete>
      <div className="adm-form-grid"><label className="adm-field">대상 건 선정 기한<input className="krds-input" type="date" disabled={disabled} value={form.selectionDeadline} onChange={(event) => update({ selectionDeadline: event.target.value })} /></label><label className="adm-field">AI 결과 입력 기한<input className="krds-input" type="date" disabled={disabled} value={form.resultDeadline} onChange={(event) => update({ resultDeadline: event.target.value })} /></label><label className="adm-field">문헌 평가 기한<input className="krds-input" type="date" disabled={disabled} value={form.evaluationDeadline} onChange={(event) => update({ evaluationDeadline: event.target.value })} /></label><label className="adm-field">심사관별 출원 건수 상한<input className="krds-input" type="number" min="0" max="500" disabled={disabled} value={form.caseLimit} onChange={(event) => update({ caseLimit: Number(event.target.value) })} /></label></div><p className="adm-secondary">빈 기한은 제한 없음 · 지정한 날짜까지 입력 가능</p><p className="adm-secondary">상한 0은 제한 없음</p>
    </Step>
    <Step number={2} title="비교 AI 선택" status={'AI ' + selectedAI.length + '개 선택'} complete={selectedAI.length > 0} missing={!selectedAI.length}>
      {state.methods.some((method) => method.kind === 'ai') ? <div className="adm-check-list">{state.methods.map((method) => <label key={method.id} className="adm-check-row"><input type="checkbox" disabled={disabled} checked={form.methodIds.includes(method.id)} onChange={(event) => update({ methodIds: event.target.checked ? [...form.methodIds, method.id] : form.methodIds.filter((id) => id !== method.id) })} /><span>{method.name}</span>{method.kind === 'baseline' && <Pill>순위 비교 전용</Pill>}{!method.active && <Pill tone="is-inactive">비활성</Pill>}</label>)}</div> : <Empty title="비교할 AI 종류를 등록하세요." actions={<Button onClick={() => onNavigate('ai')}>AI 종류 추가</Button>} />}
      {!selectedAI.length && <p className="adm-inline-error">비교할 AI를 1개 이상 선택하세요.</p>}<p className="adm-secondary">선행기술조사는 문헌 입력 없이 순위만 비교합니다.</p><Button onClick={() => onNavigate('ai')}>AI 종류 관리</Button>
    </Step>
    <div className="adm-actions"><Button onClick={() => onNavigate('examiners')}>심사관·담당자 배정</Button></div>
    <div className="adm-save-bar"><div><strong>{monthLabel(month.id)} 운영 설정</strong>{changed && <p className="adm-secondary adm-dirty is-dirty" role="status">운영 설정 미저장</p>}</div><Button primary disabled={disabled || !changed || !selectedAI.length} onClick={() => void save({ type: 'saveMonth', month: mergeOperatingMonth(month, form) }, monthLabel(month.id) + ' 운영 기한·건수·비교 AI 설정을 저장했습니다.')}>월별 운영 저장</Button></div>
  </>;
}

export function filterTargetCases(state: EvaluationState, monthId: string, options: { query?: string; status?: string; examinerId?: string; groupId?: string } = {}) {
  const search = queryValue(options.query || '');
  return state.cases.filter((item) => {
    if (item.monthId !== monthId || options.examinerId && item.examinerId !== options.examinerId || options.groupId && item.groupId !== options.groupId) return false;
    if (search && !`${item.applicationNumber} ${item.applicationNumber.replace(/\D/g, '')} ${item.examinerName} ${item.division} ${item.cpc}`.toLocaleLowerCase().includes(search)) return false;
    const status = options.status || 'all'; if (status === 'all') return true;
    if (['confirmed', 'draft', 'cancelled'].includes(status)) return item.status === status;
    if (item.status !== 'confirmed') return false;
    const progress = caseStatus(state, item);
    return status === 'inputPending' ? !progress.inputComplete : status === 'recheck' ? progress.stale : status === 'complete' ? progress.complete : status === 'inProgress' ? progress.evaluationStatus === '평가 중' : status === 'unevaluated' ? progress.evaluationStatus === '미평가' : true;
  });
}
const caseFilters = [['all', '전체 상태'], ['confirmed', '선정 확정'], ['draft', '선정 초안'], ['cancelled', '선정 취소'], ['inputPending', 'AI 입력 대기'], ['recheck', '재확인 필요'], ['unevaluated', '미평가'], ['inProgress', '평가 중'], ['complete', '평가 완료']];

function CaseManager(props: AdminProps & { initialStatus: string }) {
  const { state, month, busy, hasUnsaved, dirty } = props; const [query, setQuery] = useState(''); const [status, setStatus] = useState(props.initialStatus); const [examinerId, setExaminerId] = useState(''); const [editing, setEditing] = useState<string | null>(null);
  const visible = filterTargetCases(state, month.id, { query, status, examinerId }); const all = state.cases.filter((item) => item.monthId === month.id); const selected = all.find((item) => item.id === editing);
  function open(id: string) { if (confirmDiscard(hasUnsaved)) { dirty(false); setEditing(id); } }
  return <><div className="adm-toolbar"><div className="adm-search"><label className="sr-only" htmlFor="adm-case-search">출원번호, 담당자 또는 CPC 검색</label><input id="adm-case-search" className="krds-input" value={query} placeholder="출원번호, 담당자 또는 CPC 검색" onChange={(event) => setQuery(event.target.value)} /></div><select className="krds-form-select adm-filter" aria-label="대상 출원 상태 필터" value={status} onChange={(event) => setStatus(event.target.value)}>{caseFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select className="krds-form-select adm-filter" aria-label="대상 출원 담당 심사관 필터" value={examinerId} onChange={(event) => setExaminerId(event.target.value)}><option value="">전체 담당 심사관</option>{state.users.filter((user) => month.participants.some((entry) => entry.userId === user.id) || all.some((item) => item.examinerId === user.id)).map((user) => <option key={user.id} value={user.id}>{user.division} - {user.name}</option>)}</select><Button primary disabled={busy || month.closed} onClick={() => open('new')}>대상 출원 등록</Button></div><div className="adm-split"><section className="adm-list"><div className="adm-list-head"><h2>대상 출원 목록</h2><span className="adm-secondary">{visible.length} / {all.length}건</span></div>{visible.length ? visible.map((item) => { const progress = item.status === 'confirmed' ? caseStatus(state, item) : null; return <button type="button" key={item.id} className={`adm-list-item ${editing === item.id ? 'is-selected' : ''}`} disabled={busy} aria-pressed={editing === item.id} onClick={() => open(item.id)}><span className="adm-name">{item.applicationNumber}<Pill tone={item.status === 'cancelled' ? 'is-inactive' : progress?.stale ? 'is-warning' : progress?.complete ? 'is-active' : ''}>{item.status === 'draft' ? '선정 초안' : item.status === 'cancelled' ? '선정 취소' : progress?.evaluationStatus}</Pill></span><span className="adm-secondary">{item.examinerName} · {item.groupName} · {item.cpc || 'CPC 미입력'}</span>{progress && <span className="adm-meta">AI {progress.inputComplete ? '입력 완료' : '입력 대기'}</span>}</button>; }) : <Empty title="현재 조건에 해당하는 출원이 없습니다." actions={<Button onClick={() => { setQuery(''); setStatus('all'); setExaminerId(''); }}>검색 조건 초기화</Button>} />}</section><section className="adm-editor">{editing === 'new' ? <CaseRegistration {...props} onClose={() => { dirty(false); setEditing(null); }} /> : selected ? <><EditorHeader title="선택한 대상 출원">{selected.applicationNumber}</EditorHeader><div className="adm-editor-body"><dl className="adm-detail-list"><div><dt>출원번호</dt><dd>{selected.applicationNumber}</dd></div><div><dt>담당 심사관</dt><dd>{selected.examinerName} · {selected.division}</dd></div><div><dt>그룹</dt><dd>{selected.groupName}</dd></div><div><dt>CPC</dt><dd>{selected.cpc || '—'}</dd></div><div><dt>선정 상태</dt><dd>{selected.status === 'confirmed' ? '선정 확정' : selected.status === 'cancelled' ? '선정 취소' : '선정 초안'}</dd></div></dl><div className="adm-actions"><a className="krds-btn medium ev-button" target="_blank" rel="noopener noreferrer" href={`/patent?applicationNumber=${encodeURIComponent(selected.applicationNumber)}`}>사건 조회 <span className="ev-new-window">새 창</span></a>{selected.status === 'confirmed' && <Button className="danger" disabled={busy || month.closed} onClick={async () => { if (window.confirm(`${selected.applicationNumber} 선정을 취소하시겠습니까? AI 담당 업무와 평가 집계에서 제외됩니다.`) && await props.save({ type: 'cancelCase', caseId: selected.id }, `${selected.applicationNumber} 선정을 취소했습니다.`)) setEditing(null); }}>선정 취소</Button>}</div>{month.closed && <p className="adm-secondary">마감한 운영월에서는 출원을 추가하거나 취소할 수 없습니다.</p>}</div></> : <Empty title="확인할 출원을 선택하세요." actions={<Button primary disabled={month.closed || busy} onClick={() => open('new')}>대상 출원 등록</Button>}>선정 확정한 출원은 운영상 필요한 경우 관리자가 취소할 수 있습니다.</Empty>}</section></div></>;
}

function CaseRegistration({ state, month, busy, dirty, save, onClose, onNavigate }: FormProps & { onClose: () => void }) {
  const [examinerId, setExaminerId] = useState(''); const [number, setNumber] = useState(''); const [cpc, setCpc] = useState(''); const [query, setQuery] = useState(''); const changed = Boolean(examinerId || number || cpc); useEffect(() => dirty(changed), [changed, dirty]);
  const candidates = state.users.filter((user) => month.participants.some((entry) => entry.userId === user.id)).filter((user) => user.id === examinerId || `${user.name} ${user.division}`.toLocaleLowerCase().includes(queryValue(query)));
  return <><EditorHeader title="대상 출원 등록">이달 참여 심사관에게 확정 출원으로 등록합니다.</EditorHeader><form className="adm-editor-body" onSubmit={async (event) => { event.preventDefault(); if (await save({ type: 'adminAddCase', monthId: month.id, examinerId, row: { applicationNumber: number, cpc } }, `${number} 출원을 등록했습니다.`)) { dirty(false); onClose(); } }}><label className="adm-field">담당 심사관 검색<input className="krds-input" placeholder="이름 또는 심사과" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="adm-field">담당 심사관 <span className="adm-required">필수</span><select className="krds-form-select" required disabled={busy || month.closed} value={examinerId} onChange={(event) => setExaminerId(event.target.value)}><option value="">심사관 선택</option>{candidates.map((user) => <option key={user.id} value={user.id}>{user.division} - {user.name}</option>)}</select></label>{!month.participants.length && <Empty title="이달 참여 심사관이 없습니다." actions={<Button onClick={() => onNavigate('month')}>월별 운영</Button>} />}<label className="adm-field">출원번호 <span className="adm-required">필수</span><input className="krds-input" required disabled={busy || month.closed} value={number} placeholder="10-2024-0000000" onChange={(event) => setNumber(event.target.value)} /></label><label className="adm-field">CPC · 선택<input className="krds-input" disabled={busy || month.closed} value={cpc} onChange={(event) => setCpc(event.target.value)} /></label><div className="adm-actions"><Button disabled={busy} onClick={() => { if (confirmDiscard(changed)) onClose(); }}>취소</Button><button type="submit" className="krds-btn medium ev-button primary" disabled={busy || month.closed || !examinerId || !number.trim()}>출원 등록</button></div></form></>;
}

function Overview(props: AdminProps & { navigateCases: (focus: string) => void }) {
  const { state, month, busy, save, notify, onNavigate, navigateCases, bureau } = props;
  const [groupId, setGroupId] = useState(''); const [examinerId, setExaminerId] = useState(''); const [detail, setDetail] = useState('followup'); const [status, setStatus] = useState('all');
  const stats = useMemo(() => getStatistics(state, month.id, groupId, examinerId), [state, month.id, groupId, examinerId]); const readiness = getAdminReadiness(state, month); const { summary } = stats;
  const followups = filterTargetCases(state, month.id, { status: status === 'all' ? 'confirmed' : status, groupId, examinerId });
  return <><div className="adm-toolbar"><select className="krds-form-select adm-filter" aria-label="운영 현황 그룹 필터" value={groupId} onChange={(event) => { setGroupId(event.target.value); setExaminerId(''); }}><option value="">전체 그룹</option>{state.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select className="krds-form-select adm-filter" aria-label="운영 현황 담당 심사관 필터" value={examinerId} onChange={(event) => setExaminerId(event.target.value)}><option value="">전체 담당 심사관</option>{state.users.filter((user) => month.participants.some((entry) => entry.userId === user.id && (!groupId || entry.groupId === groupId)) || stats.cases.some((item) => item.examinerId === user.id)).map((user) => <option key={user.id} value={user.id}>{user.division} - {user.name}</option>)}</select><Button onClick={async () => { const result = await exportAdminStatistics(state, month.id, groupId, examinerId, bureau); if (result) notify(result); }}>현재 범위 엑셀 저장</Button><Button primary={month.closed} disabled={busy} onClick={() => { if (window.confirm(month.closed ? `${monthLabel(month.id)} 운영을 재개방하시겠습니까? 설정한 기한 안에 입력과 평가를 다시 진행할 수 있습니다.` : `${monthLabel(month.id)} 운영을 마감하시겠습니까? 선정·검색 결과·평가와 월별 설정을 수정할 수 없게 됩니다.`)) void save({ type: 'setMonthClosed', monthId: month.id, closed: !month.closed }, month.closed ? `${monthLabel(month.id)} 운영을 재개방했습니다. 설정한 기한 안에 입력과 평가를 진행할 수 있습니다.` : `${monthLabel(month.id)} 운영을 마감했습니다. 자료 조회와 다운로드는 계속할 수 있습니다.`); }}>{month.closed ? '운영 재개방' : '월 운영 마감'}</Button></div><div className="adm-metrics"><Metric label="참여 심사관" value={`${summary.participants}명`} hint={`미선정 ${summary.unselected}명`} /><Metric label="확정 출원" value={`${summary.cases}건`} hint={`공개 문헌 ${summary.documents}건`} /><Metric label="AI 입력 완료" value={`${summary.inputComplete}건`} hint={`완료율 ${percent(summary.inputRate)}`} /><Metric label="평가 완료" value={`${summary.complete}건`} hint={`완료율 ${percent(summary.evaluationRate)}`} /></div><div className="adm-followups"><button type="button" className="adm-link-card" onClick={() => navigateCases('inputPending')}><span>AI 입력 대기</span><strong>{summary.inputPending}건</strong><span>담당 출원 찾기</span></button><button type="button" className="adm-link-card" onClick={() => navigateCases('recheck')}><span>평가 재확인 필요</span><strong>{summary.recheck}건</strong><span>변경된 결과 확인</span></button><button type="button" className="adm-link-card" onClick={() => onNavigate('examiners')}><span>담당 배정 확인</span><strong>{readiness.missingAssignments.length + readiness.unavailableAssignments.length}건</strong><span>심사관 관리</span></button></div><div className="adm-overview-grid"><section className="adm-list"><EditorHeader title="그룹별 진행" /><div className="adm-table-wrap"><table className="adm-table"><caption className="sr-only">그룹별 월 운영 진행</caption><thead><tr><th scope="col">그룹</th><th scope="col">대상건 선정</th><th scope="col">AI 검색 완료</th><th scope="col">평가 완료</th><th scope="col">완료율</th></tr></thead><tbody>{stats.groups.map((group) => <tr key={group.id}><td>{group.name}</td><td>{group.cases}</td><td>{group.inputComplete}</td><td>{group.complete}</td><td>{percent(group.completionRate)}</td></tr>)}</tbody></table>{!stats.groups.length && <Empty title="등록된 그룹이 없습니다." actions={<Button onClick={() => onNavigate('groups')}>그룹 등록</Button>} />}</div></section><section className="adm-list"><EditorHeader title="조사 방식별 평가" /><div className="adm-table-wrap"><table className="adm-table"><caption className="sr-only">조사 방식별 유효 평가 통계</caption><thead><tr><th scope="col">조사 방식</th><th scope="col">문헌 수</th><th scope="col">평균 점수</th><th scope="col">인용률</th><th scope="col">1위 횟수</th></tr></thead><tbody>{stats.methods.map((method) => <tr key={method.id}><td>{method.name}</td><td>{method.kind === 'baseline' ? '—' : method.documents}</td><td>{method.averageScore === null ? '—' : method.averageScore.toFixed(2)}</td><td>{percent(method.citationRate)}</td><td>{method.firstPlace}</td></tr>)}</tbody></table></div></section></div><section className="adm-list"><div className="adm-list-head"><div><h2>진행 상세</h2><p className="adm-secondary">미평가 {summary.unevaluated} · 평가 중 {summary.inProgress} · 재확인 필요 {summary.recheck}</p></div><div className="adm-inline-tabs">{[['followup', '출원별 후속 업무'], ['accounts', '계정별 진행'], ['documents', 'AI 문헌 평가']].map(([id, label]) => <button type="button" key={id} aria-pressed={detail === id} className={detail === id ? 'is-selected' : ''} onClick={() => setDetail(id)}>{label}</button>)}</div></div>{detail === 'followup' ? <><div className="adm-toolbar adm-inset"><select className="krds-form-select adm-filter" aria-label="후속 업무 상태" value={status} onChange={(event) => setStatus(event.target.value)}>{caseFilters.filter(([value]) => !['draft', 'cancelled', 'confirmed'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="adm-secondary">{followups.length}건</span></div><div className="adm-table-wrap"><table className="adm-table"><caption className="sr-only">현재 조회 범위의 출원별 후속 업무</caption><thead><tr><th scope="col">출원번호</th><th scope="col">담당 심사관</th><th scope="col">그룹</th><th scope="col">AI 입력</th><th scope="col">평가 상태</th></tr></thead><tbody>{followups.map((item) => { const progress = caseStatus(state, item); return <tr key={item.id}><td>{item.applicationNumber}</td><td>{item.examinerName}</td><td>{item.groupName}</td><td>{progress.inputComplete ? '입력 완료' : '대기 중'}</td><td><Pill tone={progress.stale ? 'is-warning' : progress.complete ? 'is-active' : ''}>{progress.evaluationStatus}</Pill></td></tr>; })}</tbody></table>{!followups.length && <Empty title="현재 조건의 후속 업무가 없습니다." />}</div></> : detail === 'accounts' ? <div className="adm-table-wrap"><table className="adm-table"><caption className="sr-only">계정별 심사 및 AI 담당 업무 진행</caption><thead><tr><th scope="col">심사과</th><th scope="col">이름</th><th scope="col">개인 출원</th><th scope="col">평가 완료</th><th scope="col">AI 담당 대상</th><th scope="col">AI 입력 완료</th></tr></thead><tbody>{stats.accounts.map((account) => <tr key={account.id}><td>{account.division}</td><td>{account.name}</td><td>{account.cases}</td><td>{account.complete}</td><td>{account.aiTarget}</td><td>{account.aiCompleted}</td></tr>)}</tbody></table></div> : <div className="adm-table-wrap"><table className="adm-table"><caption className="sr-only">AI 문헌별 최신 결과에 대한 평가</caption><thead><tr><th scope="col">출원번호</th><th scope="col">담당 심사관</th><th scope="col">AI 담당자</th><th scope="col">조사 방식</th><th scope="col">AI 검색 결과</th><th scope="col">인용여부</th><th scope="col">점수</th><th scope="col">평가 상태</th></tr></thead><tbody>{stats.rows.map((row) => <tr key={`${row.caseId}:${row.methodId}:${row.number}`}><td>{row.applicationNumber}</td><td>{row.examinerName}</td><td>{row.authorName}</td><td>{row.methodName}</td><td>{row.number}</td><td>{row.cited ?? '—'}</td><td>{row.score ?? '—'}</td><td>{row.status}</td></tr>)}</tbody></table>{!stats.rows.length && <Empty title="공개된 AI 문헌이 없습니다." />}</div>}</section></>;
}

export async function exportAdminStatistics(state: EvaluationState, monthId: string, groupId = '', examinerId = '', bureau?: Bureau) {
  const stats = getStatistics(state, monthId, groupId, examinerId);
  return exportWorkbook(`AI 선행기술 검색 포털_${bureau ? `${bureau}_` : ''}관리자통계_${monthId}.xlsx`, [
    { name: '그룹별 통계', rows: [['그룹', '참여자', '확정 출원', 'AI 입력 완료', '평가 완료', '문헌 수', '평가 완료율'], ...stats.groups.map((row) => [row.name, row.participants, row.cases, row.inputComplete, row.complete, row.documents, percent(row.completionRate)])] },
    { name: '계정별 현황', rows: [['심사과', '이름', '개인 출원', '평가 완료', 'AI 담당 대상', 'AI 담당 입력 완료'], ...stats.accounts.map((row) => [row.division, row.name, row.cases, row.complete, row.aiTarget, row.aiCompleted])] },
    { name: '출원별 현황', rows: [['출원번호', 'CPC', '담당 심사관', '그룹', 'AI 입력 상태', '평가 상태'], ...stats.cases.map((row) => [row.applicationNumber, row.cpc, row.examinerName, row.groupName, row.inputComplete ? '입력 완료' : '대기 중', row.evaluationStatus])] },
    { name: '조사 방식별 통계', rows: [['조사 방식', '입력 대상', '입력 완료', '입력 대기', '문헌 수', '평균 점수', '인용률', '1위 횟수'], ...stats.methods.map((row) => [row.name, row.target, row.completed, row.pending, row.documents, row.averageScore, percent(row.citationRate), row.firstPlace])] },
    { name: 'AI 검색 결과 평가', rows: [['출원번호', '담당 심사관', 'AI 담당자', '조사 방식', 'AI 검색 결과', '인용여부', '점수', '평가 상태'], ...stats.rows.map((row) => [row.applicationNumber, row.examinerName, row.authorName, row.methodName, row.number, row.cited, row.score, row.status])] },
    { name: '조회 기준', rows: [['항목', '값'], ['심사국', bureau || '기존 공용 업무'], ['운영월', monthId], ['그룹', state.groups.find((group) => group.id === groupId)?.name || '전체 그룹'], ['담당 심사관', state.users.find((user) => user.id === examinerId)?.name || '전체 심사관'], ['집계 기준', '선정 확정·공개된 최신 AI 결과의 유효 평가. 초안·취소 출원 제외.'], ['가상 자료 여부', state.isDemo ? '가상 검증 자료' : '운영 자료']] },
  ]);
}
