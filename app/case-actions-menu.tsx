'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModalBehavior } from '@/app/lib/use-modal-behavior';

/** A bounded desktop popover and a scrollable mobile bottom sheet. */
export default function CaseActionsMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 80, right: 16 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const dialogRef = useModalBehavior<HTMLElement>(close, { active: open });

  const position = useCallback(() => {
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setAnchor({
      top: Math.max(16, Math.min(bounds.bottom + 8, window.innerHeight - 160)),
      right: Math.max(16, window.innerWidth - bounds.right),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', position);
    return () => window.removeEventListener('resize', position);
  }, [open, position]);

  const style = {
    '--case-actions-top': `${anchor.top}px`,
    '--case-actions-right': `${anchor.right}px`,
  } as CSSProperties;

  return <div className="case-actions-menu">
    <button ref={triggerRef} className="case-actions-trigger" type="button" aria-label="사건 작업 더보기"
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? 'case-actions-dialog' : undefined}
      onClick={() => { position(); setOpen((current) => !current); }}>⋮</button>
    {open && createPortal(
      <div className="case-actions-backdrop" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
        <section ref={dialogRef} id="case-actions-dialog" className="case-actions-dialog" style={style}
          role="dialog" aria-modal="true" aria-labelledby="case-actions-title" tabIndex={-1}>
          <header><h2 id="case-actions-title">사건 작업</h2><button type="button" onClick={close} aria-label="사건 작업 닫기">닫기 ×</button></header>
          <div className="case-actions-content" onClick={(event) => {
            const button = event.target instanceof Element ? event.target.closest('button') : null;
            if (button && !button.disabled) close();
          }}>{children}</div>
        </section>
      </div>, document.body,
    )}
  </div>;
}
