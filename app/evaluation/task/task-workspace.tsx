'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AppIcon from '@/app/components/app-icon';
import TargetPublicationDownload from '@/app/components/target-publication-download';
import { bureauPath, evaluationApiUrl } from '@/app/lib/bureaus';
import { isDemoApplicationNumber, isOperationStageOpen, literatureDetailsFor, operationStageBlockReason, resultFor, type EvaluationAction, type EvaluationState } from '@/app/lib/evaluation';
import { saveFailureGuidance } from '@/app/lib/workspace-location';
import { resolveTask, taskContentKey, TASK_UPDATE_CHANNEL, type TaskRequest } from '@/app/lib/task-window';
import LiteratureEditor from '../literature-editor';
import EvaluationReader from './evaluation-reader';
import '../evaluation.css';
import './task.css';

type Payload = { state: EvaluationState; revision: number; error?: string };
export default function TaskWorkspace({ request }: { request: TaskRequest }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const dirty = useRef(false);
  const submitting = useRef(false);
  const generation = useRef(0);
  const contentKey = useRef('');
  const lastAttempt = useRef<EvaluationAction | null>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const payloadRef = useRef<Payload | null>(null);
  const conflictActive = useRef(false);
  const focusError = useRef(true);
  const endpoint = evaluationApiUrl(request.bureau, false, request.userId);
  const load = useCallback(async () => {
    const id = ++generation.current;
    focusError.current = true; setLoading(true); setError('');
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const next = await response.json() as Payload;
      if (!response.ok) throw new Error(next.error || '업무 자료를 불러오지 못했습니다.');
      if (id !== generation.current) return;
      const nextKey = taskContentKey(next.state, request);
      if (contentKey.current !== nextKey) setFormVersion(value => value + 1);
      contentKey.current = nextKey;
      payloadRef.current = next; conflictActive.current = false;
      setPayload(next); setConflict(false); dirty.current = false;
    } catch (cause) {
      if (id === generation.current) setError(cause instanceof Error && /[가-힣]/.test(cause.message) ? cause.message : '업무 자료에 연결하지 못했습니다. 다시 불러와 주세요.');
    } finally { if (id === generation.current) setLoading(false); }
  }, [endpoint, request]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty.current || submitting.current) { event.preventDefault(); event.returnValue = ''; } };
    const focus = () => { if (!dirty.current && !submitting.current && !loading) void load(); };
    window.addEventListener('beforeunload', leave); window.addEventListener('focus', focus);
    return () => { window.removeEventListener('beforeunload', leave); window.removeEventListener('focus', focus); };
  }, [load, loading]);
  useEffect(() => { if (error && focusError.current) errorBox.current?.focus(); }, [error]);
  const target = payload ? resolveTask(payload.state, request) : null;
  const title = request.kind === 'result' ? 'AI 검색 결과 입력' : 'AI 검색 결과 평가';
  useEffect(() => { document.title = `${target?.item.applicationNumber || ''} ${title} | AI 선행기술 검색 포털`; }, [target?.item.applicationNumber, title]);
  async function save(action: EvaluationAction) {
    const current = payloadRef.current;
    const automatic = action.type === 'saveResultDraft';
    if (!current || !target || submitting.current || loading || automatic && conflictActive.current) return false;
    // Only this window's task can be submitted, even if a child callback is stale.
    if (!(request.kind === 'result' ? action.type === 'saveResult' || action.type === 'saveResultDraft' : action.type === 'saveEvaluation') || !('caseId' in action) || action.caseId !== target.item.id || (action.type === 'saveResult' || action.type === 'saveResultDraft') && action.methodId !== request.methodId) return false;
    const id = generation.current;
    submitting.current = true; lastAttempt.current = structuredClone(action);
    focusError.current = !automatic;
    if (automatic) setDraftBusy(true); else setBusy(true);
    setError(''); setConflict(false);
    try {
      const send = (revision: number) => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, actor: { userId: request.userId }, action }) });
      let response = await send(current.revision);
      let next = await response.json() as Payload;
      if (automatic && response.status === 409) {
        const refreshed = await fetch(endpoint, { cache: 'no-store' });
        const latest = await refreshed.json() as Payload;
        if (id !== generation.current) return false;
        // Other cases share a revision. Retry once only when this result's
        // persisted draft/publication and assignment are still unchanged.
        if (refreshed.ok && resolveTask(latest.state, request) && taskContentKey(latest.state, request) === taskContentKey(current.state, request)) {
          payloadRef.current = latest;
          response = await send(latest.revision);
          next = await response.json() as Payload;
        }
      }
      if (id !== generation.current) return false;
      if (!response.ok) { const feedback = saveFailureGuidance(response.status, next.error || '저장하지 못했습니다.'); conflictActive.current = feedback.conflict; setError(feedback.message); setConflict(feedback.conflict); return false; }
      contentKey.current = taskContentKey(next.state, request);
      payloadRef.current = next; conflictActive.current = false;
      setPayload(next); if (!automatic) dirty.current = false;
      if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel(TASK_UPDATE_CHANNEL); channel.postMessage({ type: 'saved', bureau: request.bureau || null }); channel.close(); }
      return true;
    } catch {
      if (id === generation.current) setError('저장하지 못했습니다. 입력 내용은 유지되어 있습니다. 연결 상태를 확인한 뒤 다시 저장해 주세요.');
      return false;
    } finally { submitting.current = false; if (id === generation.current) { if (automatic) setDraftBusy(false); else setBusy(false); } }
  }
  function close() {
    if (submitting.current) return;
    if (dirty.current && !window.confirm('저장하지 않은 입력이 있습니다. 입력을 버리고 닫으시겠습니까?')) return;
    dirty.current = false; window.close();
    window.setTimeout(() => { if (!window.closed) window.location.assign(bureauPath(request.bureau)); }, 100);
  }
  function reload() {
    if (submitting.current || dirty.current && !window.confirm('현재 입력을 버리고 최신 자료를 불러오시겠습니까? 필요한 입력은 먼저 보관해 주세요.')) return;
    void load();
  }
  function backup() {
    if (!lastAttempt.current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ request, revision: payload?.revision, action: lastAttempt.current }, null, 2)], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `AI검색업무_입력보관_${request.caseId}.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const locked = busy || loading;
  const result = target && payload ? resultFor(payload.state, target.item.id, request.methodId, request.userId) : undefined;
  const stage = request.kind === 'result' ? 'result' : 'evaluation';
  const reason = target ? operationStageBlockReason(target.month, stage) : '';
  return <div className="ev tw">
    <header className="tw-chrome"><a href={bureauPath(request.bureau)} className="tw-brand"><span className="ev-brand-mark" aria-hidden="true">AI</span><span>AI 선행기술 검색 포털 <span aria-hidden="true">/</span> {request.kind === 'result' ? 'AI 담당 업무' : '내 심사 업무'}</span></a><button type="button" className="ev-button link" disabled={busy || draftBusy} onClick={close}><AppIcon name="x" />창 닫기</button></header>
    <div className="tw-heading"><div><h1>{title}</h1>{target && <div className="tw-context"><strong>{target.item.applicationNumber}</strong><span>{target.item.cpc || 'CPC 미입력'}</span><span>{target.item.examinerName} · {target.item.division || target.item.groupName}</span></div>}</div>{request.kind === 'result' && target && <div className="tw-header-actions"><span className="ev-badge blue">{target.method?.name}</span><TargetPublicationDownload applicationNumber={target.item.applicationNumber} context="detail" showContext={false} disabled={locked || Boolean(payload?.state.isDemo && isDemoApplicationNumber(target.item.applicationNumber))} /></div>}</div>
    {error && <div className="ev-alert tw-feedback" ref={errorBox} tabIndex={-1} role="alert"><p>{error}</p><div className="ev-actions">{lastAttempt.current && <button className="ev-button tiny" type="button" onClick={backup}>입력 보관 파일 저장</button>}{(conflict || !payload) && <button className="ev-button tiny" type="button" disabled={locked} onClick={reload}>최신 자료 다시 불러오기</button>}</div></div>}
    {loading && !payload ? <p className="tw-empty" role="status">업무 자료를 불러오고 있습니다.</p> : !target ? <div className="tw-empty"><h2>이 업무를 열 수 없습니다.</h2><p>담당 계정과 출원 상태를 확인해 주세요.</p><a className="ev-button" href={bureauPath(request.bureau)}>업무 목록으로</a></div> : <>
      {reason && <div className="ev-notice warning tw-feedback" role="status">{reason}</div>}
      {request.kind === 'result' ? <LiteratureEditor key={formVersion} initialDocuments={result?.draftEditorState?.documents ?? literatureDetailsFor(result, 'draft')} initialBulkInput={result?.draftEditorState?.bulkInput ?? ''} disabled={locked || !isOperationStageOpen(target.month, 'result')} dirty={value => { dirty.current = value; }} onAutoSave={editorState => save({ type: 'saveResultDraft', caseId: target.item.id, methodId: request.methodId, editorState })} onSave={(documentDetails, publish) => save({ type: 'saveResult', caseId: target.item.id, methodId: request.methodId, documents: documentDetails.map(entry => entry.number), documentDetails, publish })} /> : <EvaluationReader key={formVersion} state={payload!.state} month={target.month} item={target.item} busy={locked} dirty={value => { dirty.current = value; }} save={save} />}
    </>}
  </div>;
}
