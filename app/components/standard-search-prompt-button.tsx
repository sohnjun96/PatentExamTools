'use client';

import { useId, useRef, useState } from 'react';
import AccessibleDialog from './accessible-dialog';
import { STANDARD_SEARCH_PROMPT } from '../lib/standard-search-prompt';
import './standard-search-prompt-button.css';

export default function StandardSearchPromptButton({ onCopied }: { onCopied?: () => void }) {
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const copyingRef = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  async function copyPrompt() {
    if (copyingRef.current) return;
    copyingRef.current = true; setCopying(true);
    try { await navigator.clipboard.writeText(STANDARD_SEARCH_PROMPT); }
    catch { setFallbackOpen(true); return; }
    finally { copyingRef.current = false; setCopying(false); }
    setFallbackOpen(false); onCopied?.();
  }
  return <>
    <button ref={trigger} type="button" className="krds-btn medium ev-button" disabled={copying} onClick={copyPrompt}>표준 검색 프롬프트</button>
    {fallbackOpen && <AccessibleDialog labelledBy={titleId} className="standard-search-prompt-dialog" onClose={() => setFallbackOpen(false)} fallbackFocusRef={trigger}>
      <header><h2 id={titleId}>표준 검색 프롬프트</h2><button type="button" aria-label="표준 검색 프롬프트 닫기" onClick={() => setFallbackOpen(false)}>×</button></header>
      <div className="standard-search-prompt-body"><p>자동 복사를 사용할 수 없습니다. 아래 내용을 선택한 뒤 Ctrl+C(또는 ⌘C)로 복사하거나 다시 시도해 주세요.</p><textarea aria-label="표준 검색 프롬프트 내용" readOnly value={STANDARD_SEARCH_PROMPT} rows={12} data-dialog-autofocus onFocus={event => event.currentTarget.select()} /></div>
      <footer><button type="button" className="krds-btn medium ev-button" onClick={() => setFallbackOpen(false)}>닫기</button><button type="button" className="krds-btn medium ev-button primary" disabled={copying} onClick={copyPrompt}>프롬프트 복사</button></footer>
    </AccessibleDialog>}
  </>;
}
