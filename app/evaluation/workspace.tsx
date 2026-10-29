'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  aiMethods, canInputResult, caseMethods, caseStatus, getStatistics, rankingIsCurrent, rankingComplete,
  resultFor, validEvaluation, OVERALL_COMMENT_MAX_LENGTH, isOperationStageOpen, operationStageBlockReason, isDemoApplicationNumber,
  type DocumentEvaluation, type EvaluationAction, type EvaluationCase, type EvaluationState,
  type EvaluationUser, type OperationMonth, type OperationStage, type RankValue, type SelectionRow,
} from '@/app/lib/evaluation';
import PdfDownloadButton from '@/app/components/pdf-download';
import TargetPublicationDownload from '@/app/components/target-publication-download';
import TargetPublicationArchive from '@/app/components/target-publication-archive';
import AccessibleDialog from '@/app/components/accessible-dialog';
import BureauNotice from '@/app/components/bureau-notice';
import OperationSchedule from '@/app/components/operation-schedule';
import LiteratureLink from '@/app/components/literature-link';
import { literatureLink } from '@/app/lib/literature-link';
import { currentGroups, personnelOf, preferredOperationMonth, operationMonthStatus, OPERATION_MONTH_STATUS_LABELS } from '@/app/lib/evaluation';
import AdminWorkspace, { ADMIN_NAV, readAdminSection, type AdminSection } from './admin-workspace';
import { exportWorkbook } from '@/app/lib/export-workbook';
import { readWorkspaceLocation, saveFailureGuidance, viewForRoles } from '@/app/lib/workspace-location';
import { rankOptionsFor, rankingGuidance } from '@/app/lib/evaluation-guidance';
import { BUREAUS, bureauPath, evaluationApiUrl, type Bureau } from '@/app/lib/bureaus';
import './evaluation.css';

type ActionHandler = (action: EvaluationAction, message?: string) => Promise<boolean>;
type Shared = { state: EvaluationState; month: OperationMonth; save: ActionHandler; busy: boolean; dirty: (value: boolean) => void; hasUnsaved?: boolean; bureau?: Bureau };
type View = 'review' | 'ai' | 'stats' | 'settings';
const normalized = (value: string) => value.replace(/[\s\-.,]/g, '').toUpperCase();
const numberLabel = (value: string) => { const digits = value.replace(/\D/g, ''); return digits.length === 13 ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}` : value; };
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
function Empty({ title, children }: { title: string; children?: React.ReactNode }) { return <div className="ev-empty"><div className="ev-empty-icon">▤</div><h3>{title}</h3>{children}</div>; }
function Status({ state, item }: { state: EvaluationState; item: EvaluationCase }) { const status = caseStatus(state, item); return <><Badge color={status.inputComplete ? 'green' : ''}>{status.inputComplete ? '입력 완료' : '대기 중'}</Badge><Badge color={status.complete ? 'green' : status.stale ? 'orange' : ''}>{status.evaluationStatus}</Badge></>; }
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
      <a className="ev-bureau-entry-name" href={bureauPath(bureau)}>{bureau}<span aria-hidden="true">→</span></a>
    </div>)}</div>
    <p className="ev-bureau-legacy-note">공용 업무는 아래에서 시작하세요.</p>
  </section>;
}

export function AITaskCard({ item, methodName, selected, complete, demo, onSelect }: {
  item: EvaluationCase; methodName: string; selected: boolean; complete: boolean; demo: boolean; onSelect: () => void;
}) {
  const synthetic = demo && isDemoApplicationNumber(item.applicationNumber);
  return <div className={`ev-case-task ${selected ? 'active' : ''}`}>
    <button type="button" className={`ev-case ${selected ? 'active' : ''}`}
      aria-label={`${item.applicationNumber} ${methodName} 결과 입력 선택`} aria-haspopup="dialog" onClick={onSelect}>
      <strong>{numberLabel(item.applicationNumber)}</strong>
      <span className="ev-muted">{item.examinerName} · {item.groupName}</span>
      <div className="ev-case-status"><Badge>{methodName}</Badge><Badge color={complete ? 'green' : ''}>{complete ? '입력 완료' : '대기 중'}</Badge></div>
    </button>
    <div className="ev-case-pdf"><TargetPublicationDownload applicationNumber={item.applicationNumber} disabled={synthetic} context="list" />
      {synthetic && <span className="ev-case-pdf-note">가상 출원번호는 PDF를 받을 수 없습니다.</span>}
    </div>
  </div>;
}
function CaseResource({ item, demo, ai = false }: { item: EvaluationCase; demo: boolean; ai?: boolean }) {
  const synthetic = demo && isDemoApplicationNumber(item.applicationNumber);
  if (ai) return <div className="ev-ai-result-context"><p className="ev-muted">{item.examinerName} · {item.groupName} · {item.cpc || 'CPC 미입력'}</p><div className="ev-actions"><TargetPublicationDownload applicationNumber={item.applicationNumber} disabled={synthetic} context="detail" showContext={false} /><a className="krds-btn medium ev-button" href={`/patent?applicationNumber=${encodeURIComponent(item.applicationNumber)}`} target="_blank" rel="noopener noreferrer" aria-label={`${item.applicationNumber} 사건 상세, 새 창`}>사건 상세 <span className="ev-new-window">새 창</span></a></div>{synthetic && <p className="ev-case-pdf-note">가상 출원번호 · PDF 다운로드 불가</p>}</div>;
  return <div className="ev-resource"><div><strong>출원 원문</strong><p>대상 출원 {numberLabel(item.applicationNumber)}</p>{synthetic && <p>가상 출원번호 · PDF 다운로드 불가</p>}</div><div className="ev-actions"><PdfDownloadButton applicationNumber={item.applicationNumber} label="공개 전문 PDF" disabled={synthetic} /><PdfDownloadButton applicationNumber={item.applicationNumber} kind="registration" label="등록 전문 PDF" disabled={synthetic} /><a className="krds-btn medium ev-button" href={`/patent?applicationNumber=${encodeURIComponent(item.applicationNumber)}`} target="_blank" rel="noopener noreferrer" aria-label={`${item.applicationNumber} 사건 상세, 새 창`}>사건 상세 <span className="ev-new-window">새 창</span></a></div></div>;
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
      setMonthId((previous) => payload.state.months.some((month: OperationMonth) => month.id === previous) ? previous : preferredOperationMonth(payload.state.months));
    } catch (reason) { if (requestId === loadGeneration.current) setError(reason instanceof TypeError ? '업무 자료에 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 불러오세요.' : reason instanceof Error && /[가-힣]/.test(reason.message) ? reason.message : '업무 자료를 불러오지 못했습니다. 다시 불러와 주세요. 계속되면 관리자에게 알려 주세요.'); }
    finally { if (requestId === loadGeneration.current) setLoading(false); }
  }, [admin, bureau, userId, sessionKey]);
  useEffect(() => { if (sessionReady) void load(); }, [load, sessionReady]);
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
      setState(payload.state); setStateScopeKey(sessionKey); setRevision(payload.revision); setDirty(false); setConflict(false); setNotice([message, ...(payload.warnings || [])].join(' ')); return true;
    } catch (reason) { if (requestId === saveGeneration.current) setError(reason instanceof TypeError ? '저장 요청을 보내지 못했습니다. 연결 상태를 확인한 뒤 다시 저장하세요. 입력 내용은 이 화면에 남아 있습니다.' : reason instanceof Error && /[가-힣]/.test(reason.message) ? reason.message : '저장하지 못했습니다. 다시 저장해 주세요. 계속되면 관리자에게 알려 주세요. 입력 내용은 이 화면에 남아 있습니다.'); return false; }
    finally { if (requestId === saveGeneration.current) setBusy(false); }
  };
  const user = state?.users.find((candidate) => candidate.id === userId);
  const month = state?.months.find((candidate) => candidate.id === monthId);
  const monthStatus = month ? operationMonthStatus(month) : 'pending';
  const globalAdmin = admin && ['examiners', 'ai', 'notices', 'month'].includes(adminSection);
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
                  <span>{candidate.division || '소속 미지정'} - {candidate.name}</span>{candidate.roles.includes('ai') && <span className="ev-examiner-role">AI 담당자</span>}<span aria-hidden="true">→</span>
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
        {admin ? <>{ADMIN_NAV.map((entry) => <button type="button" key={entry.id} className={`ev-nav ${adminSection === entry.id ? 'active' : ''}`} aria-current={adminSection === entry.id ? 'page' : undefined} disabled={busy || !sessionReady} onClick={() => navigate(() => { setAdminSection(entry.id); setView(entry.id === 'overview' ? 'stats' : 'settings'); })}><span aria-hidden="true">{entry.icon}</span>{entry.label}</button>)}</> : <><button className={`ev-nav ${view === 'review' ? 'active' : ''}`} aria-current={view === 'review' ? 'page' : undefined} onClick={() => navigate(() => setView('review'))}><span>▤</span>내 심사 업무</button>{user?.roles.includes('ai') && <button className={`ev-nav ${view === 'ai' ? 'active' : ''}`} aria-current={view === 'ai' ? 'page' : undefined} onClick={() => navigate(() => setView('ai'))}><span>⌕</span>AI 담당 업무</button>}</>}
      </nav>
      <div className="ev-side-tools">
        {!admin && user && <section className="ev-side-account" aria-label="선택한 사용자">
          <div className="ev-side-user"><span className="ev-avatar" aria-hidden="true">{user.name.slice(0, 1)}</span><div><strong>{user.name}</strong><span>{user.division || '소속 미지정'}</span></div></div>
          <button type="button" className="krds-btn medium ev-button link" onClick={() => navigate(() => { setUserId(''); setView('review'); })}>로그아웃</button>
        </section>}
        {admin && <a className="ev-nav" href={bureauPath(bureau)}><span aria-hidden="true">↗</span>일반사용자 화면</a>}
      </div>
    </aside>
    <main className="ev-main" id="evaluation-main" tabIndex={-1}>
      <div className="ev-content">{errorFeedback}{sessionReady && notice && <div className="ev-alert success" role="status">{notice}</div>}
        {!sessionReady || loading && !state ? <Empty title="업무 자료를 불러오고 있습니다." /> : !state ? <Empty title="자료에 연결할 수 없습니다."><button className="krds-btn medium ev-button" onClick={() => void load()}>다시 시도</button></Empty> : <>
          <div className="ev-page-heading"><div><h1>{title}</h1></div>{!globalAdmin && <div className="ev-month"><select className="krds-form-select" aria-label="운영월" value={monthId} onChange={(event) => navigate(() => setMonthId(event.target.value))}>{[...state.months].sort((a, b) => b.id.localeCompare(a.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{monthLabel(candidate.id)} · {OPERATION_MONTH_STATUS_LABELS[operationMonthStatus(candidate)]}</option>)}</select><Badge color={monthStatus === 'running' ? 'green' : monthStatus === 'closed' ? 'orange' : ''}>{OPERATION_MONTH_STATUS_LABELS[monthStatus]}</Badge></div>}</div>
          {!admin && user && (view === 'review' || view === 'ai') && month && <OperationSchedule month={month} />}{state.isDemo && !(admin && adminSection === 'notices') && <div className="ev-notice warning">가상 검증 자료 · 실제 업무 자료가 아닙니다.</div>}
          {month?.closed && !globalAdmin && <div className="ev-notice warning"><p>마감된 월의 업무는 수정할 수 없습니다.</p>{admin && <button className="krds-btn medium ev-button" onClick={() => navigate(() => { setAdminSection('month'); setView('settings'); })}>월별 운영에서 재개방</button>}</div>}
          {(admin ? <AdminWorkspace key={`${bureau || 'legacy'}:${globalAdmin ? 'global' : monthId}:${loadSerial}`} bureau={bureau} state={state} month={month} save={save} busy={busy} dirty={setDirty} hasUnsaved={dirty} section={adminSection} onNavigate={(section) => navigate(() => { setAdminSection(section); setView(section === 'overview' ? 'stats' : 'settings'); })} selectMonth={(id) => navigate(() => setMonthId(id))} notify={setNotice} saveFeedback={errorFeedback} /> : month && user && view === 'ai' && user.roles.includes('ai') ? <AIWorkspace key={`${bureau || 'legacy'}:${userId}:${monthId}:${loadSerial}`} bureau={bureau} state={state} month={month} save={save} busy={busy} dirty={setDirty} user={user} notify={setNotice} saveFeedback={errorFeedback} /> : month && user ? <ReviewWorkspace key={`${bureau || 'legacy'}:${userId}:${monthId}:${loadSerial}`} bureau={bureau} state={state} month={month} save={save} busy={busy} dirty={setDirty} user={user} notify={setNotice} saveFeedback={errorFeedback} /> : null)}
        </>}
      </div></main>
  </div></div>;
}

function ReviewWorkspace(props: Shared & { user: EvaluationUser; notify: (text: string) => void; saveFeedback?: React.ReactNode }) {
  const { state, month, user, save, busy, dirty, notify, bureau, saveFeedback } = props;
  const [selectedId, setSelectedId] = useState('');
  const [unsaved, setUnsaved] = useState(false);
  const [editingSelection, setEditingSelection] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const caseListHeading = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (saveFailed && !busy) feedback.current?.focus(); }, [saveFailed, busy]);
  const cases = state.cases.filter((item) => item.monthId === month.id && item.examinerId === user.id && item.status === 'confirmed');
  const selected = cases.find((item) => item.id === selectedId);
  const confirmed = month.confirmedUserIds.includes(user.id);
  const mark = (value: boolean) => { setUnsaved(value); dirty(value); };
  function closeEditor() {
    if (busy || submitting.current) return;
    if (unsaved && !window.confirm('저장하지 않은 평가가 있습니다. 입력을 버리고 닫으시겠습니까?')) return;
    mark(false); setSelectedId(''); setSaveFailed(false);
  }
  async function saveEditor(action: EvaluationAction, message?: string) {
    if (busy || submitting.current) return false;
    submitting.current = true; setSaveFailed(false);
    try {
      const ok = await save(action, message);
      if (ok) { mark(false); setSelectedId(''); }
      else setSaveFailed(true);
      return ok;
    } finally { submitting.current = false; }
  }
  async function downloadOwnWork() {
    const result = await exportPersonal(state, month.id, cases, bureau);
    if (result) notify(result);
  }
  if (!user.roles.includes('examiner')) return <Panel title="내 심사 업무"><Empty title="심사관 역할이 배정되지 않았습니다.">왼쪽의 AI 담당 업무에서 배정받은 검색 결과를 입력하세요.</Empty></Panel>;
  if (!personnelOf(state).memberships.some((entry) => entry.userId === user.id) && !cases.length) return <Panel title="소속 그룹"><Empty title="소속 그룹이 배정되지 않았습니다.">관리자에게 그룹 배정을 요청하세요.</Empty></Panel>;
  if (!confirmed && !cases.length) return <SelectionEditor {...props} />;
  if (editingSelection) return <SelectionEditor {...props} dirty={mark} onCancel={() => {
    if (!unsaved || window.confirm('저장하지 않은 선정 목록이 있습니다. 입력을 버리고 목록으로 돌아가시겠습니까?')) { mark(false); setEditingSelection(false); }
  }} save={async (action, message) => { const ok = await save(action, message); if (ok) { mark(false); setEditingSelection(false); } return ok; }} />;
  const editSelection = isOperationStageOpen(month, 'selection') && <button type="button" className="krds-btn medium ev-button" disabled={busy} onClick={() => {
    if (!unsaved || window.confirm('저장하지 않은 평가가 있습니다. 입력을 버리고 제출 목록을 수정하시겠습니까?')) { mark(false); setEditingSelection(true); }
  }}>제출 목록 수정</button>;
  if (!isOperationStageOpen(month, 'evaluation')) return <Panel title="제출한 출원 목록" action={<div className="ev-actions"><Badge>{cases.length}건</Badge>{editSelection}</div>}>
    {cases.length ? <div className="ev-table-scroll"><table className="ev-table">
      <caption className="sr-only">선택한 운영월에 내가 제출한 출원 목록</caption>
      <thead><tr><th scope="col">출원번호</th><th scope="col">CPC</th><th scope="col">AI 검색 결과</th></tr></thead>
      <tbody>{cases.map(item => <tr key={item.id}><td>{numberLabel(item.applicationNumber)}</td><td>{item.cpc || '—'}</td><td><Badge color={caseStatus(state, item).inputComplete ? 'green' : ''}>{caseStatus(state, item).inputComplete ? '입력 완료' : '입력 대기'}</Badge></td></tr>)}</tbody>
    </table></div> : <Empty title="제출한 출원이 없습니다." />}
    <div className="ev-panel-body ev-actions end"><button type="button" className="krds-btn medium ev-button" onClick={downloadOwnWork}>내 업무 자료 엑셀 저장</button></div>
  </Panel>;
  return <>
    <div className="ev-actions end" style={{ marginBottom: 15 }}>{editSelection}<button type="button" className="krds-btn medium ev-button" onClick={downloadOwnWork}>내 업무 자료 엑셀 저장</button></div>
    <section className="ev-panel ev-review-case-list">
      <div ref={caseListHeading} tabIndex={-1} className="ev-case-list-head">내 평가 대상 건 <span className="ev-count">{cases.length}</span></div>
      <ul className="ev-review-case-items">{cases.map((item) => <li key={item.id}><button type="button" className="ev-review-case" aria-haspopup="dialog" disabled={busy} onClick={() => {
        if (!busy && (!unsaved || window.confirm('저장하지 않은 평가가 있습니다. 다른 출원으로 이동하시겠습니까?'))) { mark(false); setSaveFailed(false); setSelectedId(item.id); }
      }}><strong>{numberLabel(item.applicationNumber)}</strong><span className="ev-muted ev-review-case-cpc">{item.cpc || 'CPC 미입력'}</span><span className="ev-case-status"><Status state={state} item={item} /></span><span className="ev-review-case-action">평가 입력 <span aria-hidden="true">→</span></span></button></li>)}</ul>
      {!cases.length && <Empty title="선정 확정한 출원이 없습니다." />}
    </section>
    {selected && <AccessibleDialog labelledBy="ev-evaluation-dialog-title" className="ev-evaluation-dialog" onClose={closeEditor} fallbackFocusRef={caseListHeading}>
      <header><div><h2 id="ev-evaluation-dialog-title">AI 검색 결과 평가</h2><p>{numberLabel(selected.applicationNumber)}</p></div><button type="button" className="krds-btn medium ev-button" disabled={busy} onClick={closeEditor} aria-label="평가 입력 닫기">닫기</button></header>
      <div className="ev-evaluation-dialog-body" aria-busy={busy}>
        {saveFailed && <div ref={feedback} tabIndex={-1} className="ev-evaluation-feedback">{saveFeedback || <div className="ev-alert" role="alert">저장하지 못했습니다. 입력 내용은 유지되어 있습니다. 잠시 후 다시 시도해 주세요.</div>}</div>}
        <EvaluationEditor key={selected.id} state={state} month={month} save={saveEditor} busy={busy} dirty={mark} item={selected} />
      </div>
    </AccessibleDialog>}
  </>;
}

function SelectionEditor({ state, month, user, save, busy, dirty, onCancel }: Shared & { user: EvaluationUser; onCancel?: () => void }) {
  const submitted = month.confirmedUserIds.includes(user.id) || state.cases.some(item => item.monthId === month.id && item.examinerId === user.id && item.status === 'confirmed');
  const [rows, setRows] = useState<SelectionRow[]>(() => state.cases.filter((item) => item.monthId === month.id && item.examinerId === user.id && item.status === (submitted ? 'confirmed' : 'draft')).map(({ applicationNumber, cpc }) => ({ applicationNumber, cpc })));
  const [number, setNumber] = useState(''); const [cpc, setCpc] = useState(''); const [paste, setPaste] = useState(''); const [localError, setLocalError] = useState('');
  function add(values: SelectionRow[]) { setRows((previous) => [...previous, ...values]); dirty(true); setLocalError(''); }
  function bulk() { const values = paste.split(/\r?\n/).filter((line) => line.trim()).map((line) => { const match = line.trim().match(/^((?:10|20)[-\s]?\d{4}[-\s]?\d{7})[\s,;\t]*(.*)$/); return match ? { applicationNumber: match[1], cpc: match[2].trim() } : { applicationNumber: line.trim(), cpc: '' }; }); add(values); setPaste(''); }
  const duplicates = rows.filter((row) => state.cases.some((item) => item.monthId === month.id && item.examinerId !== user.id && item.status === 'confirmed' && normalized(item.applicationNumber) === normalized(row.applicationNumber)));
  const disabled = !isOperationStageOpen(month, 'selection') || busy;
  return <Panel title={submitted ? '제출한 출원 목록 수정' : '대상 건 선정'}><div className="ev-panel-body"><StageNotice month={month} stage="selection" />{localError && <div className="ev-alert">{localError}</div>}<div className="ev-notice">{submitted ? <p>수정 사항을 저장하면 AI 담당자에게 변경된 목록이 반영됩니다. 출원번호를 바꾸거나 삭제한 건의 기존 결과와 평가는 취소 기록으로 보존됩니다.</p> : <p>임시저장한 목록은 AI 담당자에게 공개되지 않습니다.</p>}<p>대상 건 선정 단계가 진행 중이면 제출 후에도 출원번호·CPC를 수정하거나 출원을 추가·삭제할 수 있습니다.</p>{month.selectionDeadline && <p>선정 기한: {month.selectionDeadline}</p>}</div><div className="ev-selection-input"><label>출원번호<input className="krds-input" placeholder="10-2024-0000000" value={number} onChange={(event) => { setNumber(event.target.value); dirty(true); }} disabled={disabled} /></label><label>CPC <span className="ev-muted">선택</span><input className="krds-input" placeholder="G06N 20/00" value={cpc} onChange={(event) => { setCpc(event.target.value); dirty(true); }} disabled={disabled} /></label><button className="krds-btn medium ev-button" disabled={disabled || !number.trim()} onClick={() => { add([{ applicationNumber: number.trim(), cpc: cpc.trim() }]); setNumber(''); setCpc(''); }}>선정 목록에 추가</button></div><details style={{ marginTop: 20 }}><summary style={{ cursor: 'pointer', fontSize: 12, color: '#517080' }}>여러 출원 한 번에 붙여넣기</summary><label style={{ marginTop: 12 }}>한 줄에 출원번호와 CPC를 입력하세요.<textarea className="krds-input" rows={5} placeholder={'10-2024-0000001\tG06N 20/00\n10-2024-0000002'} value={paste} onChange={(event) => { setPaste(event.target.value); dirty(true); }} disabled={disabled} /></label><div className="ev-actions end"><button className="krds-btn medium ev-button" onClick={bulk} disabled={!paste.trim() || disabled}>목록에 추가</button></div></details><hr className="ev-divider" /><div className="ev-subheading"><h3>선정 목록 <span className="ev-count">{rows.length}</span></h3></div>{duplicates.length > 0 && <div className="ev-notice warning">다른 심사관이 같은 달에 선정한 출원 {duplicates.length}건이 있습니다. 별도의 평가 업무로 유지됩니다.</div>}{rows.length ? <div className="ev-table-scroll"><table className="ev-table"><caption className="sr-only">선정할 출원 목록</caption><thead><tr><th scope="col">출원번호</th><th scope="col">CPC</th><th scope="col"><span className="sr-only">관리</span></th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><td><input className="krds-input" aria-label={`출원번호 ${index + 1}`} value={row.applicationNumber} disabled={disabled} onChange={(event) => { setRows(rows.map((value, i) => i === index ? { ...value, applicationNumber: event.target.value } : value)); dirty(true); }} /></td><td><input className="krds-input" aria-label={`CPC ${index + 1}`} value={row.cpc} disabled={disabled} onChange={(event) => { setRows(rows.map((value, i) => i === index ? { ...value, cpc: event.target.value } : value)); dirty(true); }} /></td><td><button className="krds-btn medium ev-button tiny danger" disabled={disabled} aria-label={`${row.applicationNumber || `${index + 1}번째 출원`} 선정 목록에서 삭제`} onClick={() => { setRows(rows.filter((_, i) => i !== index)); dirty(true); }}>목록에서 삭제</button></td></tr>)}</tbody></table></div> : <p className="ev-muted">등록된 출원이 없습니다.</p>}<div className="ev-actions end">{onCancel && <button type="button" className="krds-btn medium ev-button" disabled={busy} onClick={onCancel}>목록으로 돌아가기</button>}{!submitted && <button className="krds-btn medium ev-button" disabled={disabled} onClick={() => { if (number.trim() || paste.trim()) { setLocalError('입력 중인 출원을 목록에 먼저 추가해 주세요.'); return; } void save({ type: 'saveSelection', monthId: month.id, rows, confirm: false }, monthLabel(month.id) + ' 선정 목록 ' + rows.length + '건을 임시저장했습니다. AI 담당자에게는 공개되지 않습니다.'); }}>임시저장</button>}<button className="krds-btn medium ev-button primary" disabled={disabled || (!submitted && !rows.length)} onClick={() => {
    if (number.trim() || paste.trim()) { setLocalError('입력 중인 출원을 목록에 먼저 추가해 주세요.'); return; }
    if (submitted || window.confirm(monthLabel(month.id) + ' 선정 목록 ' + rows.length + '건을 확정하시겠습니까? AI 담당자에게 목록 전체가 공개되며, 선정 마감 전까지 수정할 수 있습니다.')) void save({ type: 'saveSelection', monthId: month.id, rows, confirm: true }, submitted ? monthLabel(month.id) + ' 제출 목록을 ' + rows.length + '건으로 수정했습니다. AI 담당자에게 변경된 목록을 반영했습니다.' : monthLabel(month.id) + ' 평가 대상 ' + rows.length + '건을 확정해 AI 담당자에게 공개했습니다.');
  }}>{submitted ? '수정 사항 저장' : '선정 확정'}</button></div></div></Panel>;
}

function EvaluationEditor({ state, month, item, save, busy, dirty }: Shared & { item: EvaluationCase }) {
  const methods = caseMethods(state, item);
  const ai = methods.filter((method) => method.kind === 'ai');
  const [documents, setDocuments] = useState<Record<string, DocumentEvaluation[]>>(() => Object.fromEntries(ai.map((method) => { const current = validEvaluation(state, item.id, method.id); return [method.id, (resultFor(state, item.id, method.id)?.publishedDocuments || []).map((number) => current?.documents.find((document) => normalized(document.number) === normalized(number)) || { number, score: null, cited: null, note: '' })]; })));
  const [ranks, setRanks] = useState<Record<string, RankValue>>(() => { const ranking = state.rankings.find((value) => value.caseId === item.id); return rankingIsCurrent(state, item, ranking) ? Object.fromEntries(methods.map((method) => [method.id, ranking?.values[method.id] ?? null])) : {}; });
  const [overallComment, setOverallComment] = useState(() => state.rankings.find((entry) => entry.caseId === item.id)?.overallComment ?? '');
  const versions = Object.fromEntries(ai.map((method) => [method.id, resultFor(state, item.id, method.id)?.publishedVersion || 0]));
  const remainingDocuments = Object.values(documents).flat().filter((document) => document.score === null || document.cited === null).length;
  const rankReady = rankingComplete(state, item, ranks);
  const rankableMethods = methods.map((method) => ({ id: method.id, available: method.kind === 'baseline' ? ai.length > 0 : versions[method.id] > 0 }));
  const rankGuide = rankingGuidance(rankableMethods, ranks);
  const publishedDocumentCount = Object.values(documents).flat().length;
  const evaluationSaveMessage = [
    '평가를 저장했습니다.',
    remainingDocuments ? `점수·인용여부가 남은 문헌 ${remainingDocuments}건을 확인하세요.` : '',
    !rankReady ? '품질 순위 안내에 따라 남은 순위를 선택해 주세요.' : '',
    publishedDocumentCount > 0 && !remainingDocuments && rankReady ? '이 출원의 평가가 완료되었습니다.' : '',
  ].filter(Boolean).join(' ');
  function update(methodId: string, index: number, patch: Partial<DocumentEvaluation>) { setDocuments((previous) => ({ ...previous, [methodId]: previous[methodId].map((document, i) => i === index ? { ...document, ...patch } : document) })); dirty(true); }
  const status = caseStatus(state, item); const disabled = !isOperationStageOpen(month, 'evaluation') || busy;
  return <><div className="ev-case-title"><div><h2>{numberLabel(item.applicationNumber)}</h2><p className="ev-muted">{item.cpc || 'CPC 미입력'} · {item.examinerName} · {item.groupName}</p></div><div className="ev-actions"><Status state={state} item={item} /></div></div><CaseResource item={item} demo={state.isDemo} /><StageNotice month={month} stage="evaluation" />{status.stale && <div className="ev-notice warning">평가 후 AI 검색 결과가 변경되었습니다. 바뀐 방식의 문헌 평가와 품질 순위를 다시 확인해 저장하세요.</div>}<Panel title="AI 문헌별 평가" description={<>미선택은 실제 0점·X와 다릅니다. 일부 항목만 입력한 상태도 저장할 수 있습니다.<br />점수 기준 : 3점(평균적인 선행기술조사 보고서 수준)</>}><div className="ev-table-scroll" style={{ minHeight: 240 }}><table className="ev-table"><caption className="sr-only">AI 문헌별 평가</caption><thead><tr><th scope="col">조사 방식</th><th scope="col">문헌</th><th scope="col">점수</th><th scope="col">인용여부</th><th scope="col">비고</th></tr></thead><tbody>{ai.flatMap((method) => (documents[method.id] || []).map((document, index) => <tr key={`${method.id}:${document.number}`}><td>{method.name}</td><td className="ev-doc ev-literature"><LiteratureLink reference={document.number} /></td><td><select className="krds-form-select" aria-label={`${method.name} ${document.number} 점수`} value={document.score ?? ''} disabled={disabled} onChange={(event) => update(method.id, index, { score: event.target.value === '' ? null : Number(event.target.value) })}><option value="">미선택</option>{[0, 1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}점</option>)}</select></td><td><select className="krds-form-select" aria-label={`${method.name} ${document.number} 인용여부`} value={document.cited ?? ''} disabled={disabled} onChange={(event) => update(method.id, index, { cited: event.target.value === '' ? null : event.target.value as 'O' | 'X' })}><option value="">미선택</option><option value="O">O</option><option value="X">X</option></select></td><td><input className="krds-input" style={{ minWidth: 150 }} aria-label={`${method.name} ${document.number} 비고`} placeholder="선택 입력" value={document.note} maxLength={4000} disabled={disabled} onChange={(event) => update(method.id, index, { note: event.target.value })} /></td></tr>))}{!Object.values(documents).some((values) => values.length) && <tr><td colSpan={5}><Empty title="공개된 AI 검색 결과를 기다리고 있습니다.">AI 담당자가 입력 완료하면 여기에 문헌이 표시됩니다.</Empty></td></tr>}</tbody></table></div><div className="ev-kpi-note">{ai.map((method) => <span key={method.id}>{method.name} {versions[method.id] ? `${documents[method.id]?.length || 0}문헌` : '대기 중'}</span>)}</div></Panel><Panel title="조사 방식별 품질 순위" description="이 출원에 공개된 AI 검색 결과와 선행기술조사 보고서를 비교해 순위를 매깁니다."><div className="ev-panel-body ev-ranking-guide"><ul>{rankGuide.map((line) => <li key={line}>{line}</li>)}</ul><p role="status">{remainingDocuments ? `점수·인용여부 미선택 ${remainingDocuments}문헌` : publishedDocumentCount ? '공개된 문헌의 평가 입력 완료' : '공개된 AI 문헌 없음'} · {rankReady ? '품질 순위 입력 완료' : '품질 순위 확인 필요'}</p></div><div className="ev-table-scroll"><table className="ev-table"><caption className="sr-only">조사 방식별 품질 순위</caption><thead><tr><th scope="col">조사 방식</th><th scope="col">입력 상태</th><th scope="col">품질 순위</th></tr></thead><tbody>{methods.map((method) => { const available = method.kind === 'baseline' ? ai.length > 0 : versions[method.id] > 0; const options = rankOptionsFor(method.id, rankableMethods, ranks); const currentOption = options.find((option) => option.value === ranks[method.id]); return <tr key={method.id}><td>{method.name}</td><td>{method.kind === 'baseline' ? <Badge>순위 비교 전용</Badge> : <Badge color={available ? 'green' : ''}>{available ? '입력 완료' : '대기 중'}</Badge>}</td><td><select className="krds-form-select" aria-label={`${method.name} 품질 순위`} aria-invalid={Boolean(currentOption?.disabled)} value={ranks[method.id] ?? ''} disabled={disabled || !available} onChange={(event) => { const value = event.target.value; setRanks((previous) => ({ ...previous, [method.id]: value === '' ? null : /^[123]$/.test(value) ? Number(value) as 1 | 2 | 3 : value as RankValue })); dirty(true); }}><option value="">{available ? '미선택' : '대기 중'}</option>{options.map((option) => <option key={String(option.value)} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select></td></tr>; })}</tbody></table></div></Panel><Panel title="총평" description="선택 입력입니다. 비워 두어도 평가를 저장할 수 있습니다."><div className="ev-panel-body"><label className="sr-only" htmlFor={`overall-comment-${item.id}`}>총평</label><textarea id={`overall-comment-${item.id}`} className="krds-input" rows={5} value={overallComment} maxLength={OVERALL_COMMENT_MAX_LENGTH} disabled={disabled} aria-describedby={`overall-comment-count-${item.id}`} placeholder="검색 결과의 유용성이나 조사 방식에 대한 의견을 자유롭게 입력하세요." onChange={(event) => { setOverallComment(event.target.value); dirty(true); }} /><p id={`overall-comment-count-${item.id}`} className="ev-muted" style={{ marginTop: 8, textAlign: 'right' }}>{overallComment.length.toLocaleString('ko-KR')} / {OVERALL_COMMENT_MAX_LENGTH.toLocaleString('ko-KR')}자</p></div></Panel><div className="ev-actions end"><span className="ev-muted">{month.evaluationDeadline ? `평가 기한 ${month.evaluationDeadline}` : '평가 기한 제한 없음'}</span><button className="krds-btn medium ev-button primary" disabled={disabled} onClick={() => void save({ type: 'saveEvaluation', caseId: item.id, evaluations: ai.filter((method) => versions[method.id] > 0).map((method) => ({ methodId: method.id, version: versions[method.id], documents: documents[method.id] || [] })), rankings: ranks, versions, overallComment }, evaluationSaveMessage)}>{busy ? '저장 중…' : '평가 저장'}</button></div></>;
}

function AIWorkspace({ state, month, user, save, busy, dirty, notify, bureau, saveFeedback }: Shared & { user: EvaluationUser; notify: (text: string) => void; saveFeedback?: React.ReactNode }) {
  const assignments = personnelOf(state).assignments.filter((assignment) => assignment.userId === user.id && aiMethods(state, month.id).some((method) => method.id === assignment.methodId));
  const tasks = state.cases.filter((item) => item.monthId === month.id && item.status === 'confirmed').flatMap((item) => assignments.filter((assignment) => assignment.groupId === item.groupId && canInputResult(state, { userId: user.id }, item, assignment.methodId)).map((assignment) => ({ item, methodId: assignment.methodId, key: `${item.id}:${assignment.methodId}` })));
  const [selectedKey, setSelectedKey] = useState(''); const [unsaved, setUnsaved] = useState(false); const [filter, setFilter] = useRememberedSelection(workspaceSessionKey(`simsadesk-ai-filter:${user.id}:${month.id}`, bureau));
  const visible = filter ? tasks.filter((task) => !resultFor(state, task.item.id, task.methodId)?.publishedVersion) : tasks;
  const selected = tasks.find((task) => task.key === selectedKey);
  const complete = tasks.filter((task) => resultFor(state, task.item.id, task.methodId)?.publishedVersion).length;
  const downloadableApplications = tasks.filter(task => !state.isDemo || !isDemoApplicationNumber(task.item.applicationNumber)).map(task => task.item.applicationNumber);
  const [saveFailed, setSaveFailed] = useState(false);
  const taskListHeading = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (saveFailed && !busy) feedback.current?.focus(); }, [saveFailed, busy]);
  function mark(value: boolean) { setUnsaved(value); dirty(value); }
  function closeEditor() {
    if (busy || submitting.current) return;
    if (unsaved && !window.confirm('저장하지 않은 검색 결과가 있습니다. 입력을 버리고 닫으시겠습니까?')) return;
    mark(false); setSelectedKey(''); setSaveFailed(false);
  }
  async function saveEditor(action: EvaluationAction, message?: string) {
    if (busy || submitting.current) return false;
    submitting.current = true; setSaveFailed(false);
    try {
      const ok = await save(action, message);
      if (ok) { mark(false); setSelectedKey(''); }
      else setSaveFailed(true);
      return ok;
    } finally { submitting.current = false; }
  }
  return <><div className="ev-filter ev-ai-toolbar"><select className="krds-form-select" aria-label="AI 업무 진행 상태" value={filter} onChange={(event) => { if (!unsaved || window.confirm('저장하지 않은 검색 결과가 있습니다. 필터를 바꾸시겠습니까?')) { mark(false); setFilter(event.target.value); } }}><option value="">전체 입력 업무</option><option value="pending">입력 대기만 보기</option></select><span className="ev-muted ev-ai-toolbar-hint" title="선정 확정된 담당 그룹 출원만 표시됩니다.">선정 확정된 담당 그룹 출원만 표시됩니다.</span><button className="krds-btn medium ev-button" style={{ marginLeft: 'auto' }} onClick={async () => { const items = [...new Map(tasks.map((task) => [task.item.id, task.item])).values()]; const result = await exportPersonal(state, month.id, items, bureau); if (result) notify(result); }}>담당 업무 자료 엑셀 저장</button><TargetPublicationArchive applicationNumbers={downloadableApplications} monthId={month.id} bureau={bureau} disabled={busy} /></div><div className="ev-ai-workspace-layout"><section className="ev-panel ev-case-list ev-ai-task-list"><div ref={taskListHeading} tabIndex={-1} className="ev-case-list-head">의뢰된 업무 목록 <span className="ev-count" aria-label={`입력 완료 ${complete}건 / 배정 업무 ${tasks.length}건`}>{complete}/{tasks.length}</span></div><div className="ev-case-list-items">{visible.map((task) => <AITaskCard key={task.key} item={task.item} methodName={state.methods.find((method) => method.id === task.methodId)?.name || 'AI'} selected={selected?.key === task.key} complete={Boolean(resultFor(state, task.item.id, task.methodId)?.publishedVersion)} demo={state.isDemo} onSelect={() => { if (!busy && (!unsaved || window.confirm('저장하지 않은 검색 결과가 있습니다. 다른 업무로 이동하시겠습니까?'))) { mark(false); setSaveFailed(false); setSelectedKey(task.key); } }} />)}</div>{!visible.length && <Empty title={filter ? '입력 대기 중인 업무가 없습니다.' : '배정된 입력 업무가 없습니다.'}>{filter && <button className="krds-btn medium ev-button" onClick={() => setFilter('')}>전체 입력 업무 보기</button>}</Empty>}</section></div>{selected && <AccessibleDialog labelledBy="ev-ai-result-dialog-title" className="ev-ai-result-dialog" onClose={closeEditor} fallbackFocusRef={taskListHeading}>
    <header><div><h2 id="ev-ai-result-dialog-title">AI 검색 결과 입력</h2><p>{numberLabel(selected.item.applicationNumber)} · {state.methods.find(method => method.id === selected.methodId)?.name || 'AI'}</p></div><button type="button" className="krds-btn medium ev-button" disabled={busy} onClick={closeEditor} aria-label="AI 검색 결과 입력 닫기">닫기</button></header>
    <div className="ev-ai-result-dialog-body" aria-busy={busy}>
      {saveFailed && <div ref={feedback} tabIndex={-1} className="ev-ai-result-feedback">{saveFeedback || <div className="ev-alert" role="alert">저장하지 못했습니다. 입력 내용은 유지되어 있습니다. 잠시 후 다시 시도해 주세요.</div>}</div>}
      <AIResultEditor key={selected.key} state={state} month={month} item={selected.item} methodId={selected.methodId} save={saveEditor} busy={busy} dirty={mark} />
    </div>
  </AccessibleDialog>}</>;
}

function AIResultEditor({ state, month, item, methodId, save, busy, dirty }: Shared & { item: EvaluationCase; methodId: string }) {
  const result = resultFor(state, item.id, methodId); const method = state.methods.find((candidate) => candidate.id === methodId);
  const patentDocuments = (result?.publishedDocuments || []).filter((number) => literatureLink(number).kind === 'patent');
  const [input, setInput] = useState((result?.draftDocuments || []).join('\n'));
  const documents = input.split(/\r?\n/).map((number) => number.trim()).filter(Boolean);
  const disabled = !isOperationStageOpen(month, 'result') || busy;
  return <><CaseResource item={item} demo={state.isDemo} ai /><StageNotice month={month} stage="result" /><Panel title="선행기술 문헌" description="특허번호, 논문 제목·서지정보, DOI 또는 URL을 한 줄에 하나씩 입력하세요. 최대 7문헌까지 등록할 수 있습니다." action={<Badge color={documents.length > 7 ? 'red' : ''}>{documents.length} / 7문헌</Badge>}><div className="ev-panel-body"><label><span className="sr-only">선행기술 문헌 (특허·논문)</span><textarea className="krds-input" rows={9} data-dialog-autofocus={disabled ? undefined : ''} spellCheck={false} style={{ fontFamily: 'Consolas, monospace', fontSize: 14 }} value={input} placeholder={'KR1020230000001A\nAttention Is All You Need\n10.48550/arXiv.1706.03762\nhttps://arxiv.org/abs/1706.03762'} disabled={disabled} onChange={(event) => { setInput(event.target.value); dirty(true); }} /></label>{documents.length > 7 && <p style={{ color: '#ae4f42', marginTop: 9, fontSize: 12 }}>문헌을 7개 이하로 줄여 주세요.</p>}<div className="ev-actions end"><span className="ev-muted" style={{ marginRight: 'auto' }}>{month.resultDeadline ? `입력 기한 ${month.resultDeadline}` : '입력 기한 제한 없음'}</span><button className="krds-btn medium ev-button" disabled={disabled || documents.length > 7} onClick={() => void save({ type: 'saveResult', caseId: item.id, methodId, documents, publish: false }, result?.publishedVersion ? `${method?.name} 수정 초안 ${documents.length}문헌을 임시저장했습니다. 심사관에게는 이전 공개 결과가 계속 보입니다.` : `${method?.name} 검색 결과 ${documents.length}문헌을 임시저장했습니다. AI 검색 결과 입력 완료를 누르면 심사관에게 공개됩니다.`)}>임시저장</button><button className="krds-btn medium ev-button primary" disabled={disabled || !documents.length || documents.length > 7} onClick={() => void save({ type: 'saveResult', caseId: item.id, methodId, documents, publish: true }, `${method?.name} 검색 결과 ${documents.length}문헌을 담당 심사관에게 공개했습니다.`)}>AI 검색 결과 입력 완료</button></div></div></Panel><Panel title="심사관에게 공개된 결과" description={result?.publishedBy ? `실제 등록자 ${result.publishedBy.name} · ${result.publishedAt ? new Date(result.publishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : ''}` : '입력 완료한 결과만 심사관에게 공개됩니다.'}>{result?.publishedDocuments.length ? <><div className="ev-table-scroll"><table className="ev-table"><caption className="sr-only">심사관에게 공개된 AI 검색 문헌</caption><thead><tr><th scope="col">순서</th><th scope="col">문헌 (특허·논문)</th><th scope="col">원문 확인</th></tr></thead><tbody>{result.publishedDocuments.map((number, index) => <tr key={number}><td>{index + 1}</td><td className="ev-doc ev-literature">{number}</td><td><LiteratureLink reference={number} className="krds-btn medium ev-button tiny">문헌 확인</LiteratureLink></td></tr>)}</tbody></table></div><div className="ev-kpi-note">수정 초안은 다시 입력 완료하기 전까지 기존 공개 결과를 바꾸지 않습니다.{patentDocuments.length > 0 && <a className="krds-btn medium ev-button" href={`/documents?numbers=${encodeURIComponent(patentDocuments.join('\n'))}`} target="_blank" rel="noopener noreferrer" aria-label="검색 문헌 PDF 모으기, 새 창">특허 문헌 PDF 모으기 <span className="ev-new-window">새 창</span></a>}{patentDocuments.length < result.publishedDocuments.length && <span>논문 원문은 문헌 확인 링크에서 확인해 주세요.</span>}</div></> : <Empty title="아직 공개한 결과가 없습니다.">한 문헌 이상 입력한 뒤 ‘AI 검색 결과 입력 완료’를 누르세요.</Empty>}</Panel></>;
}

async function exportPersonal(state: EvaluationState, monthId: string, cases: EvaluationCase[], bureau?: Bureau) {
  const ids = new Set(cases.map((item) => item.id)); const stats = getStatistics(state, monthId); const rows = stats.rows.filter((row) => ids.has(row.caseId));
  return exportWorkbook(`AI 선행기술 검색 포털_${bureau ? `${bureau}_` : ''}업무자료_${monthId}.xlsx`, [
    { name: '출원별 현황', rows: [['출원번호', 'CPC', '담당 심사관', '그룹', 'AI 입력 상태', '평가 상태'], ...cases.map((item) => [item.applicationNumber, item.cpc, item.examinerName, item.groupName, caseStatus(state, item).inputComplete ? '입력 완료' : '대기 중', caseStatus(state, item).evaluationStatus])] },
    { name: '선행기술 목록', rows: [['출원번호', '조사 방식', '문헌번호', 'AI 담당자'], ...rows.map((row) => [row.applicationNumber, row.methodName, row.number, row.authorName])] },
    { name: '품질 순위', rows: [['출원번호', '조사 방식', '순위', '유효 여부'], ...cases.flatMap((item) => { const rank = state.rankings.find((entry) => entry.caseId === item.id); return caseMethods(state, item).map((method) => [item.applicationNumber, method.name, rank?.values[method.id] == null ? '—' : rankLabel(rank.values[method.id]), rankingIsCurrent(state, item, rank) ? '현재 결과' : rank ? '재확인 필요' : '미평가']); })] },
    { name: '문헌별 평가', rows: [['출원번호', '조사 방식', '문헌번호', '점수', '인용여부', '비고', '평가 상태'], ...rows.map((row) => [row.applicationNumber, row.methodName, row.number, row.score, row.cited, row.note, row.status])] },
  ]);
}
function rankLabel(value: RankValue) { return typeof value === 'number' ? `${value}위` : value === 'unranked' ? '순위 외' : value === 'excluded' ? '평가 제외' : value === 'incomparable' ? '비교 불가' : '—'; }
