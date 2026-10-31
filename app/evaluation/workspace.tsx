'use client';

import AppIcon from '@/app/components/app-icon';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  aiMethods, ALL_OPERATION_MONTHS, canInputResult, caseMethods, caseStatus, getStatistics, rankingIsCurrent,
  resultFor, isOperationStageOpen, operationStageBlockReason, isDemoApplicationNumber,
  type EvaluationAction, type EvaluationCase, type EvaluationState,
  type EvaluationUser, type OperationMonth, type OperationStage, type RankValue, type SelectionRow,
} from '@/app/lib/evaluation';
import TargetPublicationDownload from '@/app/components/target-publication-download';
import TargetPublicationArchive from '@/app/components/target-publication-archive';
import BureauNotice from '@/app/components/bureau-notice';
import OperationSchedule from '@/app/components/operation-schedule';
import ReportPresenceToggle from '@/app/components/report-presence-toggle';
import StandardSearchPromptButton from '@/app/components/standard-search-prompt-button';
import { standardSearchPromptText } from '@/app/lib/standard-search-prompt';
import { currentGroups, personnelOf, listedOperationMonths, preferredOperationMonth, operationMonthStatus, OPERATION_MONTH_STATUS_LABELS } from '@/app/lib/evaluation';
import AdminWorkspace, { ADMIN_NAV, readAdminSection, type AdminSection } from './admin-workspace';
import { exportWorkbook } from '@/app/lib/export-workbook';
import { readWorkspaceLocation, saveFailureGuidance, viewForRoles } from '@/app/lib/workspace-location';
import { BUREAUS, bureauPath, evaluationApiUrl, type Bureau } from '@/app/lib/bureaus';
import { taskWindowUrl, openTaskWindow, TASK_UPDATE_CHANNEL } from '@/app/lib/task-window';
import './evaluation.css';

type ActionHandler = (action: EvaluationAction, message?: string) => Promise<boolean>;
type Shared = { state: EvaluationState; month: OperationMonth; save: ActionHandler; busy: boolean; dirty: (value: boolean) => void; hasUnsaved?: boolean; bureau?: Bureau };
type View = 'review' | 'ai' | 'stats' | 'settings';
const normalized = (value: string) => value.replace(/[\s\-.,]/g, '').toUpperCase();
const numberLabel = (value: string) => { const digits = value.replace(/\D/g, ''); return digits.length === 13 ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}` : value; };
const reportPresenceLabel = (value: boolean | undefined) => value === true ? '있음' : value === false ? '없음' : '미기록';
const monthLabel = (value: string) => `${value.slice(0, 4)}년 ${Number(value.slice(5))}월`;

export function workspaceSessionKey(prefix: string, bureau?: Bureau) {
  return bureau ? `${prefix}:bureau:${bureau}` : prefix;
}

export function stateForWorkspaceScope<T>(state: T | null, loadedScope: string, currentScope: string, sessionReady: boolean): T | null {
  return sessionReady && loadedScope === currentScope ? state : null;
}

export function readScopedWorkspaceLocation(raw: string | null, admin: boolean, bureau?: Bureau) {
  const stored = readWorkspaceLocation(raw, admin);
  if (admin && bureau) {
    try {
      const value = raw ? JSON.parse(raw) as { view?: unknown } | null : null;
      if (!value || !['stats', 'settings'].includes(String(value.view))) stored.view = 'settings';
    } catch { stored.view = 'settings'; }
  }
  return stored;
}

function useRememberedSelection(key: string) {
  const [stored, setStored] = useState({ key: '', value: '' });
  useEffect(() => {
    let value = '';
    try { value = sessionStorage.getItem(key) || ''; } catch { /* Storage is optional. */ }
    setStored({ key, value });
  }, [key]);
  useEffect(() => { if (stored.key === key) { try { sessionStorage.setItem(key, stored.value); } catch { /* Storage is optional. */ } } }, [key, stored]);
  const setValue = useCallback((value: string) => setStored({ key, value }), [key]);
  return [stored.key === key ? stored.value : '', setValue] as const;
}

function Badge({ children, color = '' }: { children: React.ReactNode; color?: string }) { return <span className={`ev-badge ${color}`}>{children}</span>; }
function Empty({ title, children }: { title: string; children?: React.ReactNode }) { return <div className="ev-empty"><div className="ev-empty-icon"><AppIcon name="clipboard-list" size={28} /></div><h3>{title}</h3>{children}</div>; }
function Status({ state, item }: { state: EvaluationState; item: EvaluationCase }) { const status = caseStatus(state, item); return <Badge color={status.complete ? 'blue' : status.stale ? 'orange' : ''}>{status.evaluationStatus}</Badge>; }
function Panel({ title, description, action, children }: { title: string; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) { return <section className="ev-panel"><div className="ev-panel-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>; }
function StageNotice({ month, stage }: { month: OperationMonth; stage: OperationStage }) {
  const reason = operationStageBlockReason(month, stage);
  return !month.closed && reason ? <div className="ev-notice warning" role="status">{reason}</div> : null;
}
function BureauEntryLinks() {
  return <section className="ev-bureau-entry" aria-labelledby="bureau-entry-heading">
    <h2 id="bureau-entry-heading">소속 국의 평가 업무로 이동</h2>
    <p>심사국을 선택하세요.</p>
    <div className="ev-bureau-entry-grid">{BUREAUS.map((bureau) => <div className="ev-bureau-entry-card" key={bureau}>
      <a className="ev-bureau-entry-name" href={bureauPath(bureau)}>{bureau}<AppIcon name="arrow-right" /></a>
    </div>)}</div>
    <p className="ev-bureau-legacy-note">공용 업무는 아래에서 시작하세요.</p>
  </section>;
}

export function AITaskCard({ item, methodName, selected = false, complete, demo, href }: {
  item: EvaluationCase; methodName: string; selected?: boolean; complete: boolean; demo: boolean; href: string;
}) {
  const synthetic = demo && isDemoApplicationNumber(item.applicationNumber);
  return <div className={`ev-case-task ${selected ? 'active' : ''}`}>
    <a className={`ev-case ${selected ? 'active' : ''}`} href={href} target="_blank" rel="noopener noreferrer" onClick={openTaskWindow} aria-label={`${item.applicationNumber} ${methodName} 결과 입력, 새 창`}>
      <strong>{numberLabel(item.applicationNumber)}</strong><span className="ev-muted">{item.examinerName} · {item.groupName}</span>
      <div className="ev-case-status"><Badge>{methodName}</Badge><Badge color={complete ? 'blue' : ''}>{complete ? '입력 완료' : '대기 중'}</Badge></div>
    </a>
    <div className="ev-case-pdf"><TargetPublicationDownload applicationNumber={item.applicationNumber} disabled={synthetic} context="list" showContext={false} />{synthetic && <span className="ev-case-pdf-note">가상 출원번호는 PDF를 받을 수 없습니다.</span>}</div>
  </div>;
}

export default function EvaluationWorkspace({ admin = false, bureau }: { admin?: boolean; bureau?: Bureau }) {
  const [storedState, setState] = useState<EvaluationState | null>(null);
  const [stateScopeKey, setStateScopeKey] = useState('');
  const [revision, setRevision] = useState(0);
  const [userId, setUserId] = useState('');
  const [monthId, setMonthId] = useState('');
  const [view, setView] = useState<View>(admin ? bureau ? 'settings' : 'stats' : 'review');
  const [adminSection, setAdminSection] = useState<AdminSection>(bureau ? 'examiners' : 'overview');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadSerial, setLoadSerial] = useState(0);
  const [restoredSessionKey, setRestoredSessionKey] = useState('');
  const [conflict, setConflict] = useState(false);
  const lastAttempt = useRef<EvaluationAction | null>(null);
  const sessionKey = workspaceSessionKey(`simsadesk-workspace-${admin ? 'admin' : 'user'}`, bureau);
  const sessionReady = restoredSessionKey === sessionKey;
  const state = stateForWorkspaceScope(storedState, stateScopeKey, sessionKey, sessionReady);
  const loadGeneration = useRef(0);
  const saveGeneration = useRef(0);
  useEffect(() => {
    loadGeneration.current++; saveGeneration.current++;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(sessionKey); } catch { /* Storage is optional. */ }
    const stored = readScopedWorkspaceLocation(raw, admin, bureau);
    setUserId(stored.userId); setMonthId(stored.monthId); setView(stored.view); setAdminSection(readAdminSection(raw, bureau, stored.view));
    setState(null); setStateScopeKey(''); setLoading(true); setBusy(false); setDirty(false); setError(''); setNotice(''); setConflict(false);
    lastAttempt.current = null;
    setRestoredSessionKey(sessionKey);
    return () => { loadGeneration.current++; saveGeneration.current++; };
  }, [admin, bureau, sessionKey]);
  useEffect(() => {
    if (!sessionReady) return;
    try { sessionStorage.setItem(sessionKey, JSON.stringify({ userId, monthId, view, adminSection })); } catch { /* Storage is optional. */ }
  }, [sessionReady, sessionKey, userId, monthId, view, adminSection]);
  const load = useCallback(async (selectedUser = userId) => {
    const requestId = ++loadGeneration.current;
    setLoading(true); setError('');
    try {
      const response = await fetch(evaluationApiUrl(bureau, admin, selectedUser), { cache: 'no-store' });
      const payload = await response.json() as { state: EvaluationState; revision: number; error?: string; warnings?: string[] };
      if (!response.ok) throw new Error(payload.error || '업무 자료를 불러오지 못했습니다.');
      if (requestId !== loadGeneration.current) return;
      setState(payload.state); setStateScopeKey(sessionKey); setRevision(payload.revision); setLoadSerial((value) => value + 1);
      setConflict(false);
      if (!admin && selectedUser) {
        const selected = payload.state.users.find((candidate) => candidate.id === selectedUser && candidate.active);
        if (selected) setView((previous) => viewForRoles(selected.roles, previous));
        else { setUserId(''); setView('review'); }
      }
      setMonthId((previous) => (admin && previous === ALL_OPERATION_MONTHS) || listedOperationMonths(payload.state.months).some((month: OperationMonth) => month.id === previous) ? previous : preferredOperationMonth(payload.state.months));
    } catch (reason) { if (requestId === loadGeneration.current) setError(reason instanceof TypeError ? '업무 자료에 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 불러오세요.' : reason instanceof Error && /[가-힣]/.test(reason.message) ? reason.message : '업무 자료를 불러오지 못했습니다. 다시 불러와 주세요. 계속되면 관리자에게 알려 주세요.'); }
    finally { if (requestId === loadGeneration.current) setLoading(false); }
  }, [admin, bureau, userId, sessionKey]);
  useEffect(() => { if (sessionReady) void load(); }, [load, sessionReady]);
  useEffect(() => {
    if (!sessionReady) return;
    const refresh = () => { if (!dirty && !busy) void load(); };
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(TASK_UPDATE_CHANNEL) : null;
    if (channel) channel.onmessage = event => { if (event.data?.type === 'saved' && event.data.bureau === (bureau || null)) refresh(); };
    window.addEventListener('focus', refresh);
    return () => { channel?.close(); window.removeEventListener('focus', refresh); };
  }, [sessionReady, bureau, dirty, busy, load]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leave);
    const click = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest('a[href]');
      if (dirty && link && !link.getAttribute('href')?.startsWith('#') && !link.hasAttribute('target') && !window.confirm('저장하지 않은 내용이 있습니다. 이동하시겠습니까?')) event.preventDefault();
    };
    document.addEventListener('click', click);
    return () => { window.removeEventListener('beforeunload', leave); document.removeEventListener('click', click); };
  }, [dirty]);
  function navigate(action: () => void) { if (busy) return; if (!dirty || window.confirm('저장하지 않은 입력이 있습니다. 입력을 버리고 이동하시겠습니까?')) { setDirty(false); setNotice(''); setError(''); setConflict(false); action(); } }
  function refreshLatest() {
    if (dirty && !window.confirm('현재 입력을 버리고 최신 자료를 불러오시겠습니까? 필요한 입력은 먼저 보관해 주세요.')) return;
    setDirty(false); setNotice(''); void load();
  }
  function exportInput() {
    const controls = [...document.querySelectorAll('.ev-content input, .ev-content select, .ev-content textarea')] as unknown as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
    const fields = controls.map((field) => ({
      label: field.getAttribute('aria-label') || field.labels?.[0]?.textContent?.trim() || field.name || '입력값',
      value: field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio') ? field.checked : field.value,
    }));
    const blob = new Blob([JSON.stringify({ savedAt: new Date().toISOString(), bureau: bureau || '기존 공용 업무', userId, monthId, view, revision, lastSaveAttempt: lastAttempt.current, currentFields: fields }, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `AI 선행기술 검색 포털_${bureau ? `${bureau}_` : ''}입력보관_${monthId || '업무'}.json`; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('입력 보관 파일 다운로드를 요청했습니다. 브라우저의 다운로드 목록에서 파일을 확인한 뒤 최신 자료를 불러와 주세요.');
  }
  const save: ActionHandler = async (action, message = '저장했습니다.') => {
    const requestId = ++saveGeneration.current;
    lastAttempt.current = structuredClone(action);
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(evaluationApiUrl(bureau, admin, userId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, actor: admin ? { admin: true } : { userId }, action }) });
      const payload = await response.json() as { state: EvaluationState; revision: number; error?: string; warnings?: string[] };
      if (requestId !== saveGeneration.current) return false;
      if (!response.ok) {
        const guidance = saveFailureGuidance(response.status, payload.error || '저장하지 못했습니다.');
        setConflict(guidance.conflict); setError(guidance.message); return false;
      }
      setState(payload.state); setStateScopeKey(sessionKey); setRevision(payload.revision); setDirty(false); setConflict(false); setNotice([message, ...(payload.warnings || [])].join(' '));
      if (action.type === 'saveStandardSearchPrompt' && typeof BroadcastChannel !== 'undefined') {
        try { const channel = new BroadcastChannel(TASK_UPDATE_CHANNEL); channel.postMessage({ type: 'saved', bureau: bureau || null }); channel.close(); }
        catch { /* Other windows also refresh on focus when messaging is unavailable. */ }
      }
      return true;
    } catch (reason) { if (requestId === saveGeneration.current) setError(reason instanceof TypeError ? '저장 요청을 보내지 못했습니다. 연결 상태를 확인한 뒤 다시 저장하세요. 입력 내용은 이 화면에 남아 있습니다.' : reason instanceof Error && /[가-힣]/.test(reason.message) ? reason.message : '저장하지 못했습니다. 다시 저장해 주세요. 계속되면 관리자에게 알려 주세요. 입력 내용은 이 화면에 남아 있습니다.'); return false; }
    finally { if (requestId === saveGeneration.current) setBusy(false); }
  };
  const user = state?.users.find((candidate) => candidate.id === userId);
  const month = state?.months.find((candidate) => candidate.id === monthId);
  const monthStatus = month ? operationMonthStatus(month) : 'pending';
  const globalAdmin = admin && ['examiners', 'ai', 'notices', 'prompts', 'month'].includes(adminSection);
  const allMonths = admin && !globalAdmin && monthId === ALL_OPERATION_MONTHS;
  const activeAdmin = ADMIN_NAV.find((entry) => entry.id === adminSection) || ADMIN_NAV[0];
  const title = admin ? activeAdmin.label : view === 'ai' ? 'AI 검색 결과 입력' : '내 심사 업무';
  const loggedIn = admin || Boolean(user);
  const errorFeedback = sessionReady && error && <div className="ev-alert" role="alert"><p>{error}</p>{(dirty || conflict) && <div className="ev-actions" style={{ marginTop: 12 }}><button type="button" className="krds-btn medium ev-button" onClick={exportInput}>현재 입력 보관 파일 저장</button>{conflict && <button type="button" className="krds-btn medium ev-button" onClick={refreshLatest}>입력 버리고 최신 자료 불러오기</button>}</div>}</div>;
  if (!loggedIn) {
    const candidates = state?.users.filter((candidate) => candidate.active).sort((a, b) =>
      (a.division || '소속 미지정').localeCompare(b.division || '소속 미지정', 'ko-KR') || a.name.localeCompare(b.name, 'ko-KR'),
    ) || [];
    const memberships = new Map(state ? personnelOf(state).memberships.map((entry) => [entry.userId, entry.groupId]) : []);
    const groups = state ? currentGroups(state).sort((a, b) => a.name.localeCompare(b.name, 'ko-KR', { numeric: true })) : [];
    const groupIds = new Set(groups.map((group) => group.id));
    const unassigned = candidates.filter((candidate) => !groupIds.has(memberships.get(candidate.id) || ''));
    const groupedCandidates = [
      ...groups.map((group) => ({ key: `group:${group.id}`, name: group.name, members: candidates.filter((candidate) => memberships.get(candidate.id) === group.id) })),
      { key: 'unassigned', name: '그룹 미배정', members: unassigned },
    ].filter((group) => group.members.length);
    return <div className="ev ev-entry"><a className="ev-skip-link" href="#evaluation-main">본문 바로가기</a>
      <main className="ev-entry-main" id="evaluation-main" tabIndex={-1}>
        <header className="ev-entry-header"><a href="/">AI 선행기술 검색 포털</a><h1>{bureau || '업무 시작'}</h1></header>
        {errorFeedback}
        {!sessionReady || loading && !state ? <Empty title="업무 자료를 불러오고 있습니다." /> : !state ? <Empty title="자료에 연결할 수 없습니다."><button type="button" className="krds-btn medium ev-button" onClick={() => void load()}>다시 시도</button></Empty> : <>
          {!bureau && <BureauEntryLinks />}
          <BureauNotice notice={state.notice} bureau={bureau} />
          <section className="ev-panel ev-examiner-directory" aria-labelledby="examiner-directory-title">
            <div className="ev-panel-head"><h2 id="examiner-directory-title">심사관 선택</h2></div>
            {candidates.length ? <div className="ev-examiner-groups">{groupedCandidates.map((group, index) => <section className="ev-examiner-group" key={group.key} aria-labelledby={`examiner-group-${index}`}>
              <h3 id={`examiner-group-${index}`}>{group.name}</h3>
              <ul className="ev-examiner-list">{group.members.map((candidate) => <li key={candidate.id}>
                <button type="button" className="ev-examiner-choice" disabled={loading || busy} onClick={() => { setUserId(candidate.id); setView(viewForRoles(candidate.roles)); }}>
                  <span>{candidate.division || '소속 미지정'} - {candidate.name}</span>{candidate.roles.includes('ai') && <span className="ev-examiner-role">AI 담당자</span>}<AppIcon name="arrow-right" />
                </button>
              </li>)}</ul>
            </section>)}</div> : <Empty title="선택할 수 있는 심사관이 없습니다.">관리자에게 심사관 등록을 요청해 주세요.</Empty>}
          </section>
        </>}
      </main>
    </div>;
  }
  return <div className="ev"><a className="ev-skip-link" href="#evaluation-main">본문 바로가기</a><div className="ev-shell">
    <aside className="ev-sidebar"><a className="ev-brand" href={bureauPath(bureau)}><span className="ev-brand-mark" aria-hidden="true">AI</span><span><strong>AI 선행기술 검색 포털</strong><small>{bureau ? `${bureau} AI 검색 결과 평가` : 'AI 검색 결과 평가'}</small></span></a>
      <div className="ev-side-label">업무 메뉴</div><nav aria-label="주요 메뉴">
        {admin ? <>{ADMIN_NAV.map((entry) => <button type="button" key={entry.id} className={`ev-nav ${adminSection === entry.id ? 'active' : ''}`} aria-current={adminSection === entry.id ? 'page' : undefined} disabled={busy || !sessionReady} onClick={() => navigate(() => { setAdminSection(entry.id); setView(entry.id === 'overview' ? 'stats' : 'settings'); })}><AppIcon name={entry.icon} size={24} />{entry.label}</button>)}</> : <><button className={`ev-nav ${view === 'review' ? 'active' : ''}`} aria-current={view === 'review' ? 'page' : undefined} onClick={() => navigate(() => setView('review'))}><AppIcon name="clipboard-list" size={24} />내 심사 업무</button>{user?.roles.includes('ai') && <button className={`ev-nav ${view === 'ai' ? 'active' : ''}`} aria-current={view === 'ai' ? 'page' : undefined} onClick={() => navigate(() => setView('ai'))}><AppIcon name="search" size={24} />AI 담당 업무</button>}</>}
      </nav>
      <div className="ev-side-tools">
        {!admin && user && <section className="ev-side-account" aria-label="선택한 사용자">
          <div className="ev-side-user"><span className="ev-avatar" aria-hidden="true">{user.name.slice(0, 1)}</span><div><strong>{user.name}</strong><span>{user.division || '소속 미지정'}</span></div></div>
          <button type="button" className="krds-btn medium ev-button link" onClick={() => navigate(() => { setUserId(''); setView('review'); })}>로그아웃</button>
        </section>}
        {admin && <a className="ev-nav" href={bureauPath(bureau)}><AppIcon name="arrow-right-up" size={24} />일반사용자 화면</a>}
      </div>
    </aside>
    <main className="ev-main" id="evaluation-main" tabIndex={-1}>
      <div className="ev-content">{errorFeedback}{sessionReady && notice && <div className="ev-alert success" role="status">{notice}</div>}
        {!sessionReady || loading && !state ? <Empty title="업무 자료를 불러오고 있습니다." /> : !state ? <Empty title="자료에 연결할 수 없습니다."><button className="krds-btn medium ev-button" onClick={() => void load()}>다시 시도</button></Empty> : <>
          <div className="ev-page-heading"><div><h1>{title}</h1></div>{!globalAdmin && <div className="ev-month"><select className="krds-form-select" aria-label="운영월" value={monthId} onChange={(event) => navigate(() => setMonthId(event.target.value))}>{admin && <option value={ALL_OPERATION_MONTHS}>전체 보기</option>}{listedOperationMonths(state.months).sort((a, b) => b.id.localeCompare(a.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{monthLabel(candidate.id)} · {OPERATION_MONTH_STATUS_LABELS[operationMonthStatus(candidate)]}</option>)}</select>{!allMonths && <Badge color={monthStatus === 'running' ? 'green' : monthStatus === 'closed' ? 'orange' : ''}>{OPERATION_MONTH_STATUS_LABELS[monthStatus]}</Badge>}</div>}</div>
          {!admin && user && (view === 'review' || view === 'ai') && month && <OperationSchedule month={month} />}{state.isDemo && !(admin && ['notices', 'prompts'].includes(adminSection)) && <div className="ev-notice warning">가상 검증 자료 · 실제 업무 자료가 아닙니다.</div>}
          {month?.closed && !globalAdmin && <div className="ev-notice warning"><p>마감된 월의 업무는 수정할 수 없습니다.</p>{admin && <button className="krds-btn medium ev-button" onClick={() => navigate(() => { setAdminSection('month'); setView('settings'); })}>월별 운영에서 재개방</button>}</div>}
          {(admin ? <AdminWorkspace key={`${bureau || 'legacy'}:${globalAdmin ? 'global' : monthId}:${loadSerial}`} bureau={bureau} state={state} month={month} allMonths={allMonths} save={save} busy={busy} dirty={setDirty} hasUnsaved={dirty} section={adminSection} onNavigate={(section) => navigate(() => { setAdminSection(section); setView(section === 'overview' ? 'stats' : 'settings'); })} selectMonth={(id) => navigate(() => setMonthId(id))} notify={setNotice} saveFeedback={errorFeedback} /> : month && user && view === 'ai' && user.roles.includes('ai') ? <AIWorkspace key={`${bureau || 'legacy'}:${userId}:${monthId}:${loadSerial}`} bureau={bureau} state={state} month={month} save={save} busy={busy} dirty={setDirty} user={user} notify={setNotice} saveFeedback={errorFeedback} /> : month && user ? <ReviewWorkspace key={`${bureau || 'legacy'}:${userId}:${monthId}:${loadSerial}`} bureau={bureau} state={state} month={month} save={save} busy={busy} dirty={setDirty} user={user} notify={setNotice} saveFeedback={errorFeedback} /> : null)}
        </>}
      </div></main>
  </div></div>;
}

function ReviewWorkspace(props: Shared & { user: EvaluationUser; notify: (text: string) => void; saveFeedback?: React.ReactNode }) {
  const { state, month, user, save, busy, dirty, notify, bureau } = props;
  const [unsaved, setUnsaved] = useState(false);
  const [editingSelection, setEditingSelection] = useState(false);
  const cases = state.cases.filter(item => item.monthId === month.id && item.examinerId === user.id && item.status === 'confirmed');
  const confirmed = month.confirmedUserIds.includes(user.id);
  const mark = (value: boolean) => { setUnsaved(value); dirty(value); };
  async function downloadOwnWork() { const result = await exportPersonal(state, month.id, cases, bureau); if (result) notify(result); }
  if (!user.roles.includes('examiner')) return <Panel title="내 심사 업무"><Empty title="심사관 역할이 배정되지 않았습니다.">왼쪽의 AI 담당 업무에서 배정받은 검색 결과를 입력하세요.</Empty></Panel>;
  if (!personnelOf(state).memberships.some(entry => entry.userId === user.id) && !cases.length) return <Panel title="소속 그룹"><Empty title="소속 그룹이 배정되지 않았습니다.">관리자에게 그룹 배정을 요청하세요.</Empty></Panel>;
  if (!confirmed && !cases.length) return <SelectionEditor {...props} />;
  if (editingSelection) return <SelectionEditor {...props} dirty={mark} onCancel={() => {
    if (!unsaved || window.confirm('저장하지 않은 선정 목록이 있습니다. 입력을 버리고 목록으로 돌아가시겠습니까?')) { mark(false); setEditingSelection(false); }
  }} autoSave={save} save={async (action, message) => { const ok = await save(action, message); if (ok) { mark(false); setEditingSelection(false); } return ok; }} />;
  const editSelection = isOperationStageOpen(month, 'selection') && <button type="button" className="krds-btn medium ev-button" disabled={busy} onClick={() => { mark(false); setEditingSelection(true); }}>제출 목록 수정</button>;
  if (!isOperationStageOpen(month, 'evaluation')) return <Panel title="제출한 출원 목록" action={<div className="ev-actions"><Badge>{cases.length}건</Badge>{editSelection}</div>}>
    {cases.length ? <div className="ev-table-scroll"><table className="ev-table"><caption className="sr-only">선택한 운영월에 내가 제출한 출원 목록</caption><thead><tr><th scope="col">출원번호</th><th scope="col">CPC</th><th scope="col">선행기술조사 보고서</th><th scope="col">AI 검색 결과</th></tr></thead><tbody>{cases.map(item => <tr key={item.id}><td>{numberLabel(item.applicationNumber)}</td><td>{item.cpc || '—'}</td><td>{reportPresenceLabel(item.hasPriorArtReport)}</td><td><Badge color={caseStatus(state, item).inputComplete ? 'green' : ''}>{caseStatus(state, item).inputComplete ? '입력 완료' : '입력 대기'}</Badge></td></tr>)}</tbody></table></div> : <Empty title="제출한 출원이 없습니다." />}
    <div className="ev-panel-body ev-actions end"><button type="button" className="krds-btn medium ev-button" onClick={downloadOwnWork}>내 업무 자료 엑셀 저장</button></div>
  </Panel>;
  return <>
    <div className="ev-actions end" style={{ marginBottom: 15 }}>{editSelection}<button type="button" className="krds-btn medium ev-button" onClick={downloadOwnWork}>내 업무 자료 엑셀 저장</button></div>
    <section className="ev-panel ev-review-case-list"><div className="ev-case-list-head">내 평가 대상 건 <span className="ev-count">{cases.length}</span></div>
      {cases.length ? <div className="ev-table-scroll ev-review-target-scroll" role="region" aria-label="내 평가 대상 건 표" tabIndex={0}><table className="ev-table ev-review-target-table">
        <caption className="sr-only">{monthLabel(month.id)} 내 평가 대상 건</caption>
        <colgroup><col className="ev-review-number-column" /><col className="ev-review-cpc-column" /><col /><col className="ev-review-status-column" /><col className="ev-review-action-column" /></colgroup>
        <thead><tr><th scope="col">출원번호</th><th scope="col">CPC</th><th scope="col">AI 검색 문헌</th><th scope="col">진행 상태</th><th scope="col">평가</th></tr></thead>
        <tbody>{cases.map(item => {
          const href = taskWindowUrl({ kind: 'evaluation', userId: user.id, caseId: item.id, monthId: month.id, methodId: '', bureau });
          const literature = caseMethods(state, item).filter(method => method.kind === 'ai').map(method => `${method.name} ${resultFor(state, item.id, method.id)?.publishedDocuments.length || 0}`).join(', ');
          return <tr key={item.id}><th scope="row"><a className="ev-review-case" href={href} target="_blank" rel="noopener noreferrer" onClick={openTaskWindow} aria-label={`${numberLabel(item.applicationNumber)} 평가 입력, 새 창`}>{numberLabel(item.applicationNumber)}</a></th><td><span className="ev-review-case-cpc">{item.cpc || 'CPC 미입력'}<small className="ev-review-case-report">선행기술조사 보고서 {reportPresenceLabel(item.hasPriorArtReport)}</small></span></td><td className="ev-review-literature">{literature || <span className="ev-muted">입력 대기</span>}</td><td><span className="ev-case-status"><Status state={state} item={item} /></span></td><td><a className="ev-review-case-action" href={href} target="_blank" rel="noopener noreferrer" onClick={openTaskWindow} aria-label={`${numberLabel(item.applicationNumber)} 평가 입력, 새 창`}>평가 입력<AppIcon name="arrow-right-up" size={18} /></a></td></tr>;
        })}</tbody>
      </table></div> : <Empty title="선정 확정한 출원이 없습니다." />}
    </section>
  </>;
}

type SelectionRowEditor = { index: number | null; numberParts: string[]; cpc: string; hasPriorArtReport?: boolean };

function SelectionEditor({ state, month, user, save, busy, dirty, onCancel, autoSave = save }: Shared & { user: EvaluationUser; onCancel?: () => void; autoSave?: ActionHandler }) {
  const submitted = month.confirmedUserIds.includes(user.id) || state.cases.some(item => item.monthId === month.id && item.examinerId === user.id && item.status === 'confirmed');
  const [rows, setRows] = useState<SelectionRow[]>(() => state.cases.filter((item) => item.monthId === month.id && item.examinerId === user.id && item.status === (submitted ? 'confirmed' : 'draft')).map(({ applicationNumber, cpc, hasPriorArtReport }) => ({ applicationNumber, cpc, ...(hasPriorArtReport !== undefined ? { hasPriorArtReport } : {}) })));
  const [editor, setEditor] = useState<SelectionRowEditor | null>(null);
  const [localError, setLocalError] = useState('');
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const numberFields = useRef<Array<HTMLInputElement | null>>([]);
  const saving = useRef(false);
  const pendingRows = useRef(false);
  const focusEditor = useRef(false);
  const editorTrigger = useRef<number | 'add' | null>(null);
  const addButton = useRef<HTMLButtonElement | null>(null);
  const editButtons = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    if (editor && focusEditor.current) { focusEditor.current = false; numberFields.current[1]?.focus(); }
    if (!editor && !busy && autoSaveStatus !== 'saving' && editorTrigger.current !== null) {
      (editorTrigger.current === 'add' ? addButton.current : editButtons.current[editorTrigger.current])?.focus(); editorTrigger.current = null;
    }
  }, [editor, autoSaveStatus, busy]);
  function markDirty() { dirty(true); setAutoSaveStatus(''); }
  const partLengths = [2, 4, 7];
  const disabled = !isOperationStageOpen(month, 'selection') || busy || autoSaveStatus === 'saving';
  const canSaveEditor = editor && editor.numberParts[0].length === 2 && editor.numberParts[1].length === 4 && editor.numberParts[2].length > 0;
  function beginEditor(index: number | null) {
    if (disabled || saving.current || editor) return;
    const row = index === null ? null : rows[index];
    const digits = row?.applicationNumber.replace(/\D/g, '') || '';
    setEditor(row ? { index, numberParts: [digits.slice(0, 2), digits.slice(2, 6), digits.slice(6)], cpc: row.cpc, hasPriorArtReport: row.hasPriorArtReport } : { index: null, numberParts: ['10', '', ''], cpc: '', hasPriorArtReport: false });
    editorTrigger.current = index === null ? 'add' : index; focusEditor.current = true;
    setLocalError(''); markDirty();
  }
  function cancelEditor() {
    if (disabled || saving.current) return;
    setEditor(null); setLocalError(''); dirty(pendingRows.current);
  }
  function changeNumberPart(index: number, value: string) {
    if (disabled || !editor) return;
    const digits = value.replace(/\D/g, '').slice(0, partLengths[index]);
    setEditor({ ...editor, numberParts: editor.numberParts.map((part, position) => position === index ? digits : part) });
    markDirty();
    if (digits.length === partLengths[index] && index < 2) numberFields.current[index + 1]?.focus();
  }
  function pasteNumber(event: React.ClipboardEvent<HTMLInputElement>) {
    if (disabled || !editor) return;
    const text = event.clipboardData.getData('text').trim();
    const parts = text.match(/^(10|20)[\s-]+(\d{4})[\s-]+(\d{1,7})$/) || text.replace(/[\s-]/g, '').match(/^(10|20)(\d{4})(\d{7})$/);
    if (!parts) return;
    event.preventDefault(); setEditor({ ...editor, numberParts: parts.slice(1) }); markDirty(); numberFields.current[2]?.focus();
  }
  async function saveEditor() {
    if (disabled || saving.current || !editor || !canSaveEditor) return false;
    const { numberParts, cpc, hasPriorArtReport, index } = editor;
    if (!['10', '20'].includes(numberParts[0])) { setLocalError('출원번호 앞 2자리는 특허 10 또는 실용신안 20을 입력해 주세요.'); numberFields.current[0]?.focus(); return false; }
    const row = { applicationNumber: numberParts[0] + '-' + numberParts[1] + '-' + numberParts[2].padStart(7, '0'), cpc: cpc.trim(), ...(hasPriorArtReport === undefined ? {} : { hasPriorArtReport }) };
    if (rows.some((value, position) => position !== index && normalized(value.applicationNumber) === normalized(row.applicationNumber))) {
      setLocalError('이미 선정 목록에 있는 출원번호입니다. 다른 출원번호를 입력해 주세요.'); numberFields.current[2]?.focus(); return false;
    }
    return persistRows(index === null ? [...rows, row] : rows.map((value, position) => position === index ? row : value));
  }
  async function persistRows(nextRows: SelectionRow[]) {
    if (disabled || saving.current) return false;
    saving.current = true; pendingRows.current = true;
    setRows(nextRows); setEditor(null); dirty(true); setLocalError(''); setAutoSaveStatus('saving');
    try {
      const ok = await autoSave({ type: 'saveSelection', monthId: month.id, rows: nextRows, confirm: submitted }, '');
      if (ok) {
        pendingRows.current = false; dirty(false); setAutoSaveStatus('saved');
      } else {
        dirty(true); setAutoSaveStatus(''); setLocalError('자동 저장하지 못했습니다. 목록은 유지되어 있으니 아래 저장 버튼으로 다시 저장해 주세요.');
      }
      return ok;
    } catch {
      dirty(true); setAutoSaveStatus(''); setLocalError('자동 저장하지 못했습니다. 목록은 유지되어 있으니 아래 저장 버튼으로 다시 저장해 주세요.');
      return false;
    } finally { saving.current = false; }
  }
  async function saveList(confirm: boolean) {
    if (disabled || saving.current || editor) return;
    if (confirm && !submitted && !window.confirm(monthLabel(month.id) + ' 선정 목록 ' + rows.length + '건을 확정하시겠습니까? AI 담당자에게 목록 전체가 공개되며, 선정 마감 전까지 수정할 수 있습니다.')) return;
    saving.current = true; setLocalError('');
    try {
      const message = !confirm ? monthLabel(month.id) + ' 선정 목록 ' + rows.length + '건을 임시저장했습니다. AI 담당자에게는 공개되지 않습니다.' : submitted ? monthLabel(month.id) + ' 제출 목록을 ' + rows.length + '건으로 수정했습니다. AI 담당자에게 변경된 목록을 반영했습니다.' : monthLabel(month.id) + ' 평가 대상 ' + rows.length + '건을 확정해 AI 담당자에게 공개했습니다.';
      if (await save({ type: 'saveSelection', monthId: month.id, rows, confirm }, message)) { pendingRows.current = false; dirty(false); setAutoSaveStatus('saved'); }
    } finally { saving.current = false; }
  }
  const duplicates = rows.filter((row) => state.cases.some((item) => item.monthId === month.id && item.examinerId !== user.id && item.status === 'confirmed' && normalized(item.applicationNumber) === normalized(row.applicationNumber)));
  const editorRow = editor && <tr key={editor.index ?? 'new'} className="ev-selection-editing" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancelEditor(); } if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') { event.preventDefault(); void saveEditor(); } }}>
    <td><div className="ev-application-number" role="group" aria-label={editor.index === null ? '새 출원번호' : `${editor.index + 1}번째 출원번호 수정`}>
      <div className="ev-application-number-parts">{editor.numberParts.map((part, index) => <span className="ev-application-number-part" key={index}>
        <input ref={element => { numberFields.current[index] = element; }} className="krds-input" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={partLengths[index]} autoComplete="off" aria-label={['출원번호 앞자리 (2자리)', '출원연도 (4자리)', '일련번호 (최대 7자리)'][index]} placeholder={['10', '2026', '0000000'][index]} value={part} onChange={event => changeNumberPart(index, event.target.value)} onPaste={pasteNumber} onKeyDown={event => { if (event.key === 'Backspace' && !part && index > 0) { event.preventDefault(); numberFields.current[index - 1]?.focus(); } }} disabled={disabled} />
        {index < 2 && <span aria-hidden="true">-</span>}
      </span>)}</div>
    </div></td>
    <td><input className="krds-input ev-selection-row-cpc" aria-label="CPC" placeholder="G06N 20/00 (선택)" maxLength={100} value={editor.cpc} onChange={event => { setEditor({ ...editor, cpc: event.target.value }); markDirty(); }} disabled={disabled} /></td>
    <td><ReportPresenceToggle value={editor.hasPriorArtReport} disabled={disabled} onChange={hasPriorArtReport => { setEditor({ ...editor, hasPriorArtReport }); markDirty(); }} />{editor.hasPriorArtReport === undefined && <span className="ev-selection-unrecorded">미기록</span>}</td>
    <td><div className="ev-selection-row-actions"><button type="button" className="krds-btn medium ev-button tiny primary" disabled={disabled || !canSaveEditor} onClick={saveEditor}>{editor.index === null ? '추가' : '저장'}</button><button type="button" className="krds-btn medium ev-button tiny" disabled={disabled} onClick={cancelEditor}>취소</button></div></td>
  </tr>;
  return <Panel title={submitted ? '제출한 출원 목록 수정' : '대상 건 선정'} action={<button ref={addButton} type="button" className="krds-btn medium ev-button" disabled={disabled || editor !== null} onClick={() => beginEditor(null)}>출원 추가</button>}><div className="ev-panel-body ev-selection-form">
    <StageNotice month={month} stage="selection" />
    {localError && <div className="ev-alert" role="alert">{localError}</div>}
    {duplicates.length > 0 && <div className="ev-notice warning">다른 심사관이 같은 달에 선정한 출원 {duplicates.length}건이 있습니다. 별도의 평가 업무로 유지됩니다.</div>}
    <div className="ev-table-scroll"><table className="ev-table ev-selection-table"><caption className="sr-only">선정할 출원 목록</caption><thead><tr><th scope="col">출원번호</th><th scope="col">CPC</th><th scope="col">선행기술조사 보고서</th><th scope="col"><span className="sr-only">관리</span></th></tr></thead><tbody>{rows.map((row, index) => editor?.index === index ? editorRow : <tr key={index}>
      <td className="ev-selection-number">{numberLabel(row.applicationNumber)}</td><td className="ev-selection-cpc-value">{row.cpc || '—'}</td><td>{reportPresenceLabel(row.hasPriorArtReport)}</td>
      <td><div className="ev-selection-row-actions"><button ref={element => { editButtons.current[index] = element; }} type="button" className="krds-btn medium ev-button tiny" disabled={disabled || editor !== null} aria-label={`${numberLabel(row.applicationNumber)} 수정`} onClick={() => beginEditor(index)}>수정</button><button type="button" className="krds-btn medium ev-button tiny danger" disabled={disabled || editor !== null} aria-label={`${numberLabel(row.applicationNumber)} 삭제`} onClick={() => { if (!editor) void persistRows(rows.filter((_, i) => i !== index)); }}>삭제</button></div></td>
    </tr>)}{editor?.index === null && editorRow}{!rows.length && !editor && <tr><td colSpan={4} className="ev-selection-empty">등록된 출원이 없습니다. 출원 추가 버튼으로 대상 건을 등록해 주세요.</td></tr>}</tbody></table></div>
    <div className="ev-selection-footer"><span className="ev-muted ev-selection-save-status" role="status">{autoSaveStatus === 'saving' ? '자동 저장 중…' : autoSaveStatus === 'saved' ? submitted ? '변경 사항 자동 저장됨' : '자동 임시저장됨' : ''}</span><div className="ev-actions">{onCancel && <button type="button" className="krds-btn medium ev-button" disabled={busy || autoSaveStatus === 'saving'} onClick={() => { if (!saving.current) onCancel(); }}>목록으로 돌아가기</button>}{!submitted && <button className="krds-btn medium ev-button" disabled={disabled || editor !== null} onClick={() => void saveList(false)}>임시저장</button>}<button className="krds-btn medium ev-button primary" disabled={disabled || editor !== null || (!submitted && !rows.length)} onClick={() => void saveList(true)}>{submitted ? '수정 사항 저장' : '선정 확정'}</button></div></div>
  </div></Panel>;
}

function AIWorkspace({ state, month, user, busy, notify, bureau }: Shared & { user: EvaluationUser; notify: (text: string) => void; saveFeedback?: React.ReactNode }) {
  const assignments = personnelOf(state).assignments.filter(assignment => assignment.userId === user.id && aiMethods(state, month.id).some(method => method.id === assignment.methodId));
  const tasks = state.cases.filter(item => item.monthId === month.id && item.status === 'confirmed').flatMap(item => assignments.filter(assignment => assignment.groupId === item.groupId && canInputResult(state, { userId: user.id }, item, assignment.methodId)).map(assignment => ({ item, methodId: assignment.methodId, key: `${item.id}:${assignment.methodId}` })));
  const [filter, setFilter] = useRememberedSelection(workspaceSessionKey(`simsadesk-ai-filter:${user.id}:${month.id}`, bureau));
  const visible = filter ? tasks.filter(task => !resultFor(state, task.item.id, task.methodId, user.id)?.publishedVersion) : tasks;
  const complete = tasks.filter(task => resultFor(state, task.item.id, task.methodId, user.id)?.publishedVersion).length;
  const downloadableApplications = tasks.filter(task => !state.isDemo || !isDemoApplicationNumber(task.item.applicationNumber)).map(task => task.item.applicationNumber);
  return <><div className="ev-filter ev-ai-toolbar"><select className="krds-form-select" aria-label="AI 업무 진행 상태" value={filter} onChange={event => setFilter(event.target.value)}><option value="">전체 입력 업무</option><option value="pending">입력 대기만 보기</option></select><span className="ev-muted ev-ai-toolbar-hint">선정 확정된 담당 그룹 출원만 표시됩니다.</span><div className="ev-ai-data-actions"><button className="krds-btn medium ev-button" onClick={async () => { const items = [...new Map(tasks.map(task => [task.item.id, task.item])).values()]; const result = await exportPersonal(state, month.id, items, bureau); if (result) notify(result); }}>데이터 엑셀 저장</button><StandardSearchPromptButton prompt={standardSearchPromptText(state)} /></div><TargetPublicationArchive applicationNumbers={downloadableApplications} monthId={month.id} bureau={bureau} disabled={busy} /></div><div className="ev-ai-workspace-layout"><section className="ev-panel ev-case-list ev-ai-task-list"><div className="ev-case-list-head">의뢰된 업무 목록 <span className="ev-count" aria-label={`입력 완료 ${complete}건 / 배정 업무 ${tasks.length}건`}>{complete}/{tasks.length}</span></div><div className="ev-case-list-items">{visible.map(task => <AITaskCard key={task.key} item={task.item} methodName={state.methods.find(method => method.id === task.methodId)?.name || 'AI'} complete={Boolean(resultFor(state, task.item.id, task.methodId, user.id)?.publishedVersion)} demo={state.isDemo} href={taskWindowUrl({ kind: 'result', userId: user.id, caseId: task.item.id, monthId: month.id, methodId: task.methodId, bureau })} />)}</div>{!visible.length && <Empty title={filter ? '입력 대기 중인 업무가 없습니다.' : '배정된 입력 업무가 없습니다.'}>{filter && <button className="krds-btn medium ev-button" onClick={() => setFilter('')}>전체 입력 업무 보기</button>}</Empty>}</section></div></>;
}

async function exportPersonal(state: EvaluationState, monthId: string, cases: EvaluationCase[], bureau?: Bureau) {
  const ids = new Set(cases.map((item) => item.id)); const stats = getStatistics(state, monthId); const rows = stats.rows.filter((row) => ids.has(row.caseId));
  return exportWorkbook(`AI 선행기술 검색 포털_${bureau ? `${bureau}_` : ''}업무자료_${monthId}.xlsx`, [
    { name: '출원별 현황', rows: [['출원번호', 'CPC', '담당 심사관', '그룹', 'AI 입력 상태', '평가 상태', '선행기술조사 보고서'], ...cases.map((item) => [item.applicationNumber, item.cpc, item.examinerName, item.groupName, caseStatus(state, item).inputComplete ? '입력 완료' : '대기 중', caseStatus(state, item).evaluationStatus, reportPresenceLabel(item.hasPriorArtReport)])] },
    { name: '선행기술 목록', rows: [['출원번호', '조사 방식', '문헌번호·서지정보', 'AI 담당자', '문헌 종류', 'URL', '보고서 (마크다운)', '저자명', '논문명·문서명', '간행물명', '발행장소', '발행처', '발행연월일', '권수', '호수', '페이지', '입수일', '날짜 비고'], ...rows.map((row) => [row.applicationNumber, row.methodName, row.number, row.authorName, row.documentDetails.kind === 'patent' ? '특허' : row.documentDetails.kind === 'non-patent' ? '비특허문헌' : '기존 문헌', row.url, row.reportMarkdown, ...['authors', 'title', 'publication', 'publicationPlace', 'publisher', 'publicationDate', 'volume', 'issue', 'pages', 'acquiredDate', 'dateNote'].map((field) => row.documentDetails[field as keyof typeof row.documentDetails] || '')])] },
    { name: '품질 순위', rows: [['출원번호', '조사 방식', '순위', '유효 여부'], ...cases.flatMap((item) => { const rank = state.rankings.find((entry) => entry.caseId === item.id); return caseMethods(state, item).map((method) => [item.applicationNumber, method.name, rank?.values[method.id] == null ? '—' : rankLabel(rank.values[method.id]), rankingIsCurrent(state, item, rank) ? '현재 결과' : rank ? '재확인 필요' : '미평가']); })] },
    { name: '문헌별 평가', rows: [['출원번호', '조사 방식', '문헌번호', '점수', '인용여부', '비고', '평가 상태'], ...rows.map((row) => [row.applicationNumber, row.methodName, row.number, row.score, row.cited, row.note, row.status])] },
  ]);
}
function rankLabel(value: RankValue) { return typeof value === 'number' ? `${value}위` : value === 'unranked' ? '순위 외' : value === 'excluded' ? '평가 제외' : value === 'incomparable' ? '비교 불가' : '—'; }
