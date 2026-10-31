'use client';

import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { createErrorToast, errorToastReducer, type ErrorToastInput } from '../lib/error-toasts';
import './error-toast.css';
import AppIcon from './app-icon';

type ErrorToastContextValue = { enabled: boolean; showError: (input: ErrorToastInput) => void };
const ErrorToastContext = createContext<ErrorToastContextValue | null>(null);
const inlineFeedback: ErrorToastContextValue = { enabled: false, showError: () => {} };

export function useErrorToast() {
  const context = useContext(ErrorToastContext);
  return context ?? inlineFeedback;
}

export function ErrorToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(errorToastReducer, []);
  const region = useRef<HTMLElement | null>(null);
  const showError = useCallback((input: ErrorToastInput) => {
    dispatch({ type: 'add', toast: createErrorToast(input) });
  }, []);
  const value = useMemo(() => ({ enabled: true, showError }), [showError]);

  return <ErrorToastContext.Provider value={value}>
    {children}
    {toasts.length > 0 && <section className="pd-error-toasts" aria-label="PDF 다운로드 오류 알림" ref={region} tabIndex={-1}>
      {toasts.map((toast) => <div className="pd-error-toast" role="alert" aria-atomic="true" key={toast.id}>
        <span className="pd-error-toast-icon"><AppIcon name="info-circle" size={24} /></span>
        <div className="pd-error-toast-copy">
          <strong>PDF를 받지 못했습니다.</strong>
          <p className="pd-error-toast-document">{toast.documentNumber} · {toast.documentKind}</p>
          <p>{toast.message}</p>
        </div>
        <button type="button" className="pd-error-toast-close" aria-label={`${toast.documentNumber} PDF 오류 알림 닫기`} onClick={(event) => {
          const restore = document.activeElement === event.currentTarget;
          dispatch({ type: 'dismiss', id: toast.id });
          if (restore && toast.returnFocus?.isConnected) toast.returnFocus.focus();
          else if (restore && toasts.length > 1) region.current?.focus();
        }}><AppIcon name="x" /></button>
      </div>)}
    </section>}
  </ErrorToastContext.Provider>;
}
