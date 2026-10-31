'use client';

import { useEffect, useRef, useState } from 'react';
import { SEARCH_PROMPT_MAX_LENGTH } from '@/app/lib/evaluation';
import { standardSearchPromptText } from '@/app/lib/standard-search-prompt';
import type { AdminProps } from './admin-workspace';
import './search-prompt-manager.css';

type Props = Pick<AdminProps, 'state' | 'bureau' | 'busy' | 'save' | 'dirty'>;

export default function SearchPromptManager({ state, bureau, busy, save, dirty }: Props) {
  const saved = standardSearchPromptText(state);
  const [text, setText] = useState(saved);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const changed = text !== saved;
  const invalid = !text.trim() || text.length > SEARCH_PROMPT_MAX_LENGTH;
  const disabled = busy || pending;
  useEffect(() => dirty(changed), [changed, dirty]);

  async function publish() {
    if (disabled || saving.current || !changed || invalid) return;
    saving.current = true;
    setPending(true);
    try {
      const ok = await save({ type: 'saveStandardSearchPrompt', text }, '표준 검색 프롬프트를 저장했습니다. AI 담당자의 프롬프트 복사에 반영됩니다.');
      if (ok) dirty(false);
    } finally { saving.current = false; setPending(false); }
  }

  return <form className="adm-list search-prompt-manager" aria-label="표준 검색 프롬프트 관리" onSubmit={event => { event.preventDefault(); void publish(); }}>
    <p className="adm-secondary">저장한 내용은 {bureau || '공용 업무'} AI 담당자의 표준 검색 프롬프트 버튼에서 복사됩니다.</p>
    <label htmlFor="standard-search-prompt-input">프롬프트 내용</label>
    <textarea id="standard-search-prompt-input" className="krds-input" rows={18} maxLength={SEARCH_PROMPT_MAX_LENGTH} value={text} disabled={disabled} aria-invalid={invalid} aria-describedby="search-prompt-count search-prompt-help" onChange={event => setText(event.target.value)} />
    <div id="search-prompt-count" className="search-prompt-count">{text.length.toLocaleString('ko-KR')} / {SEARCH_PROMPT_MAX_LENGTH.toLocaleString('ko-KR')}자</div>
    <p id="search-prompt-help" className="adm-secondary">{invalid ? '프롬프트 내용을 20,000자 이내로 입력해 주세요.' : '줄바꿈과 JSON 작성 안내를 포함해 입력한 내용 그대로 제공됩니다.'}</p>
    <footer>
      <div>{changed && <p className="adm-dirty is-dirty" role="status">미저장 변경 있음</p>}{state.standardSearchPrompt?.updatedAt && <p className="adm-secondary">마지막 저장 <time dateTime={state.standardSearchPrompt.updatedAt}>{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(state.standardSearchPrompt.updatedAt))}</time></p>}</div>
      <button type="submit" className="krds-btn medium ev-button primary" disabled={disabled || !changed || invalid}>{pending ? '저장 중…' : '표준 검색 프롬프트 저장'}</button>
    </footer>
  </form>;
}
