'use client';

import { useId, useRef, useState } from 'react';
import AccessibleDialog from './accessible-dialog';
import { STANDARD_SEARCH_PROMPT } from '../lib/standard-search-prompt';
import './standard-search-prompt-button.css';

export default function StandardSearchPromptButton({ prompt = STANDARD_SEARCH_PROMPT, onCopied }: { prompt?: string; onCopied?: () => void }) {
  const [dialog, setDialog] = useState<'fallback' | 'success' | null>(null);
  const [copying, setCopying] = useState(false);
  const copyingRef = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  async function copyPrompt() {
    if (copyingRef.current) return;
    copyingRef.current = true; setCopying(true);
    try { await navigator.clipboard.writeText(prompt); }
    catch { setDialog('fallback'); return; }
    finally { copyingRef.current = false; setCopying(false); }
    setDialog('success'); onCopied?.();
  }
  return <>
    <button ref={trigger} type="button" className="krds-btn medium ev-button" disabled={copying} onClick={copyPrompt}>표준 검색 프롬프트</button>
    {dialog && <AccessibleDialog key={dialog} labelledBy={titleId} className={`standard-search-prompt-dialog${dialog === 'success' ? ' standard-search-prompt-success' : ''}`} onClose={() => setDialog(null)} fallbackFocusRef={trigger}>
      {dialog === 'success' ? <>
        <header><span className="standard-search-prompt-success-icon" aria-hidden="true">✓</span><h2 id={titleId}>복사 완료 되었습니다.</h2></header>
        <div className="standard-search-prompt-body"><p>AI에 공개공보를 첨부하고, <strong>컨트롤 + V</strong>로 프롬프트를 대화창에 붙여넣으세요.</p></div>
        <footer><button type="button" className="krds-btn medium ev-button primary" data-dialog-autofocus onClick={() => setDialog(null)}>확인</button></footer>
      </> : <>
        <header><h2 id={titleId}>표준 검색 프롬프트</h2><button type="button" aria-label="표준 검색 프롬프트 닫기" onClick={() => setDialog(null)}>×</button></header>
        <div className="standard-search-prompt-body"><p>자동 복사를 사용할 수 없습니다. 아래 내용을 선택한 뒤 Ctrl+C(또는 ⌘C)로 복사하거나 다시 시도해 주세요.</p><textarea aria-label="표준 검색 프롬프트 내용" readOnly value={prompt} rows={12} data-dialog-autofocus onFocus={event => event.currentTarget.select()} /></div>
        <footer><button type="button" className="krds-btn medium ev-button" onClick={() => setDialog(null)}>닫기</button><button type="button" className="krds-btn medium ev-button primary" disabled={copying} onClick={copyPrompt}>프롬프트 복사</button></footer>
      </>}
    </AccessibleDialog>}
  </>;
}
