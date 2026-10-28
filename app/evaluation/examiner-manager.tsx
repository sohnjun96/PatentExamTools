'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AccessibleDialog from '@/app/components/accessible-dialog';
import { currentGroups, personnelOf, type EvaluationGroup, type EvaluationState, type EvaluationUser, type Role } from '@/app/lib/evaluation';
import type { AdminProps } from './admin-workspace';

type Save = AdminProps['save'];
type Props = Pick<AdminProps, 'state' | 'bureau' | 'busy' | 'save' | 'dirty' | 'saveFeedback'>;
type Responsibility = { groupId: string; methodId: string };
type ExaminerForm = Omit<EvaluationUser, 'id'> & { id?: string; groupId: string; responsibilities: Responsibility[] };
type Dialog = { kind: 'account' | 'group' | 'delete-group'; id?: string } | null;
const roles: { value: Role; label: string }[] = [{ value: 'examiner', label: '심사관' }, { value: 'ai', label: 'AI 담당자' }, { value: 'admin', label: '관리자' }];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const groupTitle = (name: string) => name.endsWith('그룹') ? name : name + ' 그룹';
const cellKey = (entry: Responsibility) => JSON.stringify([entry.groupId, entry.methodId]);
const confirmDiscard = (changed: boolean) => !changed || window.confirm('저장하지 않은 입력이 있습니다. 입력을 버리고 닫으시겠습니까?');

function Button({ children, primary = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button type="button" {...props} className={'krds-btn medium ev-button ' + (primary ? 'primary ' : '') + (props.className || '')}>{children}</button>;
}
function Pill({ children, inactive = false }: { children: ReactNode; inactive?: boolean }) { return <span className={'adm-pill ' + (inactive ? 'is-inactive' : '')}>{children}</span>; }
function Empty({ title, actions }: { title: string; actions?: ReactNode }) { return <div className="adm-empty"><h3>{title}</h3>{actions && <div className="adm-empty-actions">{actions}</div>}</div>; }
function SaveFailure({ children }: { children?: ReactNode }) { return children || <div className="ev-alert" role="alert"><p>저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.</p></div>; }

export function filterAdminUsers(users: EvaluationUser[], query = '', role = 'all', status = 'all') {
  const search = query.trim().toLocaleLowerCase();
  return users.filter((user) => (!search || (user.name + ' ' + user.division).toLocaleLowerCase().includes(search)) && (role === 'all' || user.roles.includes(role as Role)) && (status === 'all' || user.active === (status === 'active')));
}

export function examinerForm(state: EvaluationState, user?: EvaluationUser, bureau?: Props['bureau']): ExaminerForm {
  const personnel = personnelOf(state);
  return {
    ...(user || { name: '', bureau: bureau || '', division: '', roles: ['examiner'] as Role[], active: true }),
    bureau: bureau || user?.bureau || '',
    groupId: personnel.memberships.find((entry) => entry.userId === user?.id)?.groupId || '',
    responsibilities: personnel.assignments.filter((entry) => entry.userId === user?.id).map(({ groupId, methodId }) => ({ groupId, methodId })),
  };
}

export default function ExaminerManager(props: Props) {
  const { state, busy, dirty } = props;
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [groupFilter, setGroupFilter] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [modalDirty, setModalDirty] = useState(false);
  useEffect(() => dirty(modalDirty), [modalDirty, dirty]);
  const groups = currentGroups(state);
  const personnel = personnelOf(state);
  const visible = filterAdminUsers(state.users, query, role, status).filter((user) => {
    const groupId = personnel.memberships.find((entry) => entry.userId === user.id)?.groupId;
    return !groupFilter || (groupFilter === '__unassigned__' ? !groupId : groupId === groupFilter);
  });
  const selectedUser = state.users.find((user) => user.id === dialog?.id);
  const selectedGroup = groups.find((group) => group.id === dialog?.id);
  function open(next: NonNullable<Dialog>) { if (!busy && !dialog) { setModalDirty(false); setDialog(next); } }
  function close() { setModalDirty(false); dirty(false); setDialog(null); }
  const saveAccount: Save = async (action, message) => {
    const saved = await props.save(action, message);
    if (saved) { setQuery(''); setRole('all'); setStatus('all'); setGroupFilter(''); }
    return saved;
  };
  return <>
    <section className="adm-list adm-group-directory" aria-labelledby="adm-group-directory-title">
      <div className="adm-list-head"><div className="adm-section-title"><h2 id="adm-group-directory-title">그룹</h2><span className="adm-secondary">{groups.length}개</span></div><Button primary disabled={busy} aria-haspopup="dialog" onClick={() => open({ kind: 'group' })}>그룹 추가</Button></div>
      {groups.length ? <div className="adm-group-grid">{groups.map((group) => {
        const members = state.users.filter((user) => personnel.memberships.some((entry) => entry.groupId === group.id && entry.userId === user.id));
        return <article className="adm-group-card" key={group.id}>
          <header><div><h3>{group.name}</h3><span className="adm-secondary">{members.length}명</span></div><div className="adm-group-actions"><Button disabled={busy} aria-haspopup="dialog" aria-label={groupTitle(group.name) + ' 수정'} onClick={() => open({ kind: 'group', id: group.id })}>수정</Button><Button className="danger" disabled={busy} aria-haspopup="dialog" aria-label={groupTitle(group.name) + ' 삭제'} onClick={() => open({ kind: 'delete-group', id: group.id })}>삭제</Button></div></header>
          {members.length ? <ul className="adm-group-members" aria-label={group.name + ' 그룹원'}>{members.map((user) => <li key={user.id}><button type="button" className="adm-member-link" disabled={busy} aria-haspopup="dialog" aria-label={group.name + ' 그룹원 ' + user.name + (user.roles.includes('ai') ? ' AI 담당자' : '') + ' 정보 수정'} onClick={() => open({ kind: 'account', id: user.id })}>{user.name}{user.roles.includes('ai') && <span className="ev-examiner-role">AI 담당자</span>}{!user.active && <span className="adm-member-inactive">비활성</span>}</button></li>)}</ul> : <p className="adm-secondary">그룹원 없음</p>}
        </article>;
      })}</div> : <Empty title="등록된 그룹이 없습니다." />}
    </section>
    <section className="adm-list adm-personnel-directory" aria-labelledby="adm-examiner-list-title">
      <div className="adm-list-head"><div className="adm-section-title"><h2 id="adm-examiner-list-title">심사관</h2><span className="adm-secondary">{visible.length} / {state.users.length}명</span></div><Button primary disabled={busy} aria-haspopup="dialog" onClick={() => open({ kind: 'account' })}>심사관 등록</Button></div>
      <div className="adm-toolbar adm-directory-toolbar">
        <div className="adm-search"><label className="sr-only" htmlFor="adm-account-search">이름 또는 심사과 검색</label><input id="adm-account-search" className="krds-input" placeholder="이름 또는 심사과 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <select className="krds-form-select adm-filter" aria-label="계정 역할 필터" value={role} onChange={(event) => setRole(event.target.value)}><option value="all">전체 권한</option>{roles.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select>
        <select className="krds-form-select adm-filter" aria-label="계정 활성 상태 필터" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">전체 상태</option><option value="active">활성</option><option value="inactive">비활성</option></select>
        <select className="krds-form-select adm-filter" aria-label="소속 그룹 필터" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="">전체 그룹</option><option value="__unassigned__">그룹 미배정</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
      </div>
      <div className="adm-table-wrap"><table className="adm-table adm-directory-table"><caption className="sr-only">심사관별 심사과, 소속 그룹, 권한과 담당 AI</caption><thead><tr>{['심사관명', '심사과', '소속 그룹', '권한', '담당 AI'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{visible.map((user) => {
        const membership = personnel.memberships.find((entry) => entry.userId === user.id);
        const group = groups.find((entry) => entry.id === membership?.groupId);
        const responsibilities = personnel.assignments.filter((entry) => entry.userId === user.id);
        return <tr key={user.id}>
          <td><button type="button" className="adm-person-name" disabled={busy} aria-haspopup="dialog" aria-label={user.name + ' 심사관 정보 수정'} onClick={() => open({ kind: 'account', id: user.id })}>{user.name}</button>{user.roles.includes('ai') && <span className="ev-examiner-role adm-person-ai-role">AI 담당자</span>}{!user.active && <Pill inactive>비활성</Pill>}</td>
          <td>{user.division || '—'}</td><td>{group?.name || '그룹 미배정'}</td>
          <td><div className="adm-personnel-tags">{user.roles.map((value) => <Pill key={value}>{roles.find((entry) => entry.value === value)?.label || value}</Pill>)}</div></td>
          <td>{responsibilities.length ? <ul className="adm-directory-ai">{responsibilities.map((entry) => {
            const assignedGroup = state.groups.find((group) => group.id === entry.groupId);
            const method = state.methods.find((method) => method.id === entry.methodId);
            return <li key={cellKey(entry)}><span>{entry.groupId !== group?.id && <span className="adm-secondary">{assignedGroup?.name || '그룹 확인 필요'}{assignedGroup?.deletedAt && ' · 기존 출원'}</span>}{method?.name || 'AI 확인 필요'}</span></li>;
          })}</ul> : '—'}</td>
        </tr>;
      })}</tbody></table></div>
      {!visible.length && <Empty title={state.users.length ? '검색 조건에 맞는 계정이 없습니다.' : '등록된 심사관이 없습니다.'} actions={state.users.length ? <Button onClick={() => { setQuery(''); setRole('all'); setStatus('all'); setGroupFilter(''); }}>검색 조건 초기화</Button> : undefined} />}
    </section>
    {dialog?.kind === 'account' && (!dialog.id || selectedUser) && <AccountEditor state={state} user={selectedUser} bureau={props.bureau} busy={busy} save={saveAccount} dirty={setModalDirty} saveFeedback={props.saveFeedback} onClose={close} />}
    {dialog?.kind === 'group' && (!dialog.id || selectedGroup) && <GroupEditor group={selectedGroup} busy={busy} save={props.save} dirty={setModalDirty} saveFeedback={props.saveFeedback} onClose={close} />}
    {dialog?.kind === 'delete-group' && selectedGroup && <GroupDeleteDialog state={state} group={selectedGroup} busy={busy} save={props.save} saveFeedback={props.saveFeedback} onClose={close} />}
  </>;
}

export function AccountEditor({ state, user, bureau, busy, save, dirty, onClose, saveFeedback }: Props & { user?: EvaluationUser; onClose: () => void }) {
  const original = useMemo(() => examinerForm(state, user, bureau), [state, user, bureau]);
  const [form, setForm] = useState<ExaminerForm>(original);
  const [submitFailed, setSubmitFailed] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const changed = !same(form, original);
  useEffect(() => dirty(changed), [changed, dirty]);
  useEffect(() => { if (submitFailed && !busy) feedback.current?.focus(); }, [submitFailed, busy]);
  const personnel = personnelOf(state);
  const methods = state.methods.filter((method) => method.kind === 'ai');
  const groups = currentGroups(state);
  const historicalGroups = state.groups.filter((group) => group.deletedAt && (original.responsibilities.some((entry) => entry.groupId === group.id) || state.cases.some((item) => item.groupId === group.id && item.status === 'confirmed' && !state.months.find((month) => month.id === item.monthId)?.closed)));
  const selectedKeys = new Set(form.responsibilities.map(cellKey));
  const transferred = form.roles.includes('ai') ? personnel.assignments.filter((entry) => entry.userId !== user?.id && selectedKeys.has(cellKey(entry))) : [];
  const inactiveNew = !form.active && form.roles.includes('ai') && form.responsibilities.some((entry) => !original.responsibilities.some((old) => cellKey(old) === cellKey(entry)));
  function update(patch: Partial<ExaminerForm>) { setForm((previous) => ({ ...previous, ...patch })); dirty(true); }
  function requestClose() { if (!busy && !submitting.current && confirmDiscard(changed)) onClose(); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || submitting.current || !form.name.trim() || !form.roles.length || inactiveNew || (Boolean(user) && !changed)) return;
    submitting.current = true; setSubmitFailed(false);
    const { groupId, responsibilities, ...account } = form;
    try {
      if (await save({ type: 'saveExaminer', user: { ...account, bureau: bureau || account.bureau }, groupId, responsibilities: form.roles.includes('ai') ? responsibilities : [] }, form.name + (user ? ' 심사관 정보를 저장했습니다.' : ' 심사관을 등록했습니다.'))) { dirty(false); onClose(); }
      else setSubmitFailed(true);
    } finally { submitting.current = false; }
  }
  function assignmentTable(items: EvaluationGroup[]) {
    return <div className="adm-table-wrap"><table className="adm-table adm-assignment-table"><caption className="sr-only">그룹과 AI 종류별 담당 업무 선택</caption><thead><tr><th scope="col">그룹</th>{methods.map((method) => <th key={method.id} scope="col">{method.name}{!method.active && <Pill inactive>비활성</Pill>}</th>)}</tr></thead><tbody>{items.map((group) => <tr key={group.id}><th scope="row">{group.name}{group.deletedAt && <Pill inactive>기존 출원</Pill>}</th>{methods.map((method) => {
      const entry = { groupId: group.id, methodId: method.id };
      const key = cellKey(entry);
      const checked = selectedKeys.has(key);
      const owner = personnel.assignments.find((old) => cellKey(old) === key);
      const other = owner && owner.userId !== user?.id ? state.users.find((candidate) => candidate.id === owner.userId) : undefined;
      return <td key={method.id}><label className="adm-assignment-choice"><input type="checkbox" aria-label={group.name + ' ' + method.name + ' 담당'} disabled={busy || (!form.active && !checked)} checked={checked} onChange={(event) => update({ responsibilities: event.target.checked ? [...form.responsibilities, entry] : form.responsibilities.filter((old) => cellKey(old) !== key) })} /><span>{other ? '현재: ' + other.name : owner ? '담당 중' : '미배정'}</span></label></td>;
    })}</tr>)}</tbody></table></div>;
  }
  return <AccessibleDialog labelledBy="adm-account-dialog-title" className="adm-form-modal adm-personnel-modal" onClose={requestClose}>
    <header><h2 id="adm-account-dialog-title">{user ? user.name + ' 정보 수정' : '심사관 등록'}</h2><Button disabled={busy} aria-label="계정 편집 닫기" onClick={requestClose}>닫기</Button></header>
    <form className="adm-modal-form" onSubmit={submit} aria-busy={busy}>
      <div className="adm-editor-body adm-modal-fields">
        {submitFailed && <div ref={feedback} className="adm-modal-feedback" tabIndex={-1}><SaveFailure>{saveFeedback}</SaveFailure></div>}
        <div className="adm-form-grid">
          <label className="adm-field">심사관명 <span className="adm-required">필수</span><input className="krds-input" data-dialog-autofocus required maxLength={200} disabled={busy} value={form.name} onChange={(event) => update({ name: event.target.value })} /></label>
          <label className="adm-field">심사과<input className="krds-input" maxLength={200} disabled={busy} value={form.division} onChange={(event) => update({ division: event.target.value })} /></label>
          <label className="adm-field">심사국<input className="krds-input" maxLength={200} disabled={busy} readOnly={Boolean(bureau)} value={bureau || form.bureau} onChange={(event) => update({ bureau: event.target.value })} /></label>
          <label className="adm-field">소속 그룹<select className="krds-form-select" disabled={busy} value={form.groupId} onChange={(event) => update({ groupId: event.target.value })}><option value="">그룹 미배정</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        </div>
        <fieldset className="adm-fieldset" disabled={busy}><legend className="adm-label">권한 <span className="adm-required">1개 이상</span></legend><div className="adm-check-list">{roles.map((role) => <label key={role.value} className="adm-check-row"><input type="checkbox" checked={form.roles.includes(role.value)} onChange={(event) => update({ roles: event.target.checked ? [...form.roles, role.value] : form.roles.filter((entry) => entry !== role.value) })} /><span>{role.label}</span></label>)}</div></fieldset>
        <label className="adm-field">계정 상태<select className="krds-form-select" disabled={busy} value={form.active ? 'active' : 'inactive'} onChange={(event) => update({ active: event.target.value === 'active' })}><option value="active">활성</option><option value="inactive">비활성</option></select></label>
        {form.roles.includes('ai') && <fieldset className="adm-fieldset" disabled={busy}><legend className="adm-label">담당 AI</legend>{methods.length ? <>{groups.length ? assignmentTable(groups) : <p className="adm-secondary">등록된 그룹이 없습니다.</p>}{historicalGroups.length > 0 && <details className="adm-historical-groups" open={historicalGroups.some((group) => original.responsibilities.some((entry) => entry.groupId === group.id))}><summary>기존 출원 그룹</summary>{assignmentTable(historicalGroups)}</details>}</> : <p className="adm-secondary">등록된 AI 종류가 없습니다.</p>}</fieldset>}
        {!form.roles.includes('ai') && original.responsibilities.length > 0 && <p className="ev-notice warning">AI 담당자 권한을 해제하면 담당 AI 배정도 해제됩니다.</p>}
        {transferred.length > 0 && <div className="ev-notice warning"><strong>담당자 변경</strong><ul>{transferred.map((entry) => <li key={cellKey(entry)}>{state.groups.find((group) => group.id === entry.groupId)?.name} · {state.methods.find((method) => method.id === entry.methodId)?.name}: {state.users.find((candidate) => candidate.id === entry.userId)?.name || '기존 담당자'} → {form.name || '이 심사관'}</li>)}</ul></div>}
        {inactiveNew && <p className="adm-inline-error">비활성 계정의 신규 AI 배정을 해제하거나 계정을 활성화하세요.</p>}
      </div>
      <footer className="adm-actions adm-modal-actions">{changed && <span className="adm-dirty is-dirty" role="status">미저장 변경 있음</span>}<Button disabled={busy} onClick={requestClose}>취소</Button><button type="submit" className="krds-btn medium ev-button primary" disabled={busy || !form.name.trim() || !form.roles.length || inactiveNew || (Boolean(user) && !changed)}>{busy ? '저장 중…' : user ? '변경 저장' : '심사관 등록'}</button></footer>
    </form>
  </AccessibleDialog>;
}

export function GroupEditor({ group, busy, save, dirty, onClose, saveFeedback }: Pick<Props, 'busy' | 'save' | 'dirty' | 'saveFeedback'> & { group?: EvaluationGroup; onClose: () => void }) {
  const [name, setName] = useState(group?.name || '');
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const changed = name !== (group?.name || '');
  useEffect(() => dirty(changed), [changed, dirty]);
  useEffect(() => { if (failed && !busy) feedback.current?.focus(); }, [failed, busy]);
  function close() { if (!busy && !submitting.current && confirmDiscard(changed)) onClose(); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || submitting.current || !name.trim() || (group && !changed)) return;
    submitting.current = true; setFailed(false);
    try { if (await save({ type: 'saveGroup', group: { id: group?.id, name } }, groupTitle(name) + (group ? '을 수정했습니다.' : '을 추가했습니다.'))) { dirty(false); onClose(); } else setFailed(true); }
    finally { submitting.current = false; }
  }
  return <AccessibleDialog labelledBy="adm-group-dialog-title" className="adm-form-modal" onClose={close}><header><h2 id="adm-group-dialog-title">{group ? groupTitle(group.name) + ' 수정' : '그룹 추가'}</h2><Button disabled={busy} aria-label="그룹 편집 닫기" onClick={close}>닫기</Button></header><form className="adm-modal-form" onSubmit={submit} aria-busy={busy}><div className="adm-editor-body adm-modal-fields">{failed && <div ref={feedback} tabIndex={-1}><SaveFailure>{saveFeedback}</SaveFailure></div>}<label className="adm-field">그룹 이름 <span className="adm-required">필수</span><input className="krds-input" data-dialog-autofocus required maxLength={200} disabled={busy} value={name} onChange={(event) => { setName(event.target.value); dirty(true); }} /></label>{group && <p className="adm-secondary">확정 출원의 그룹명은 바뀌지 않습니다.</p>}</div><footer className="adm-actions adm-modal-actions"><Button disabled={busy} onClick={close}>취소</Button><button type="submit" className="krds-btn medium ev-button primary" disabled={busy || !name.trim() || (Boolean(group) && !changed)}>{busy ? '저장 중…' : group ? '그룹 변경 저장' : '그룹 추가'}</button></footer></form></AccessibleDialog>;
}

export function GroupDeleteDialog({ state, group, busy, save, onClose, saveFeedback }: Pick<Props, 'state' | 'busy' | 'save' | 'saveFeedback'> & { group: EvaluationGroup; onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const personnel = personnelOf(state);
  const memberCount = personnel.memberships.filter((entry) => entry.groupId === group.id).length;
  const assignments = personnel.assignments.filter((entry) => entry.groupId === group.id).length;
  const hasConfirmedCases = state.cases.some((item) => item.groupId === group.id && item.status === 'confirmed');
  useEffect(() => { if (failed && !busy) feedback.current?.focus(); }, [failed, busy]);
  function close() { if (!busy && !submitting.current) onClose(); }
  async function remove() {
    if (busy || submitting.current) return; submitting.current = true; setFailed(false);
    try { if (await save({ type: 'deleteGroup', groupId: group.id }, groupTitle(group.name) + '을 삭제했습니다.')) onClose(); else setFailed(true); }
    finally { submitting.current = false; }
  }
  return <AccessibleDialog labelledBy="adm-group-delete-title" className="adm-form-modal" onClose={close}><header><h2 id="adm-group-delete-title">{groupTitle(group.name)} 삭제</h2><Button disabled={busy} aria-label="그룹 삭제 닫기" onClick={close}>닫기</Button></header><div className="adm-editor-body">{failed && <div ref={feedback} tabIndex={-1}><SaveFailure>{saveFeedback}</SaveFailure></div>}<p>{memberCount ? '그룹원 ' + memberCount + '명은 그룹 미배정으로 변경됩니다.' : '이 그룹을 목록에서 삭제합니다.'}</p><p className="adm-secondary">{hasConfirmedCases ? '기존 출원과 해당 출원의 AI 담당 업무는 유지됩니다.' : assignments ? 'AI 담당 배정 ' + assignments + '건은 해제됩니다. 기존 출원 기록은 유지됩니다.' : '기존 출원 기록은 유지됩니다.'}</p></div><footer className="adm-actions adm-modal-actions"><Button data-dialog-autofocus disabled={busy} onClick={close}>취소</Button><Button className="danger" disabled={busy} onClick={() => void remove()}>{busy ? '삭제 중…' : '그룹 삭제'}</Button></footer></AccessibleDialog>;
}
