'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ALL_OPERATION_MONTHS, caseMethods, caseStatus, DEFAULT_OPERATION_MONTHS, listedOperationMonths, getStatistics, literatureDetailsFor, personnelOf, operationGroups, operationMonthsForScope, preferredOperationMonth, operationStageStatus, OPERATION_STAGES, OPERATION_STAGE_STATUS_LABELS, rankingIsCurrent, resultFor, validEvaluation,
  type EvaluationAction, type EvaluationCase, type EvaluationState,
  type InvestigationMethod, type OperationMonth, type OperationStage, type OperationStageStatus,
} from '@/app/lib/evaluation';
import { exportWorkbook } from '@/app/lib/export-workbook';
import { literatureLink } from '@/app/lib/literature-link';
import type { Bureau } from '@/app/lib/bureaus';
import ReportPresenceToggle from '@/app/components/report-presence-toggle';
import AccessibleDialog from '@/app/components/accessible-dialog';
import AppIcon from '@/app/components/app-icon';
import NoticeManager from './notice-manager';
import AccountManager, { AccountEditor, GroupEditor, GroupDeleteDialog, examinerForm, filterAdminUsers } from './examiner-manager';
export { AccountEditor, GroupEditor, GroupDeleteDialog, examinerForm, filterAdminUsers };
import './admin.css';

export const ADMIN_NAV = [
  { id: 'overview', label: '운영 현황', icon: 'chart-square', description: '월별 진행을 확인하고 후속 업무를 찾습니다.' },
  { id: 'examiners', label: '심사관 관리', icon: 'users', description: '사용자 계정과 소속 그룹·AI 담당 배정을 관리합니다.' },
  { id: 'ai', label: 'AI 종류', icon: 'cpu', description: '비교에 사용할 AI 종류를 등록하고 관리합니다.' },
  { id: 'month', label: '월별 운영', icon: 'calendar', description: '운영월별 기한과 단계별 운영 상태를 설정합니다.' },
  { id: 'cases', label: '대상 출원 목록', icon: 'document-text', description: '대상 출원을 찾고 운영상 필요한 등록과 취소를 처리합니다.' },
  { id: 'notices', label: '공지사항 관리', icon: 'notification', description: '메인 페이지에 표시할 공지사항을 마크다운으로 작성하고 관리합니다.' },
] as const;
export type AdminSection = typeof ADMIN_NAV[number]['id'];
type Save = (action: EvaluationAction, message?: string) => Promise<boolean>;
export type AdminProps = {
  state: EvaluationState; month?: OperationMonth; allMonths?: boolean; bureau?: Bureau; busy: boolean;
  save: Save; dirty: (value: boolean) => void; hasUnsaved: boolean;
  section: AdminSection; onNavigate: (section: AdminSection) => void;
  selectMonth: (id: string) => void; notify: (message: string) => void;
  saveFeedback?: React.ReactNode;
};
type FormProps = Pick<AdminProps, 'state' | 'month' | 'bureau' | 'busy' | 'save' | 'dirty' | 'hasUnsaved' | 'onNavigate' | 'saveFeedback'>;
type MonthFormProps = FormProps & { month: OperationMonth };
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const monthLabel = (id: string) => `${id.slice(0, 4)}년 ${Number(id.slice(5))}월`;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const queryValue = (value: string) => value.trim().toLocaleLowerCase();

export function readAdminSection(raw: string | null, bureau?: Bureau, legacyView?: string): AdminSection {
  try {
    const value = raw ? JSON.parse(raw) as { adminSection?: unknown } : null;
    if (value?.adminSection === 'accounts' || value?.adminSection === 'groups') return 'examiners';
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
  const { state, month, allMonths, section, onNavigate } = props;
  return <div className="adm">
    {section === 'overview' ? month || allMonths ? <Overview {...props} /> : <Empty title="운영월을 등록하세요." actions={<Button onClick={() => onNavigate('month')}>월별 운영</Button>} />
      : section === 'examiners' ? <AccountManager {...props} />
      : section === 'ai' ? <MethodManager {...props} />
      : section === 'month' ? <MonthManager {...props} />
      : section === 'notices' ? <NoticeManager {...props} />
      : month || allMonths ? <CaseManager {...props} initialStatus="all" /> : <Empty title="운영월을 등록하세요." actions={<Button onClick={() => onNavigate('month')}>월별 운영</Button>} />}
    {section !== 'notices' && section !== 'month' && !state.users.length && !state.groups.length && !state.cases.length && <section className="adm-demo ev-notice">
      <strong>가상 자료로 업무 흐름 확인</strong><p>가상 자료: 사용자 10명·그룹 2개·출원 20건</p>
      <Button disabled={props.busy} onClick={() => { if (window.confirm('가상 검증 자료를 불러오시겠습니까? 실제 출원과 실적이 아닌 예시가 저장됩니다.')) void props.save({ type: 'loadDemo' }, '가상 검증 자료를 불러왔습니다.'); }}>가상 검증 자료 불러오기</Button>
    </section>}
  </div>;
}

function MethodManager(props: FormProps) {
  const { state, busy, dirty, hasUnsaved } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const ai = state.methods.filter((method) => method.kind === 'ai' && !method.deletedAt);
  const selected = ai.find((method) => method.id === editing);
  function open(id: string) { if (!busy && confirmDiscard(hasUnsaved)) { dirty(false); setEditing(id); } }
  return <>
    <section className="adm-ai-catalog" aria-labelledby="adm-ai-catalog-title">
      <div className="adm-ai-catalog-head"><h2 id="adm-ai-catalog-title">등록된 AI 종류</h2><Button primary disabled={busy} aria-haspopup="dialog" onClick={() => open('new')}>AI 종류 추가</Button></div>
      {ai.length ? <div className="adm-ai-grid">{ai.map((method) => <button type="button" key={method.id} className={'adm-ai-card ' + (method.active ? '' : 'is-inactive')} disabled={busy} aria-haspopup="dialog" aria-label={'AI 종류 ' + method.name + ' 수정'} aria-describedby={'adm-ai-state-' + method.id + ' adm-ai-assignment-' + method.id} onClick={() => open(method.id)}>
        <span className="adm-ai-card-top"><strong className="adm-ai-name">{method.name}</strong><span id={'adm-ai-state-' + method.id}><Pill tone={method.active ? 'is-active' : 'is-inactive'}>{method.active ? '활성' : '비활성'}</Pill></span></span>
        <span className="adm-secondary" id={'adm-ai-assignment-' + method.id}>담당 배정 {personnelOf(state).assignments.filter((entry) => entry.methodId === method.id).length}개 그룹</span>
        <span className="adm-ai-edit">수정하기 <AppIcon name="arrow-right" /></span>
      </button>)}</div> : <Empty title="등록된 AI 종류가 없습니다.">AI 종류 추가를 눌러 ChatGPT·클로드 같은 AI 도구를 등록하세요.</Empty>}
    </section>
    {(editing === 'new' || selected) && <MethodEditor key={editing} method={selected} busy={busy} dirty={dirty} save={props.save} saveFeedback={props.saveFeedback} onClose={() => { dirty(false); setEditing(null); }} />}
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
  useEffect(() => dirty(changed), [changed, dirty]);
  useEffect(() => { if (submitFailed && !busy) feedback.current?.focus(); }, [submitFailed, busy]);
  function update(patch: Partial<Pick<InvestigationMethod, 'name' | 'active'>>) { setForm((previous) => ({ ...previous, ...patch })); dirty(true); }
  function requestClose() { if (!busy && confirmDiscard(changed)) onClose(); }
  async function requestDelete() {
    if (!method || method.kind !== 'ai' || busy) return;
    if (!window.confirm(`${method.name} AI 종류를 삭제하시겠습니까?\nAI 종류 목록과 새 운영월·신규 담당 배정에서 제외됩니다. 기존 확정 출원의 비교 설정과 검색 결과·평가는 보존됩니다.${changed ? '\n저장하지 않은 수정 내용은 버립니다.' : ''}`)) return;
    setSubmitFailed(false);
    if (await save({ type: 'deleteMethod', methodId: method.id }, `${method.name} AI 종류를 삭제했습니다.`)) { dirty(false); onClose(); }
    else setSubmitFailed(true);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !form.name.trim()) return;
    setSubmitFailed(false);
    if (await save({ type: 'saveMethod', method: form }, method ? form.name + ' AI 종류를 저장했습니다.' : form.name + ' AI 종류를 추가했습니다. 월별 운영에서 비교 대상으로 선택해 주세요.')) {
      dirty(false); onClose();
    } else setSubmitFailed(true);
  }
  return <AccessibleDialog labelledBy="adm-method-dialog-title" className="adm-form-modal adm-ai-modal" onClose={requestClose}>
    <header>
      <div><h2 id="adm-method-dialog-title">{method ? method.name + ' 수정' : 'AI 종류 추가'}</h2></div>
      <Button disabled={busy} aria-label="AI 종류 편집 닫기" onClick={requestClose}>닫기</Button>
    </header>
    <form className="adm-modal-form" onSubmit={submit} aria-busy={busy}>
      <div className="adm-editor-body adm-modal-fields">
        {submitFailed && <div ref={feedback} className="adm-modal-feedback" tabIndex={-1}>{saveFeedback || <div className="ev-alert" role="alert"><p>저장하지 못했습니다. 입력한 내용은 유지되어 있습니다. 잠시 후 다시 시도해 주세요.</p></div>}</div>}
        <label className="adm-field">AI 종류 이름 <span className="adm-required">필수</span><input className="krds-input" data-dialog-autofocus required disabled={busy} maxLength={200} placeholder="예: ChatGPT, 클로드" value={form.name} onChange={(event) => update({ name: event.target.value })} /></label>
        <label className="adm-field">활성 상태<select className="krds-form-select" disabled={busy} value={form.active ? 'active' : 'inactive'} onChange={(event) => update({ active: event.target.value === 'active' })}><option value="active">활성</option><option value="inactive">비활성</option></select></label>
        {!form.active && <p className="adm-secondary">비활성화해도 이미 공개된 검색 결과와 평가는 유지됩니다.</p>}
      </div>
      <footer className="adm-actions adm-modal-actions">{method?.kind === 'ai' && <Button className="danger" style={{ marginRight: 'auto' }} disabled={busy} onClick={requestDelete}>AI 종류 삭제</Button>}{changed && <span className="adm-dirty is-dirty" role="status">미저장 변경 있음</span>}<Button disabled={busy} onClick={requestClose}>취소</Button><button type="submit" className="krds-btn medium ev-button primary" disabled={busy || !form.name.trim() || (Boolean(method) && !changed)}>{busy ? '저장 중…' : method ? '변경 저장' : 'AI 종류 추가'}</button></footer>
    </form>
  </AccessibleDialog>;
}

export function MonthManager(props: AdminProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const saving = useRef(false);
  const months = listedOperationMonths(props.state.months).sort((left, right) => {
    const leftOrder = (DEFAULT_OPERATION_MONTHS as readonly string[]).indexOf(left.id);
    const rightOrder = (DEFAULT_OPERATION_MONTHS as readonly string[]).indexOf(right.id);
    return (leftOrder < 0 ? DEFAULT_OPERATION_MONTHS.length : leftOrder) - (rightOrder < 0 ? DEFAULT_OPERATION_MONTHS.length : rightOrder) || left.id.localeCompare(right.id);
  });
  const editing = months.find(month => month.id === editingId);
  async function changeStatus(month: OperationMonth, stage: OperationStage, status: OperationStageStatus) {
    if (props.busy || props.hasUnsaved || saving.current || status === (month.closed ? 'closed' : operationStageStatus(month, stage))) return;
    saving.current = true;
    try { await props.save({ type: 'setMonthStage', monthId: month.id, stage, status }, monthLabel(month.id) + ' ' + OPERATION_STAGES.find(entry => entry.id === stage)!.label + ' 상태를 변경했습니다: ' + OPERATION_STAGE_STATUS_LABELS[status] + '.'); }
    finally { saving.current = false; }
  }
  return <>
    <section className="adm-list adm-operation-months"><div className="adm-table-wrap"><table className="adm-table adm-operation-table"><caption className="sr-only">운영월별 단계 운영 상태</caption>
      <thead><tr><th scope="col">운영월</th>{OPERATION_STAGES.map(stage => <th scope="col" key={stage.id}>{stage.id === 'evaluation' ? '평가 단계' : stage.label}</th>)}</tr></thead>
      <tbody>{months.map(month => <tr key={month.id}><th scope="row"><button type="button" className="adm-month-link" aria-haspopup="dialog" aria-label={monthLabel(month.id) + ' 기한 설정'} disabled={props.busy || props.hasUnsaved} onClick={() => setEditingId(month.id)}>{monthLabel(month.id)}</button></th>{OPERATION_STAGES.map(stage => <td key={stage.id}><select className="krds-form-select" aria-label={monthLabel(month.id) + ' ' + stage.label + ' 상태'} data-status={month.closed ? 'closed' : operationStageStatus(month, stage.id)} value={month.closed ? 'closed' : operationStageStatus(month, stage.id)} disabled={props.busy || props.hasUnsaved} onChange={event => changeStatus(month, stage.id, event.target.value as OperationStageStatus)}>{Object.entries(OPERATION_STAGE_STATUS_LABELS).map(([status,label]) => <option key={status} value={status}>{label}</option>)}</select></td>)}</tr>)}</tbody>
    </table></div></section>
    {editing && <MonthlyForm {...props} month={editing} onClose={() => { if (!props.busy) setEditingId(null); }} />}
  </>;
}

type OperatingSettings = Pick<OperationMonth, 'selectionDeadline' | 'resultDeadline' | 'evaluationDeadline'>;
export function operatingSettings(month: OperationMonth): OperatingSettings {
  return { selectionDeadline: month.selectionDeadline, resultDeadline: month.resultDeadline, evaluationDeadline: month.evaluationDeadline };
}
export function mergeOperatingMonth(month: OperationMonth, settings: OperatingSettings): OperationMonth {
  const merged = { ...month, ...operatingSettings({ ...month, ...settings }) };
  delete merged.caseLimit;
  return merged;
}

export function MonthlyForm({ month, busy, save, hasUnsaved, onClose, saveFeedback }: MonthFormProps & { onClose?: () => void }) {
  const [form, setForm] = useState<OperatingSettings>(() => operatingSettings(month));
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => setForm(operatingSettings(month)), [month]);
  useEffect(() => { if (failed && !busy) feedback.current?.focus(); }, [failed, busy]);
  const disabled = busy || hasUnsaved;
  function close() { if (!busy && !saving.current) onClose?.(); }
  async function update(deadline: keyof OperatingSettings, value: string) {
    if (disabled || saving.current || value === form[deadline]) return;
    saving.current = true; setFailed(false);
    const settings = { ...operatingSettings(month), [deadline]: value };
    setForm(settings);
    try {
      if (!await save({ type: 'saveMonth', month: mergeOperatingMonth(month, settings) }, monthLabel(month.id) + ' 운영 기한을 저장했습니다.')) { setForm(operatingSettings(month)); setFailed(true); }
    } finally { saving.current = false; }
  }
  return <AccessibleDialog labelledBy="adm-month-deadlines-title" className="adm-form-modal adm-deadline-modal" onClose={close}>
    <header><div><h2 id="adm-month-deadlines-title">{monthLabel(month.id)} 기한 설정</h2><p>날짜를 변경하면 바로 저장됩니다.</p></div><Button disabled={busy} onClick={close} aria-label="운영월 기한 설정 닫기">닫기</Button></header>
    <div className="adm-editor-body adm-modal-fields" aria-busy={busy}>
      {failed && <div ref={feedback} tabIndex={-1}>{saveFeedback || <div className="ev-alert" role="alert">기한을 저장하지 못했습니다. 기존 날짜를 표시합니다. 다시 선택해 주세요.</div>}</div>}
      <div className="adm-deadline-grid">{OPERATION_STAGES.map((stage, index) => <label className="adm-field" key={stage.id}>{stage.label}<input className="krds-input" type="date" aria-label={stage.label + ' 예정 기한'} disabled={disabled} value={form[stage.deadline]} onChange={event => update(stage.deadline, event.target.value)} /><span className="adm-secondary">기본: {['첫째', '둘째', '셋째'][index]} 금요일</span></label>)}</div>
    </div>
  </AccessibleDialog>;
}

export function filterTargetCases(state: EvaluationState, monthId: string, options: { query?: string; status?: string; examinerId?: string; groupId?: string } = {}) {
  const search = queryValue(options.query || '');
  const monthIds = new Set(operationMonthsForScope(state, monthId).map(month => month.id));
  return state.cases.filter((item) => {
    if (!monthIds.has(item.monthId) || options.examinerId && item.examinerId !== options.examinerId || options.groupId && item.groupId !== options.groupId) return false;
    if (search && !`${item.applicationNumber} ${item.applicationNumber.replace(/\D/g, '')} ${item.examinerName} ${item.division} ${item.cpc}`.toLocaleLowerCase().includes(search)) return false;
    const status = options.status || 'all'; if (status === 'all') return true;
    if (['confirmed', 'draft', 'cancelled'].includes(status)) return item.status === status;
    if (item.status !== 'confirmed') return false;
    const progress = caseStatus(state, item);
    return status === 'inputPending' ? !progress.inputComplete : status === 'recheck' ? progress.stale : status === 'complete' ? progress.complete : status === 'inProgress' ? progress.evaluationStatus === '평가 중' : status === 'unevaluated' ? progress.evaluationStatus === '미평가' : true;
  });
}
const caseFilters = [['all', '전체 상태'], ['confirmed', '선정 확정'], ['draft', '선정 초안'], ['cancelled', '선정 취소'], ['inputPending', 'AI 입력 대기'], ['recheck', '재확인 필요'], ['unevaluated', '미평가'], ['inProgress', '평가 중'], ['complete', '평가 완료']];

export function CaseEvaluationDetails({ state, item }: { state: EvaluationState; item: EvaluationCase }) {
  const methods = caseMethods(state, item);
  const ai = methods.filter(method => method.kind === 'ai');
  const identity = (number: string) => number.replace(/[\s\-.,]/g, '').toUpperCase();
  const rows = ai.flatMap(method => {
    const result = resultFor(state, item.id, method.id);
    const evaluation = validEvaluation(state, item.id, method.id);
    return literatureDetailsFor(result).map(document => {
      const saved = evaluation?.documents.find(entry => identity(entry.number) === identity(document.number));
      const kind = document.kind === 'patent' || document.kind === 'legacy' && literatureLink(document.number).kind === 'patent' ? '특허' : document.kind === 'non-patent' || document.kind === 'legacy' && literatureLink(document.number).kind === 'paper' ? '비특허' : '미확인';
      return { methodId: method.id, methodName: method.name, number: document.number, name: document.kind === 'non-patent' ? document.title || document.number : document.number, kind, score: saved?.score ?? null, cited: saved?.cited ?? null };
    });
  });
  const ranking = state.rankings.find(entry => entry.caseId === item.id);
  const currentRanking = rankingIsCurrent(state, item, ranking) ? ranking : undefined;
  const hasRanks = ai.length > 0 && methods.some(method => currentRanking?.values[method.id] != null);
  const hasEvaluation = rows.some(row => row.score !== null || row.cited !== null);
  const emptyMessage = ai.length ? 'AI 검색 평가 전' : 'AI 검색 입력 전';
  const status = caseStatus(state, item);
  const statusLabel = status.stale ? '재확인 필요' : !status.complete ? '평가 중' : '';
  return <>
    <section className="adm-case-section" aria-labelledby={`adm-case-basic-${item.id}`}>
      <h3 id={`adm-case-basic-${item.id}`}>기본 정보</h3>
      <dl className="adm-detail-list adm-case-basic">
        <div><dt>운영월</dt><dd>{monthLabel(item.monthId)}</dd></div>
        <div><dt>출원번호</dt><dd>{item.applicationNumber}</dd></div>
        <div><dt>담당 심사관</dt><dd>{item.examinerName} · {item.division}</dd></div>
        <div><dt>그룹</dt><dd>{item.groupName}</dd></div>
        <div><dt>CPC</dt><dd>{item.cpc || '—'}</dd></div>
        <div><dt>선행기술조사 보고서</dt><dd>{item.hasPriorArtReport === true ? '있음' : item.hasPriorArtReport === false ? '없음' : '미기록'}</dd></div>
        <div><dt>선정 상태</dt><dd>{item.status === 'confirmed' ? '선정 확정' : item.status === 'cancelled' ? '선정 취소' : '선정 초안'}</dd></div>
      </dl>
    </section>
    <section className="adm-case-section" aria-labelledby={`adm-case-ranks-${item.id}`}>
      <div className="adm-case-section-heading"><h3 id={`adm-case-ranks-${item.id}`}>조사 방식별 검색 품질 순위</h3>{statusLabel && (hasRanks || status.stale) && <Pill tone={status.stale ? 'is-warning' : ''}>{statusLabel}</Pill>}</div>
      {hasRanks ? <div className="adm-table-wrap adm-case-rankings"><table className="adm-table">
        <caption className="sr-only">{item.applicationNumber} 조사 방식별 검색 품질 순위</caption>
        <thead><tr><th scope="col">조사 방식</th><th scope="col">검색 품질 순위</th></tr></thead>
        <tbody>{methods.map(method => {
          const rank = currentRanking!.values[method.id];
          const label = rank == null ? 'AI 검색 평가 전' : typeof rank === 'number' ? `${rank}위` : rank === 'excluded' ? '평가 제외' : rank === 'unranked' ? '순위 외' : '비교 불가';
          return <tr key={method.id}><th scope="row">{method.kind === 'baseline' ? '선행기술조사 보고서' : method.name}</th><td>{label}</td></tr>;
        })}</tbody>
      </table></div> : <p className="adm-case-empty">{emptyMessage}</p>}
    </section>
    <section className="adm-case-section" aria-labelledby={`adm-case-documents-${item.id}`}>
      <div className="adm-case-section-heading"><h3 id={`adm-case-documents-${item.id}`}>문헌 평가 결과</h3>{statusLabel && (hasEvaluation || status.stale) && <Pill tone={status.stale ? 'is-warning' : ''}>{statusLabel}</Pill>}</div>
      {hasEvaluation ? <div className="adm-table-wrap adm-case-results" role="region" aria-label="문헌 평가 결과 표" tabIndex={0}><table className="adm-table adm-case-documents">
        <caption className="sr-only">{item.applicationNumber} AI 검색 문헌 평가 결과</caption>
        <colgroup><col className="adm-case-ai-column" /><col className="adm-case-kind-column" /><col /><col className="adm-case-score-column" /><col className="adm-case-cited-column" /></colgroup>
        <thead><tr><th scope="col">AI 종류</th><th scope="col">특허 여부</th><th scope="col">인용문헌 명</th><th scope="col">문헌 점수</th><th scope="col">인용 여부</th></tr></thead>
        <tbody>{rows.map(row => <tr key={`${row.methodId}:${row.number}`}><td>{row.methodName}</td><td>{row.kind}</td><td className="adm-case-citation">{row.name}</td><td>{row.score ?? '—'}</td><td>{row.cited ?? '—'}</td></tr>)}</tbody>
      </table></div> : <p className="adm-case-empty">{emptyMessage}</p>}
    </section>
  </>;
}

function CaseManager(props: AdminProps & { initialStatus: string }) {
  const { state, month, busy, hasUnsaved, dirty } = props; const [query, setQuery] = useState(''); const [status, setStatus] = useState(props.initialStatus); const [examinerId, setExaminerId] = useState(''); const [editing, setEditing] = useState<string | null>(null);
  const scopeId = props.allMonths ? ALL_OPERATION_MONTHS : month!.id;
  const visible = filterTargetCases(state, scopeId, { query, status, examinerId }); const all = filterTargetCases(state, scopeId); const selected = all.find((item) => item.id === editing);
  const selectedMonth = state.months.find(entry => entry.id === selected?.monthId);
  const selectedLocked = Boolean(!selectedMonth || selectedMonth.closed || selectedMonth.archived);
  const canRegister = (month ? [month] : listedOperationMonths(state.months)).some(entry => !entry.closed && !entry.archived);
  function open(id: string) { if (confirmDiscard(hasUnsaved)) { dirty(false); setEditing(id); } }
  return <><div className="adm-toolbar"><div className="adm-search"><label className="sr-only" htmlFor="adm-case-search">출원번호, 담당자 또는 CPC 검색</label><input id="adm-case-search" className="krds-input" value={query} placeholder="출원번호, 담당자 또는 CPC 검색" onChange={(event) => setQuery(event.target.value)} /></div><select className="krds-form-select adm-filter" aria-label="대상 출원 상태 필터" value={status} onChange={(event) => setStatus(event.target.value)}>{caseFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select className="krds-form-select adm-filter" aria-label="대상 출원 담당 심사관 필터" value={examinerId} onChange={(event) => setExaminerId(event.target.value)}><option value="">전체 담당 심사관</option>{state.users.filter((user) => personnelOf(state).memberships.some((entry) => entry.userId === user.id) || all.some((item) => item.examinerId === user.id)).map((user) => <option key={user.id} value={user.id}>{user.division} - {user.name}</option>)}</select><Button primary disabled={busy || !canRegister} onClick={() => open('new')}>대상 출원 등록</Button></div><div className="adm-split adm-case-split"><section className="adm-list"><div className="adm-list-head"><h2>대상 출원 목록</h2><span className="adm-secondary">{visible.length} / {all.length}건</span></div>{visible.length ? visible.map((item) => { const progress = item.status === 'confirmed' ? caseStatus(state, item) : null; return <button type="button" key={item.id} className={`adm-list-item ${editing === item.id ? 'is-selected' : ''}`} disabled={busy} aria-pressed={editing === item.id} onClick={() => open(item.id)}><span className="adm-name">{item.applicationNumber}<Pill tone={item.status === 'cancelled' ? 'is-inactive' : progress?.stale ? 'is-warning' : progress?.complete ? 'is-active' : ''}>{item.status === 'draft' ? '선정 초안' : item.status === 'cancelled' ? '선정 취소' : progress?.evaluationStatus}</Pill></span><span className="adm-secondary">{props.allMonths && `${monthLabel(item.monthId)} · `}{item.examinerName} · {item.groupName} · {item.cpc || 'CPC 미입력'}</span>{progress && <span className="adm-meta">AI {progress.inputComplete ? '입력 완료' : '입력 대기'}</span>}</button>; }) : <Empty title="현재 조건에 해당하는 출원이 없습니다." actions={<Button onClick={() => { setQuery(''); setStatus('all'); setExaminerId(''); }}>검색 조건 초기화</Button>} />}</section><section className="adm-editor" key={editing}>{editing === 'new' ? <CaseRegistration {...props} onClose={() => { dirty(false); setEditing(null); }} /> : selected ? <><EditorHeader title="선택한 대상 출원">{selected.applicationNumber}</EditorHeader><div className="adm-editor-body"><CaseEvaluationDetails state={state} item={selected} /><div className="adm-actions">{selected.status === 'confirmed' && <Button className="danger" disabled={busy || selectedLocked} onClick={async () => { if (window.confirm(`${selected.applicationNumber} 선정을 취소하시겠습니까? AI 담당 업무와 평가 집계에서 제외됩니다.`) && await props.save({ type: 'cancelCase', caseId: selected.id }, `${selected.applicationNumber} 선정을 취소했습니다.`)) setEditing(null); }}>선정 취소</Button>}</div>{selectedLocked && <p className="adm-secondary">마감한 운영월에서는 출원을 추가하거나 취소할 수 없습니다.</p>}</div></> : <Empty title="확인할 출원을 선택하세요." actions={<Button primary disabled={busy || !canRegister} onClick={() => open('new')}>대상 출원 등록</Button>}>선정 확정한 출원은 운영상 필요한 경우 관리자가 취소할 수 있습니다.</Empty>}</section></div></>;
}

function CaseRegistration({ state, month: selectedMonth, busy, dirty, save, onClose, onNavigate }: FormProps & { onClose: () => void }) {
  const [examinerId, setExaminerId] = useState(''); const [number, setNumber] = useState(''); const [cpc, setCpc] = useState(''); const [query, setQuery] = useState(''); const [hasPriorArtReport, setHasPriorArtReport] = useState(false); const changed = Boolean(examinerId || number || cpc || hasPriorArtReport); useEffect(() => dirty(changed), [changed, dirty]);
  const [registrationMonthId, setRegistrationMonthId] = useState(() => selectedMonth?.id || preferredOperationMonth(listedOperationMonths(state.months).filter(month => !month.closed)));
  const month = selectedMonth || listedOperationMonths(state.months).find(month => month.id === registrationMonthId);
  const eligibleExaminers = state.users.filter((user) => user.active && user.roles.includes('examiner') && personnelOf(state).memberships.some((entry) => entry.userId === user.id));
  const candidates = eligibleExaminers.filter((user) => user.id === examinerId || `${user.name} ${user.division}`.toLocaleLowerCase().includes(queryValue(query)));
  if (!month) return <Empty title="등록할 운영월이 없습니다." actions={<Button onClick={() => onNavigate('month')}>월별 운영</Button>} />;
  return <><EditorHeader title="대상 출원 등록">그룹이 배정된 심사관에게 등록합니다.</EditorHeader><form className="adm-editor-body" onSubmit={async (event) => { event.preventDefault(); if (busy || month.closed || month.archived) return; if (await save({ type: 'adminAddCase', monthId: month.id, examinerId, row: { applicationNumber: number, cpc, hasPriorArtReport } }, `${number} 출원을 등록했습니다.`)) { dirty(false); onClose(); } }}>{!selectedMonth && <label className="adm-field">운영월<select className="krds-form-select" aria-label="등록 운영월" value={registrationMonthId} disabled={busy} onChange={event => setRegistrationMonthId(event.target.value)}>{listedOperationMonths(state.months).map(entry => <option key={entry.id} value={entry.id} disabled={entry.closed}>{monthLabel(entry.id)}</option>)}</select></label>}<label className="adm-field">담당 심사관 검색<input className="krds-input" placeholder="이름 또는 심사과" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="adm-field">담당 심사관 <span className="adm-required">필수</span><select className="krds-form-select" required disabled={busy || month.closed} value={examinerId} onChange={(event) => setExaminerId(event.target.value)}><option value="">심사관 선택</option>{candidates.map((user) => <option key={user.id} value={user.id}>{user.division} - {user.name}</option>)}</select></label>{!eligibleExaminers.length && <Empty title="그룹이 배정된 심사관이 없습니다." actions={<Button onClick={() => onNavigate('examiners')}>심사관 관리</Button>} />}<label className="adm-field">출원번호 <span className="adm-required">필수</span><input className="krds-input" required disabled={busy || month.closed} value={number} placeholder="10-2024-0000000" onChange={(event) => setNumber(event.target.value)} /></label><label className="adm-field">CPC · 선택<input className="krds-input" disabled={busy || month.closed} value={cpc} onChange={(event) => setCpc(event.target.value)} /></label><div className="adm-field"><span>선행기술조사 보고서</span><ReportPresenceToggle value={hasPriorArtReport} disabled={busy || month.closed} onChange={setHasPriorArtReport} /></div><div className="adm-actions"><Button disabled={busy} onClick={() => { if (confirmDiscard(changed)) onClose(); }}>취소</Button><button type="submit" className="krds-btn medium ev-button primary" disabled={busy || month.closed || !examinerId || !number.trim()}>출원 등록</button></div></form></>;
}

export function overviewMethodStatistics(state: EvaluationState, statistics: ReturnType<typeof getStatistics>) {
  const researched = new Set(state.results.filter(result => result.publishedVersion > 0 && result.publishedDocuments.length > 0).map(result => result.methodId));
  const summaries = new Map(statistics.methods.map(method => [method.id, method]));
  return state.methods.filter(method => method.kind === 'ai' && (method.active && !method.deletedAt || researched.has(method.id))).map(method => summaries.get(method.id) ?? {
    id: method.id, name: method.name, kind: method.kind, target: 0, completed: 0, pending: 0, documents: 0, averageScore: null, citationRate: null, firstPlace: 0,
  });
}

function Overview(props: AdminProps) {
  const { state, month, allMonths, busy, save, notify, onNavigate, bureau } = props;
  const [groupId, setGroupId] = useState(''); const [examinerId, setExaminerId] = useState(''); const [detail, setDetail] = useState('accounts');
  const scopeId = allMonths ? ALL_OPERATION_MONTHS : month!.id;
  const stats = useMemo(() => getStatistics(state, scopeId, groupId, examinerId), [state, scopeId, groupId, examinerId]); const { summary } = stats;
  const methodStats = overviewMethodStatistics(state, stats);
  const inputMethods = stats.methods.filter(method => method.kind === 'ai');
  const inputComplete = inputMethods.reduce((total, method) => total + method.completed, 0);
  const inputTarget = inputMethods.reduce((total, method) => total + method.target, 0);
  return <><div className="adm-toolbar"><select className="krds-form-select adm-filter" aria-label="운영 현황 그룹 필터" value={groupId} onChange={(event) => { setGroupId(event.target.value); setExaminerId(''); }}><option value="">전체 그룹</option>{operationGroups(state, scopeId).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select className="krds-form-select adm-filter" aria-label="운영 현황 담당 심사관 필터" value={examinerId} onChange={(event) => setExaminerId(event.target.value)}><option value="">전체 담당 심사관</option>{state.users.filter((user) => personnelOf(state).memberships.some((entry) => entry.userId === user.id && (!groupId || entry.groupId === groupId)) || stats.cases.some((item) => item.examinerId === user.id)).map((user) => <option key={user.id} value={user.id}>{user.division} - {user.name}</option>)}</select><Button onClick={async () => { const result = await exportAdminStatistics(state, scopeId, groupId, examinerId, bureau); if (result) notify(result); }}>현재 범위 엑셀 저장</Button>{month && <Button primary={month.closed} disabled={busy} onClick={() => { if (window.confirm(month.closed ? `${monthLabel(month.id)} 운영을 재개방하시겠습니까? 각 단계의 운영 상태에 따라 입력과 평가를 진행할 수 있습니다.` : `${monthLabel(month.id)} 운영을 마감하시겠습니까? 선정·검색 결과·평가 입력이 중단됩니다.`)) void save({ type: 'setMonthClosed', monthId: month.id, closed: !month.closed }, month.closed ? `${monthLabel(month.id)} 운영을 재개방했습니다. 각 단계의 운영 상태는 그대로 유지됩니다.` : `${monthLabel(month.id)} 운영을 마감했습니다. 자료 조회와 다운로드는 계속할 수 있습니다.`); }}>{month.closed ? '운영 재개방' : '월 운영 마감'}</Button>}</div><div className="adm-metrics"><Metric label="참여 심사관" value={`${summary.participants}명`} hint={`${allMonths ? '전체 기간 ' : ''}미선정 ${summary.unselected}명`} /><Metric label="선정 출원" value={`${summary.cases}건`} hint={`공개 문헌 ${summary.documents}건`} /><Metric label="AI 입력 완료 / AI 입력 대상" value={`${inputComplete}건 / ${inputTarget}건`} hint={`완료율 ${percent(inputTarget ? inputComplete / inputTarget : null)}`} /><Metric label="평가 완료" value={`${summary.complete}건`} hint={`완료율 ${percent(summary.evaluationRate)}`} /></div><div className="adm-overview-grid"><section className="adm-list"><EditorHeader title="그룹별 진행" /><div className="adm-table-wrap"><table className="adm-table"><caption className="sr-only">그룹별 운영 진행</caption><thead><tr><th scope="col">그룹</th><th scope="col">대상건 선정</th><th scope="col">AI 검색 완료</th><th scope="col">평가 완료</th><th scope="col">완료율</th></tr></thead><tbody>{stats.groups.map((group) => <tr key={group.id}><td>{group.name}</td><td>{group.cases}</td><td>{group.inputComplete}</td><td>{group.complete}</td><td>{percent(group.completionRate)}</td></tr>)}</tbody></table>{!stats.groups.length && <Empty title="등록된 그룹이 없습니다." actions={<Button onClick={() => onNavigate('examiners')}>그룹 등록</Button>} />}</div></section><section className="adm-list"><EditorHeader title="조사 방식별 평가" /><div className="adm-table-wrap"><table className="adm-table adm-method-table"><caption className="sr-only">조사 방식별 유효 평가 통계</caption><thead><tr><th scope="col">조사 방식</th><th scope="col">문헌 수</th><th scope="col">평균 점수</th><th scope="col">인용률</th><th scope="col">1위 횟수</th></tr></thead><tbody>{methodStats.map((method) => <tr key={method.id}><td>{method.name}</td><td>{method.kind === 'baseline' ? '—' : method.documents}</td><td>{method.averageScore === null ? '—' : method.averageScore.toFixed(2)}</td><td>{percent(method.citationRate)}</td><td>{method.firstPlace}</td></tr>)}</tbody></table></div></section></div><section className="adm-list"><div className="adm-list-head"><div><h2>진행 상세</h2><p className="adm-secondary">미평가 {summary.unevaluated} · 평가 중 {summary.inProgress} · 재확인 필요 {summary.recheck}</p></div><div className="adm-inline-tabs">{[['accounts', '계정별 진행'], ['documents', 'AI 문헌 평가']].map(([id, label]) => <button type="button" key={id} aria-pressed={detail === id} className={detail === id ? 'is-selected' : ''} onClick={() => setDetail(id)}>{label}</button>)}</div></div>{detail === 'accounts' ? <div className="adm-table-wrap"><table className="adm-table"><caption className="sr-only">계정별 심사 및 AI 담당 업무 진행</caption><thead><tr><th scope="col">심사과</th><th scope="col">이름</th><th scope="col">대상 건 선정</th><th scope="col">AI 입력 대상</th><th scope="col">AI 입력 완료</th><th scope="col">평가 완료</th></tr></thead><tbody>{stats.accounts.map((account) => <tr key={account.id}><td>{account.division}</td><td>{account.name}</td><td>{account.cases}</td><td>{account.aiTarget}</td><td>{account.aiCompleted}</td><td>{account.complete}</td></tr>)}</tbody></table></div> : <div className="adm-table-wrap"><table className="adm-table"><caption className="sr-only">AI 문헌별 최신 결과에 대한 평가</caption><thead><tr>{allMonths && <th scope="col">운영월</th>}<th scope="col">출원번호</th><th scope="col">담당 심사관</th><th scope="col">AI 담당자</th><th scope="col">조사 방식</th><th scope="col">AI 검색 결과</th><th scope="col">인용여부</th><th scope="col">점수</th><th scope="col">평가 상태</th></tr></thead><tbody>{stats.rows.map((row) => <tr key={`${row.caseId}:${row.methodId}:${row.number}`}>{allMonths && <td>{monthLabel(row.monthId)}</td>}<td>{row.applicationNumber}</td><td>{row.examinerName}</td><td>{row.authorName}</td><td>{row.methodName}</td><td>{row.number}</td><td>{row.cited ?? '—'}</td><td>{row.score ?? '—'}</td><td>{row.status}</td></tr>)}</tbody></table>{!stats.rows.length && <Empty title="공개된 AI 문헌이 없습니다." />}</div>}</section></>;
}

export async function exportAdminStatistics(state: EvaluationState, monthId: string, groupId = '', examinerId = '', bureau?: Bureau) {
  const stats = getStatistics(state, monthId, groupId, examinerId);
  const methodStats = overviewMethodStatistics(state, stats);
  const allMonths = monthId === ALL_OPERATION_MONTHS;
  return exportWorkbook(`AI 선행기술 검색 포털_${bureau ? `${bureau}_` : ''}관리자통계_${allMonths ? '전체운영월' : monthId}.xlsx`, [
    { name: '그룹별 통계', rows: [['그룹', '참여 심사관', '선정 출원', 'AI 입력 완료', '평가 완료', '문헌 수', '평가 완료율'], ...stats.groups.map((row) => [row.name, row.participants, row.cases, row.inputComplete, row.complete, row.documents, percent(row.completionRate)])] },
    { name: '계정별 현황', rows: [['심사과', '이름', '대상 건 선정', 'AI 입력 대상', 'AI 입력 완료', '평가 완료'], ...stats.accounts.map((row) => [row.division, row.name, row.cases, row.aiTarget, row.aiCompleted, row.complete])] },
    { name: '출원별 현황', rows: [[...(allMonths ? ['운영월'] : []), '출원번호', 'CPC', '담당 심사관', '그룹', 'AI 입력 상태', '평가 상태', '선행기술조사 보고서'], ...stats.cases.map((row) => [...(allMonths ? [row.monthId] : []), row.applicationNumber, row.cpc, row.examinerName, row.groupName, row.inputComplete ? '입력 완료' : '대기 중', row.evaluationStatus, row.hasPriorArtReport === true ? '있음' : row.hasPriorArtReport === false ? '없음' : '미기록'])] },
    { name: '조사 방식별 통계', rows: [['조사 방식', '입력 대상', '입력 완료', '입력 대기', '문헌 수', '평균 점수', '인용률', '1위 횟수'], ...methodStats.map((row) => [row.name, row.target, row.completed, row.pending, row.documents, row.averageScore, percent(row.citationRate), row.firstPlace])] },
    { name: 'AI 검색 결과 평가', rows: [[...(allMonths ? ['운영월'] : []), '출원번호', '담당 심사관', 'AI 담당자', '조사 방식', 'AI 검색 결과', '인용여부', '점수', '평가 상태', '문헌 종류', 'URL', '보고서 (마크다운)'], ...stats.rows.map((row) => [...(allMonths ? [row.monthId] : []), row.applicationNumber, row.examinerName, row.authorName, row.methodName, row.number, row.cited, row.score, row.status, row.documentDetails.kind === 'patent' ? '특허' : row.documentDetails.kind === 'non-patent' ? '비특허문헌' : '기존 문헌', row.url, row.reportMarkdown])] },
    { name: '조회 기준', rows: [['항목', '값'], ['심사국', bureau || '기존 공용 업무'], ['운영월', allMonths ? operationMonthsForScope(state, monthId).map(month => monthLabel(month.id)).join(', ') : monthId], ['그룹', state.groups.find((group) => group.id === groupId)?.name || '전체 그룹'], ['담당 심사관', state.users.find((user) => user.id === examinerId)?.name || '전체 심사관'], ['집계 기준', '선정 확정·공개된 최신 AI 결과의 유효 평가. 초안·취소 출원 제외.'], ['가상 자료 여부', state.isDemo ? '가상 검증 자료' : '운영 자료']] },
  ]);
}
