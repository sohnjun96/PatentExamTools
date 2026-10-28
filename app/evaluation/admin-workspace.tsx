'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  caseStatus, emptyMonth, getStatistics, personnelOf, operationGroups, operationStageStatus, OPERATION_STAGES, OPERATION_STAGE_STATUS_LABELS,
  type EvaluationAction, type EvaluationState,
  type InvestigationMethod, type OperationMonth,
} from '@/app/lib/evaluation';
import { getAdminReadiness } from '@/app/lib/admin-guidance';
import { exportWorkbook } from '@/app/lib/export-workbook';
import type { Bureau } from '@/app/lib/bureaus';
import AccessibleDialog from '@/app/components/accessible-dialog';
import NoticeManager from './notice-manager';
import AccountManager, { AccountEditor, GroupEditor, GroupDeleteDialog, examinerForm, filterAdminUsers } from './examiner-manager';
export { AccountEditor, GroupEditor, GroupDeleteDialog, examinerForm, filterAdminUsers };
import './admin.css';

export const ADMIN_NAV = [
  { id: 'overview', label: '운영 현황', icon: '▦', description: '월별 진행을 확인하고 후속 업무를 찾습니다.' },
  { id: 'examiners', label: '심사관 관리', icon: '▤', description: '사용자 계정과 소속 그룹·AI 담당 배정을 관리합니다.' },
  { id: 'ai', label: 'AI 종류', icon: '◇', description: '비교에 사용할 AI 종류를 등록하고 관리합니다.' },
  { id: 'month', label: '월별 운영', icon: '◷', description: '단계별 운영 상태와 기한, 비교 AI를 설정합니다.' },
  { id: 'cases', label: '대상 출원', icon: '▧', description: '대상 출원을 찾고 운영상 필요한 등록과 취소를 처리합니다.' },
  { id: 'notices', label: '공지사항 관리', icon: '▣', description: '메인 페이지에 표시할 공지사항을 마크다운으로 작성하고 관리합니다.' },
] as const;
export type AdminSection = typeof ADMIN_NAV[number]['id'];
type Save = (action: EvaluationAction, message?: string) => Promise<boolean>;
export type AdminProps = {
  state: EvaluationState; month?: OperationMonth; bureau?: Bureau; busy: boolean;
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
  const { state, month, section, onNavigate } = props;
  const [caseFocus, setCaseFocus] = useState('all');
  const navigateCases = (focus: string) => { setCaseFocus(focus); onNavigate('cases'); };
  return <div className="adm">
    {section === 'overview' ? month ? <Overview {...props} month={month} navigateCases={navigateCases} /> : <Empty title="운영월을 등록하세요." actions={<Button onClick={() => onNavigate('month')}>월별 운영</Button>} />
      : section === 'examiners' ? <AccountManager {...props} />
      : section === 'ai' ? <MethodManager {...props} />
      : section === 'month' ? <MonthManager {...props} />
      : section === 'notices' ? <NoticeManager {...props} />
      : month ? <CaseManager key={caseFocus} {...props} month={month} initialStatus={caseFocus} /> : <Empty title="운영월을 등록하세요." actions={<Button onClick={() => onNavigate('month')}>월별 운영</Button>} />}
    {section !== 'notices' && !state.users.length && !state.groups.length && !state.cases.length && <section className="adm-demo ev-notice">
      <strong>가상 자료로 업무 흐름 확인</strong><p>가상 자료: 사용자 10명·그룹 2개·출원 20건</p>
      <Button disabled={props.busy} onClick={() => { if (window.confirm('가상 검증 자료를 불러오시겠습니까? 실제 출원과 실적이 아닌 예시가 저장됩니다.')) void props.save({ type: 'loadDemo' }, '가상 검증 자료를 불러왔습니다.'); }}>가상 검증 자료 불러오기</Button>
    </section>}
  </div>;
}

function MethodManager(props: FormProps) {
  const { state, busy, dirty, hasUnsaved } = props;
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [editing, setEditing] = useState<string | null>(null);
  const ai = state.methods.filter((method) => method.kind === 'ai' && !method.deletedAt);
  const selected = ai.find((method) => method.id === editing);
  const visible = ai.filter((method) => (!queryValue(query) || method.name.toLocaleLowerCase().includes(queryValue(query))) && (status === 'all' || method.active === (status === 'active')));
  function open(id: string) { if (!busy && confirmDiscard(hasUnsaved)) { dirty(false); setEditing(id); } }
  const saveMethod: Save = async (action, message) => {
    const saved = await props.save(action, message);
    if (saved) { setQuery(''); setStatus('all'); }
    return saved;
  };
  return <>
    <div className="adm-ai-summary"><span>등록된 AI <strong>{ai.length}개</strong></span><span>활성 AI <strong>{ai.filter((method) => method.active).length}개</strong></span></div>
    <div className="adm-toolbar">
      <div className="adm-search"><label className="sr-only" htmlFor="adm-method-search">AI 이름 검색</label><input id="adm-method-search" className="krds-input" placeholder="AI 이름으로 검색하세요" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <select className="krds-form-select adm-filter" aria-label="AI 활성 상태 필터" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">전체 상태</option><option value="active">활성</option><option value="inactive">비활성</option></select>
      <Button primary disabled={busy} aria-haspopup="dialog" onClick={() => open('new')}>AI 종류 추가</Button>
    </div>
    <section className="adm-ai-catalog" aria-labelledby="adm-ai-catalog-title">
      <div className="adm-ai-catalog-head"><h2 id="adm-ai-catalog-title">등록된 AI 종류</h2><span className="adm-secondary">{visible.length} / {ai.length}개</span></div>
      {visible.length ? <div className="adm-ai-grid">{visible.map((method) => <button type="button" key={method.id} className={'adm-ai-card ' + (method.active ? '' : 'is-inactive')} disabled={busy} aria-haspopup="dialog" aria-label={'AI 종류 ' + method.name + ' 수정'} aria-describedby={'adm-ai-state-' + method.id + ' adm-ai-assignment-' + method.id} onClick={() => open(method.id)}>
        <span className="adm-ai-card-top" id={'adm-ai-state-' + method.id}><span className="adm-ai-mark" aria-hidden="true">AI</span><Pill tone={method.active ? 'is-active' : 'is-inactive'}>{method.active ? '활성' : '비활성'}</Pill></span>
        <strong className="adm-ai-name">{method.name}</strong>
        <span className="adm-secondary" id={'adm-ai-assignment-' + method.id}>담당 배정 {personnelOf(state).assignments.filter((entry) => entry.methodId === method.id).length}개 그룹</span>
        <span className="adm-ai-edit">수정하기 <span aria-hidden="true">→</span></span>
      </button>)}</div> : <Empty title={ai.length ? '검색 조건에 맞는 AI가 없습니다.' : '등록된 AI 종류가 없습니다.'} actions={ai.length ? <Button onClick={() => { setQuery(''); setStatus('all'); }}>검색 조건 초기화</Button> : undefined}>{!ai.length && 'AI 종류 추가를 눌러 ChatGPT·클로드 같은 AI 도구를 등록하세요.'}</Empty>}
    </section>
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
        {!form.active && <p className="adm-secondary">비활성화해도 기존 월의 비교 설정은 유지됩니다.</p>}
      </div>
      <footer className="adm-actions adm-modal-actions">{method?.kind === 'ai' && <Button className="danger" style={{ marginRight: 'auto' }} disabled={busy} onClick={requestDelete}>AI 종류 삭제</Button>}{changed && <span className="adm-dirty is-dirty" role="status">미저장 변경 있음</span>}<Button disabled={busy} onClick={requestClose}>취소</Button><button type="submit" className="krds-btn medium ev-button primary" disabled={busy || !form.name.trim() || (Boolean(method) && !changed)}>{busy ? '저장 중…' : method ? '변경 저장' : 'AI 종류 추가'}</button></footer>
    </form>
  </AccessibleDialog>;
}

function Step({ number, title, status, children, complete = false, missing = false }: { number: number; title: string; status: string; children: React.ReactNode; complete?: boolean; missing?: boolean }) {
  return <section className={`adm-step ${complete ? 'is-complete' : ''} ${missing ? 'has-missing' : ''}`} id={`adm-step-${number}`}><div className="adm-step-head"><div><span className="adm-step-number">{number}</span><h2>{title}</h2></div><span className="adm-step-count">{status}</span></div><div className="adm-step-body">{children}</div></section>;
}

export function MonthManager(props: AdminProps) {
  const [newMonth, setNewMonth] = useState('');
  const months = [...props.state.months].sort((a, b) => b.id.localeCompare(a.id));
  const openCount = months.filter((month) => !month.closed).length;
  const activeMethods = props.state.methods.filter((method) => !method.deletedAt && (method.kind === 'baseline' || method.active));
  const canCreate = activeMethods.some((method) => method.kind === 'ai');
  return <>
    <div className="adm-toolbar"><label className="adm-field">새 운영월<input className="krds-input" type="month" value={newMonth} disabled={props.busy} onChange={(event) => setNewMonth(event.target.value)} /></label><Button primary disabled={props.busy || props.hasUnsaved || !newMonth || !canCreate || months.some((month) => month.id === newMonth)} onClick={async () => {
      if (props.busy || props.hasUnsaved || !newMonth || !canCreate || months.some((month) => month.id === newMonth)) return;
      if (await props.save({ type: 'saveMonth', month: { ...emptyMonth(newMonth), methodIds: activeMethods.map((method) => method.id) } }, monthLabel(newMonth) + ' 운영을 추가했습니다.')) { props.selectMonth(newMonth); setNewMonth(''); }
    }}>운영월 추가</Button>{!canCreate && <Button onClick={() => props.onNavigate('ai')}>AI 종류 등록</Button>}</div>
    <section className="adm-months" aria-labelledby="adm-months-title"><div className="adm-list-head"><h2 id="adm-months-title">운영 월</h2><span className="adm-secondary">운영 중 {openCount}개 · 마감 {months.length - openCount}개</span></div>
      <div className="adm-month-grid">{months.map((month) => <article key={month.id} className={'adm-month-card ' + (props.month?.id === month.id ? 'is-selected' : '')}>
        <div className="adm-name"><h3>{monthLabel(month.id)}</h3><Pill tone={month.closed ? 'is-inactive' : 'is-active'}>{month.closed ? '마감' : '운영 중'}</Pill></div>
        <p className="adm-secondary">확정 출원 {props.state.cases.filter((item) => item.monthId === month.id && item.status === 'confirmed').length}건 · 비교 AI {props.state.methods.filter((method) => method.kind === 'ai' && month.methodIds.includes(method.id)).length}개</p>
        <div className="adm-actions"><Button disabled={props.busy || props.month?.id === month.id} aria-label={monthLabel(month.id) + ' 일정·운영 설정'} aria-pressed={props.month?.id === month.id} onClick={() => props.selectMonth(month.id)}>일정·운영 설정</Button><Button disabled={props.busy || props.hasUnsaved} aria-label={monthLabel(month.id) + (month.closed ? ' 재개방' : ' 마감')} onClick={() => {
          if (window.confirm(monthLabel(month.id) + (month.closed ? ' 운영을 재개방하시겠습니까?' : ' 운영을 마감하시겠습니까? 해당 월의 업무 입력이 중단됩니다.'))) void props.save({ type: 'setMonthClosed', monthId: month.id, closed: !month.closed }, monthLabel(month.id) + (month.closed ? ' 운영을 재개방했습니다.' : ' 운영을 마감했습니다.'));
        }}>{month.closed ? '재개방' : '마감'}</Button></div>
      </article>)}</div>
    </section>
    {props.month && <MonthlyForm key={props.month.id} {...props} month={props.month} />}
  </>;
}

type OperatingSettings = Pick<OperationMonth, 'methodIds' | 'selectionDeadline' | 'resultDeadline' | 'evaluationDeadline'>;
export function operatingSettings(month: OperationMonth): OperatingSettings {
  return { methodIds: [...month.methodIds], selectionDeadline: month.selectionDeadline, resultDeadline: month.resultDeadline, evaluationDeadline: month.evaluationDeadline };
}
export function mergeOperatingMonth(month: OperationMonth, settings: OperatingSettings): OperationMonth {
  const merged = { ...month, ...operatingSettings({ ...month, ...settings }) };
  delete merged.caseLimit;
  return merged;
}

export function MonthlyForm({ state, month, busy, dirty, save, onNavigate, hasUnsaved }: MonthFormProps) {
  const [form, setForm] = useState<OperatingSettings>(() => operatingSettings(month));
  const changed = !same(form, operatingSettings(month)); useEffect(() => dirty(changed), [changed, dirty]);
  function update(patch: Partial<OperatingSettings>) { setForm((previous) => ({ ...previous, ...patch })); dirty(true); }
  const selectedAI = state.methods.filter((method) => method.kind === 'ai' && form.methodIds.includes(method.id));
  const selectableMethods = state.methods.filter(method => method.kind === 'ai' && (!method.deletedAt || form.methodIds.includes(method.id)));
  const disabled = busy || month.closed;
  const stageControlsDisabled = busy || month.closed || changed || hasUnsaved;
  return <>

    <Step number={1} title="기본 설정" status={month.closed ? '마감 · 일정 수정 가능' : '기한 선택 사항'} complete>
      <div className="adm-stage-grid">{OPERATION_STAGES.map(stage => {
        const status = operationStageStatus(month, stage.id);
        return <section className="adm-stage-card" key={stage.id} aria-labelledby={`adm-stage-${stage.id}`}>
          <div className="adm-name"><h3 id={`adm-stage-${stage.id}`}>{stage.label}</h3><Pill tone={month.closed || status === 'closed' ? 'is-inactive' : status === 'running' ? 'is-active' : 'is-warning'}>{month.closed ? '월 전체 마감' : OPERATION_STAGE_STATUS_LABELS[status]}</Pill></div>
          <label className="adm-field">예정 기한<input className="krds-input" type="date" aria-label={`${stage.label} 예정 기한`} disabled={busy} value={form[stage.deadline]} onChange={event => update({ [stage.deadline]: event.target.value })} /></label>
          <div className="adm-actions" role="group" aria-label={`${stage.label} 운영 제어`}>{([
            { status: 'running', label: '시작', message: '시작했습니다.' },
            { status: 'stopped', label: '중지', message: '중지했습니다.' },
            { status: 'closed', label: '마감', message: '마감했습니다.' },
          ] as const).map(action => <Button key={action.status} primary={action.status === 'running' && status !== 'running'} aria-label={`${stage.label} ${action.label}`} aria-pressed={status === action.status} disabled={stageControlsDisabled || status === action.status} onClick={() => {
            if (stageControlsDisabled || status === action.status) return;
            void save({ type: 'setMonthStage', monthId: month.id, stage: stage.id, status: action.status }, `${monthLabel(month.id)} ${stage.label} 단계를 ${action.message}`);
          }}>{action.label}</Button>)}</div>
        </section>;
      })}</div>
      {changed || hasUnsaved ? <p className="adm-secondary">설정 변경을 저장하거나 취소하면 단계 상태를 변경할 수 있습니다.</p> : month.closed ? <p className="adm-secondary">월 전체를 재개방하면 각 단계를 제어할 수 있습니다.</p> : null}
    </Step>
    <Step number={2} title="비교 AI 선택" status={'AI ' + selectedAI.length + '개 선택'} complete={selectedAI.length > 0} missing={!selectedAI.length}>
      {selectableMethods.length ? <div className="adm-check-list">{selectableMethods.map((method) => <label key={method.id} className="adm-check-row"><input type="checkbox" disabled={disabled} checked={form.methodIds.includes(method.id)} onChange={(event) => update({ methodIds: event.target.checked ? [...form.methodIds, method.id] : form.methodIds.filter((id) => id !== method.id) })} /><span>{method.name}</span>{method.deletedAt ? <Pill tone="is-inactive">삭제됨 · 기존 월</Pill> : !method.active && <Pill tone="is-inactive">비활성</Pill>}</label>)}</div> : <Empty title="비교할 AI 종류를 등록하세요." actions={<Button onClick={() => onNavigate('ai')}>AI 종류 추가</Button>} />}
      {!selectedAI.length && <p className="adm-inline-error">비교할 AI를 1개 이상 선택하세요.</p>}<Button onClick={() => onNavigate('ai')}>AI 종류 관리</Button>
    </Step>

    <div className="adm-save-bar"><div><strong>{monthLabel(month.id)} 운영 설정</strong>{changed && <p className="adm-secondary adm-dirty is-dirty" role="status">운영 설정 미저장</p>}</div><div className="adm-actions"><Button disabled={busy || !changed} onClick={() => { if (confirmDiscard(changed)) { setForm(operatingSettings(month)); dirty(false); } }}>설정 변경 취소</Button><Button primary disabled={busy || !changed || !selectedAI.length} onClick={() => void save({ type: 'saveMonth', month: mergeOperatingMonth(month, form) }, monthLabel(month.id) + ' 운영 기한·비교 AI 설정을 저장했습니다.')}>월별 운영 저장</Button></div></div>
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

function CaseManager(props: AdminProps & { month: OperationMonth; initialStatus: string }) {
  const { state, month, busy, hasUnsaved, dirty } = props; const [query, setQuery] = useState(''); const [status, setStatus] = useState(props.initialStatus); const [examinerId, setExaminerId] = useState(''); const [editing, setEditing] = useState<string | null>(null);
  const visible = filterTargetCases(state, month.id, { query, status, examinerId }); const all = state.cases.filter((item) => item.monthId === month.id); const selected = all.find((item) => item.id === editing);
  function open(id: string) { if (confirmDiscard(hasUnsaved)) { dirty(false); setEditing(id); } }
  return <><div className="adm-toolbar"><div className="adm-search"><label className="sr-only" htmlFor="adm-case-search">출원번호, 담당자 또는 CPC 검색</label><input id="adm-case-search" className="krds-input" value={query} placeholder="출원번호, 담당자 또는 CPC 검색" onChange={(event) => setQuery(event.target.value)} /></div><select className="krds-form-select adm-filter" aria-label="대상 출원 상태 필터" value={status} onChange={(event) => setStatus(event.target.value)}>{caseFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select className="krds-form-select adm-filter" aria-label="대상 출원 담당 심사관 필터" value={examinerId} onChange={(event) => setExaminerId(event.target.value)}><option value="">전체 담당 심사관</option>{state.users.filter((user) => personnelOf(state).memberships.some((entry) => entry.userId === user.id) || all.some((item) => item.examinerId === user.id)).map((user) => <option key={user.id} value={user.id}>{user.division} - {user.name}</option>)}</select><Button primary disabled={busy || month.closed} onClick={() => open('new')}>대상 출원 등록</Button></div><div className="adm-split"><section className="adm-list"><div className="adm-list-head"><h2>대상 출원 목록</h2><span className="adm-secondary">{visible.length} / {all.length}건</span></div>{visible.length ? visible.map((item) => { const progress = item.status === 'confirmed' ? caseStatus(state, item) : null; return <button type="button" key={item.id} className={`adm-list-item ${editing === item.id ? 'is-selected' : ''}`} disabled={busy} aria-pressed={editing === item.id} onClick={() => open(item.id)}><span className="adm-name">{item.applicationNumber}<Pill tone={item.status === 'cancelled' ? 'is-inactive' : progress?.stale ? 'is-warning' : progress?.complete ? 'is-active' : ''}>{item.status === 'draft' ? '선정 초안' : item.status === 'cancelled' ? '선정 취소' : progress?.evaluationStatus}</Pill></span><span className="adm-secondary">{item.examinerName} · {item.groupName} · {item.cpc || 'CPC 미입력'}</span>{progress && <span className="adm-meta">AI {progress.inputComplete ? '입력 완료' : '입력 대기'}</span>}</button>; }) : <Empty title="현재 조건에 해당하는 출원이 없습니다." actions={<Button onClick={() => { setQuery(''); setStatus('all'); setExaminerId(''); }}>검색 조건 초기화</Button>} />}</section><section className="adm-editor">{editing === 'new' ? <CaseRegistration {...props} onClose={() => { dirty(false); setEditing(null); }} /> : selected ? <><EditorHeader title="선택한 대상 출원">{selected.applicationNumber}</EditorHeader><div className="adm-editor-body"><dl className="adm-detail-list"><div><dt>출원번호</dt><dd>{selected.applicationNumber}</dd></div><div><dt>담당 심사관</dt><dd>{selected.examinerName} · {selected.division}</dd></div><div><dt>그룹</dt><dd>{selected.groupName}</dd></div><div><dt>CPC</dt><dd>{selected.cpc || '—'}</dd></div><div><dt>선정 상태</dt><dd>{selected.status === 'confirmed' ? '선정 확정' : selected.status === 'cancelled' ? '선정 취소' : '선정 초안'}</dd></div></dl><div className="adm-actions"><a className="krds-btn medium ev-button" target="_blank" rel="noopener noreferrer" href={`/patent?applicationNumber=${encodeURIComponent(selected.applicationNumber)}`}>사건 조회 <span className="ev-new-window">새 창</span></a>{selected.status === 'confirmed' && <Button className="danger" disabled={busy || month.closed} onClick={async () => { if (window.confirm(`${selected.applicationNumber} 선정을 취소하시겠습니까? AI 담당 업무와 평가 집계에서 제외됩니다.`) && await props.save({ type: 'cancelCase', caseId: selected.id }, `${selected.applicationNumber} 선정을 취소했습니다.`)) setEditing(null); }}>선정 취소</Button>}</div>{month.closed && <p className="adm-secondary">마감한 운영월에서는 출원을 추가하거나 취소할 수 없습니다.</p>}</div></> : <Empty title="확인할 출원을 선택하세요." actions={<Button primary disabled={month.closed || busy} onClick={() => open('new')}>대상 출원 등록</Button>}>선정 확정한 출원은 운영상 필요한 경우 관리자가 취소할 수 있습니다.</Empty>}</section></div></>;
}

function CaseRegistration({ state, month, busy, dirty, save, onClose, onNavigate }: MonthFormProps & { onClose: () => void }) {
  const [examinerId, setExaminerId] = useState(''); const [number, setNumber] = useState(''); const [cpc, setCpc] = useState(''); const [query, setQuery] = useState(''); const changed = Boolean(examinerId || number || cpc); useEffect(() => dirty(changed), [changed, dirty]);
  const eligibleExaminers = state.users.filter((user) => user.active && user.roles.includes('examiner') && personnelOf(state).memberships.some((entry) => entry.userId === user.id));
  const candidates = eligibleExaminers.filter((user) => user.id === examinerId || `${user.name} ${user.division}`.toLocaleLowerCase().includes(queryValue(query)));
  return <><EditorHeader title="대상 출원 등록">그룹이 배정된 심사관에게 등록합니다.</EditorHeader><form className="adm-editor-body" onSubmit={async (event) => { event.preventDefault(); if (await save({ type: 'adminAddCase', monthId: month.id, examinerId, row: { applicationNumber: number, cpc } }, `${number} 출원을 등록했습니다.`)) { dirty(false); onClose(); } }}><label className="adm-field">담당 심사관 검색<input className="krds-input" placeholder="이름 또는 심사과" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="adm-field">담당 심사관 <span className="adm-required">필수</span><select className="krds-form-select" required disabled={busy || month.closed} value={examinerId} onChange={(event) => setExaminerId(event.target.value)}><option value="">심사관 선택</option>{candidates.map((user) => <option key={user.id} value={user.id}>{user.division} - {user.name}</option>)}</select></label>{!eligibleExaminers.length && <Empty title="그룹이 배정된 심사관이 없습니다." actions={<Button onClick={() => onNavigate('examiners')}>심사관 관리</Button>} />}<label className="adm-field">출원번호 <span className="adm-required">필수</span><input className="krds-input" required disabled={busy || month.closed} value={number} placeholder="10-2024-0000000" onChange={(event) => setNumber(event.target.value)} /></label><label className="adm-field">CPC · 선택<input className="krds-input" disabled={busy || month.closed} value={cpc} onChange={(event) => setCpc(event.target.value)} /></label><div className="adm-actions"><Button disabled={busy} onClick={() => { if (confirmDiscard(changed)) onClose(); }}>취소</Button><button type="submit" className="krds-btn medium ev-button primary" disabled={busy || month.closed || !examinerId || !number.trim()}>출원 등록</button></div></form></>;
}

function Overview(props: AdminProps & { month: OperationMonth; navigateCases: (focus: string) => void }) {
  const { state, month, busy, save, notify, onNavigate, navigateCases, bureau } = props;
  const [groupId, setGroupId] = useState(''); const [examinerId, setExaminerId] = useState(''); const [detail, setDetail] = useState('followup'); const [status, setStatus] = useState('all');
  const stats = useMemo(() => getStatistics(state, month.id, groupId, examinerId), [state, month.id, groupId, examinerId]); const readiness = getAdminReadiness(state, month); const { summary } = stats;
  const followups = filterTargetCases(state, month.id, { status: status === 'all' ? 'confirmed' : status, groupId, examinerId });
  return <><div className="adm-toolbar"><select className="krds-form-select adm-filter" aria-label="운영 현황 그룹 필터" value={groupId} onChange={(event) => { setGroupId(event.target.value); setExaminerId(''); }}><option value="">전체 그룹</option>{operationGroups(state, month.id).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select className="krds-form-select adm-filter" aria-label="운영 현황 담당 심사관 필터" value={examinerId} onChange={(event) => setExaminerId(event.target.value)}><option value="">전체 담당 심사관</option>{state.users.filter((user) => personnelOf(state).memberships.some((entry) => entry.userId === user.id && (!groupId || entry.groupId === groupId)) || stats.cases.some((item) => item.examinerId === user.id)).map((user) => <option key={user.id} value={user.id}>{user.division} - {user.name}</option>)}</select><Button onClick={async () => { const result = await exportAdminStatistics(state, month.id, groupId, examinerId, bureau); if (result) notify(result); }}>현재 범위 엑셀 저장</Button><Button primary={month.closed} disabled={busy} onClick={() => { if (window.confirm(month.closed ? `${monthLabel(month.id)} 운영을 재개방하시겠습니까? 각 단계의 운영 상태에 따라 입력과 평가를 진행할 수 있습니다.` : `${monthLabel(month.id)} 운영을 마감하시겠습니까? 선정·검색 결과·평가 입력이 중단됩니다.`)) void save({ type: 'setMonthClosed', monthId: month.id, closed: !month.closed }, month.closed ? `${monthLabel(month.id)} 운영을 재개방했습니다. 각 단계의 운영 상태는 그대로 유지됩니다.` : `${monthLabel(month.id)} 운영을 마감했습니다. 자료 조회와 다운로드는 계속할 수 있습니다.`); }}>{month.closed ? '운영 재개방' : '월 운영 마감'}</Button></div><div className="adm-metrics"><Metric label="소속 심사관" value={`${summary.participants}명`} hint={`미선정 ${summary.unselected}명`} /><Metric label="확정 출원" value={`${summary.cases}건`} hint={`공개 문헌 ${summary.documents}건`} /><Metric label="AI 입력 완료" value={`${summary.inputComplete}건`} hint={`완료율 ${percent(summary.inputRate)}`} /><Metric label="평가 완료" value={`${summary.complete}건`} hint={`완료율 ${percent(summary.evaluationRate)}`} /></div><div className="adm-followups"><button type="button" className="adm-link-card" onClick={() => navigateCases('inputPending')}><span>AI 입력 대기</span><strong>{summary.inputPending}건</strong><span>담당 출원 찾기</span></button><button type="button" className="adm-link-card" onClick={() => navigateCases('recheck')}><span>평가 재확인 필요</span><strong>{summary.recheck}건</strong><span>변경된 결과 확인</span></button><button type="button" className="adm-link-card" onClick={() => onNavigate('examiners')}><span>담당 배정 확인</span><strong>{readiness.missingAssignments.length + readiness.unavailableAssignments.length}건</strong><span>심사관 관리</span></button></div><div className="adm-overview-grid"><section className="adm-list"><EditorHeader title="그룹별 진행" /><div className="adm-table-wrap"><table className="adm-table"><caption className="sr-only">그룹별 월 운영 진행</caption><thead><tr><th scope="col">그룹</th><th scope="col">대상건 선정</th><th scope="col">AI 검색 완료</th><th scope="col">평가 완료</th><th scope="col">완료율</th></tr></thead><tbody>{stats.groups.map((group) => <tr key={group.id}><td>{group.name}</td><td>{group.cases}</td><td>{group.inputComplete}</td><td>{group.complete}</td><td>{percent(group.completionRate)}</td></tr>)}</tbody></table>{!stats.groups.length && <Empty title="등록된 그룹이 없습니다." actions={<Button onClick={() => onNavigate('examiners')}>그룹 등록</Button>} />}</div></section><section className="adm-list"><EditorHeader title="조사 방식별 평가" /><div className="adm-table-wrap"><table className="adm-table"><caption className="sr-only">조사 방식별 유효 평가 통계</caption><thead><tr><th scope="col">조사 방식</th><th scope="col">문헌 수</th><th scope="col">평균 점수</th><th scope="col">인용률</th><th scope="col">1위 횟수</th></tr></thead><tbody>{stats.methods.map((method) => <tr key={method.id}><td>{method.name}</td><td>{method.kind === 'baseline' ? '—' : method.documents}</td><td>{method.averageScore === null ? '—' : method.averageScore.toFixed(2)}</td><td>{percent(method.citationRate)}</td><td>{method.firstPlace}</td></tr>)}</tbody></table></div></section></div><section className="adm-list"><div className="adm-list-head"><div><h2>진행 상세</h2><p className="adm-secondary">미평가 {summary.unevaluated} · 평가 중 {summary.inProgress} · 재확인 필요 {summary.recheck}</p></div><div className="adm-inline-tabs">{[['followup', '출원별 후속 업무'], ['accounts', '계정별 진행'], ['documents', 'AI 문헌 평가']].map(([id, label]) => <button type="button" key={id} aria-pressed={detail === id} className={detail === id ? 'is-selected' : ''} onClick={() => setDetail(id)}>{label}</button>)}</div></div>{detail === 'followup' ? <><div className="adm-toolbar adm-inset"><select className="krds-form-select adm-filter" aria-label="후속 업무 상태" value={status} onChange={(event) => setStatus(event.target.value)}>{caseFilters.filter(([value]) => !['draft', 'cancelled', 'confirmed'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="adm-secondary">{followups.length}건</span></div><div className="adm-table-wrap"><table className="adm-table"><caption className="sr-only">현재 조회 범위의 출원별 후속 업무</caption><thead><tr><th scope="col">출원번호</th><th scope="col">담당 심사관</th><th scope="col">그룹</th><th scope="col">AI 입력</th><th scope="col">평가 상태</th></tr></thead><tbody>{followups.map((item) => { const progress = caseStatus(state, item); return <tr key={item.id}><td>{item.applicationNumber}</td><td>{item.examinerName}</td><td>{item.groupName}</td><td>{progress.inputComplete ? '입력 완료' : '대기 중'}</td><td><Pill tone={progress.stale ? 'is-warning' : progress.complete ? 'is-active' : ''}>{progress.evaluationStatus}</Pill></td></tr>; })}</tbody></table>{!followups.length && <Empty title="현재 조건의 후속 업무가 없습니다." />}</div></> : detail === 'accounts' ? <div className="adm-table-wrap"><table className="adm-table"><caption className="sr-only">계정별 심사 및 AI 담당 업무 진행</caption><thead><tr><th scope="col">심사과</th><th scope="col">이름</th><th scope="col">개인 출원</th><th scope="col">평가 완료</th><th scope="col">AI 담당 대상</th><th scope="col">AI 입력 완료</th></tr></thead><tbody>{stats.accounts.map((account) => <tr key={account.id}><td>{account.division}</td><td>{account.name}</td><td>{account.cases}</td><td>{account.complete}</td><td>{account.aiTarget}</td><td>{account.aiCompleted}</td></tr>)}</tbody></table></div> : <div className="adm-table-wrap"><table className="adm-table"><caption className="sr-only">AI 문헌별 최신 결과에 대한 평가</caption><thead><tr><th scope="col">출원번호</th><th scope="col">담당 심사관</th><th scope="col">AI 담당자</th><th scope="col">조사 방식</th><th scope="col">AI 검색 결과</th><th scope="col">인용여부</th><th scope="col">점수</th><th scope="col">평가 상태</th></tr></thead><tbody>{stats.rows.map((row) => <tr key={`${row.caseId}:${row.methodId}:${row.number}`}><td>{row.applicationNumber}</td><td>{row.examinerName}</td><td>{row.authorName}</td><td>{row.methodName}</td><td>{row.number}</td><td>{row.cited ?? '—'}</td><td>{row.score ?? '—'}</td><td>{row.status}</td></tr>)}</tbody></table>{!stats.rows.length && <Empty title="공개된 AI 문헌이 없습니다." />}</div>}</section></>;
}

export async function exportAdminStatistics(state: EvaluationState, monthId: string, groupId = '', examinerId = '', bureau?: Bureau) {
  const stats = getStatistics(state, monthId, groupId, examinerId);
  return exportWorkbook(`AI 선행기술 검색 포털_${bureau ? `${bureau}_` : ''}관리자통계_${monthId}.xlsx`, [
    { name: '그룹별 통계', rows: [['그룹', '심사관', '확정 출원', 'AI 입력 완료', '평가 완료', '문헌 수', '평가 완료율'], ...stats.groups.map((row) => [row.name, row.participants, row.cases, row.inputComplete, row.complete, row.documents, percent(row.completionRate)])] },
    { name: '계정별 현황', rows: [['심사과', '이름', '개인 출원', '평가 완료', 'AI 담당 대상', 'AI 담당 입력 완료'], ...stats.accounts.map((row) => [row.division, row.name, row.cases, row.complete, row.aiTarget, row.aiCompleted])] },
    { name: '출원별 현황', rows: [['출원번호', 'CPC', '담당 심사관', '그룹', 'AI 입력 상태', '평가 상태'], ...stats.cases.map((row) => [row.applicationNumber, row.cpc, row.examinerName, row.groupName, row.inputComplete ? '입력 완료' : '대기 중', row.evaluationStatus])] },
    { name: '조사 방식별 통계', rows: [['조사 방식', '입력 대상', '입력 완료', '입력 대기', '문헌 수', '평균 점수', '인용률', '1위 횟수'], ...stats.methods.map((row) => [row.name, row.target, row.completed, row.pending, row.documents, row.averageScore, percent(row.citationRate), row.firstPlace])] },
    { name: 'AI 검색 결과 평가', rows: [['출원번호', '담당 심사관', 'AI 담당자', '조사 방식', 'AI 검색 결과', '인용여부', '점수', '평가 상태'], ...stats.rows.map((row) => [row.applicationNumber, row.examinerName, row.authorName, row.methodName, row.number, row.cited, row.score, row.status])] },
    { name: '조회 기준', rows: [['항목', '값'], ['심사국', bureau || '기존 공용 업무'], ['운영월', monthId], ['그룹', state.groups.find((group) => group.id === groupId)?.name || '전체 그룹'], ['담당 심사관', state.users.find((user) => user.id === examinerId)?.name || '전체 심사관'], ['집계 기준', '선정 확정·공개된 최신 AI 결과의 유효 평가. 초안·취소 출원 제외.'], ['가상 자료 여부', state.isDemo ? '가상 검증 자료' : '운영 자료']] },
  ]);
}
