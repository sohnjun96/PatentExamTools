'use client';

import { useEffect, useRef, useState } from 'react';
import NoticeMarkdown from '@/app/components/notice-markdown';
import { NOTICE_MAX_LENGTH, type EvaluationAction, type EvaluationState } from '@/app/lib/evaluation';
import type { Bureau } from '@/app/lib/bureaus';
import './notice-manager.css';

type Props = {
  state: EvaluationState;
  bureau?: Bureau;
  busy: boolean;
  save: (action: EvaluationAction, message?: string) => Promise<boolean>;
  dirty: (value: boolean) => void;
};

const example = '## 공지 제목\n\n공지 내용을 입력하세요.';

export default function NoticeManager({ state, bureau, busy, save, dirty }: Props) {
  const saved = state.notice?.markdown || '';
  const [markdown, setMarkdown] = useState(saved);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const changed = markdown !== saved;
  const disabled = busy || pending;
  const scope = bureau || '공용 업무';
  useEffect(() => dirty(changed), [changed, dirty]);

  async function publish(value: string) {
    if (disabled || saving.current) return;
    saving.current = true;
    setPending(true);
    const canonical = value.trim();
    try {
      const ok = await save({ type: 'saveNotice', markdown: canonical }, canonical
        ? `${scope} 공지사항을 저장했습니다. 메인 페이지에서 확인할 수 있습니다.`
        : `${scope} 공지사항을 내렸습니다.`);
      if (ok) { setMarkdown(canonical); dirty(false); }
    } finally { saving.current = false; setPending(false); }
  }

  return <form className="notice-manager" onSubmit={(event) => {
    event.preventDefault();
    if (changed) void publish(markdown);
  }}>
    <div className="notice-manager-context">
      <div><strong>{scope} 메인 페이지 공지</strong></div>
      <span className="adm-pill">{saved ? '게시 중' : '게시된 공지 없음'}</span>
    </div>
    <div className="notice-manager-grid">
      <section className="notice-manager-panel" aria-labelledby="notice-edit-title">
        <div className="notice-manager-heading"><h2 id="notice-edit-title">공지 작성</h2><span>마크다운</span></div>
        <div className="notice-manager-body">
          <label htmlFor="notice-markdown-input">공지 내용</label>
          <textarea id="notice-markdown-input" className="krds-input notice-manager-input" rows={16} maxLength={NOTICE_MAX_LENGTH} value={markdown} disabled={disabled} aria-describedby="notice-markdown-help notice-markdown-count" placeholder={example} onChange={(event) => setMarkdown(event.target.value)} />
          <div id="notice-markdown-count" className="notice-manager-count">{markdown.length.toLocaleString('ko-KR')} / {NOTICE_MAX_LENGTH.toLocaleString('ko-KR')}자</div>
          <p id="notice-markdown-help" className="adm-secondary">내용을 비워 저장하면 공지가 내려갑니다.</p>
          <details className="notice-manager-help"><summary>마크다운 작성 방법</summary><ul><li><code>## 제목</code>으로 제목을 만듭니다.</li><li><code>**강조**</code>는 굵게, <code>- 항목</code>은 목록으로 표시합니다.</li><li><code>[링크 이름](https://주소)</code>로 링크를 넣습니다.</li><li>문단 사이는 한 줄을 비워 주세요. 표와 코드 블록도 사용할 수 있습니다.</li></ul></details>
        </div>
      </section>
      <section className="notice-manager-panel" aria-labelledby="notice-preview-title">
        <div className="notice-manager-heading"><h2 id="notice-preview-title">미리보기</h2><span>저장 전</span></div>
        <div className="notice-manager-body notice-manager-preview">{markdown.trim() ? <NoticeMarkdown markdown={markdown} /> : <p className="notice-manager-empty">작성 중인 공지 없음</p>}</div>
      </section>
    </div>
    <div className="notice-manager-footer">
      <div>{changed && <p className="adm-dirty is-dirty" role="status">미저장 변경 있음</p>}{state.notice?.updatedAt && <p className="adm-secondary">마지막 저장 <time dateTime={state.notice.updatedAt}>{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(state.notice.updatedAt))}</time></p>}</div>
      <div className="notice-manager-actions">
        {saved && <button type="button" className="krds-btn medium ev-button danger" disabled={disabled} onClick={() => {
          if (window.confirm(`${scope} 공지사항을 내리시겠습니까? 메인 페이지에서 공지가 사라집니다.`)) void publish('');
        }}>공지 내리기</button>}
        <button type="button" className="krds-btn medium ev-button" disabled={disabled || !changed} onClick={() => {
          if (window.confirm('작성 중인 변경을 버리고 저장된 공지로 되돌리시겠습니까?')) setMarkdown(saved);
        }}>변경 취소</button>
        <button type="submit" className="krds-btn medium ev-button primary" disabled={disabled || !changed}>{pending ? '저장 중…' : '공지사항 저장'}</button>
      </div>
    </div>
  </form>;
}
