export const MAX_ERROR_TOASTS = 3;
export type ErrorToast = {
  id: number;
  documentNumber: string;
  documentKind: string;
  message: string;
  returnFocus?: HTMLElement | null;
};
export type ErrorToastInput = Omit<ErrorToast, 'id'>;
let occurrence = 0;

/** Every failure is a new occurrence, including an identical failed retry. */
export function createErrorToast(input: ErrorToastInput): ErrorToast {
  return { ...input, id: ++occurrence };
}
export function errorToastReducer(state: ErrorToast[], action: { type: 'add'; toast: ErrorToast } | { type: 'dismiss'; id: number }): ErrorToast[] {
  if (action.type === 'dismiss') return state.filter((toast) => toast.id !== action.id);
  return [...state, action.toast].slice(-MAX_ERROR_TOASTS);
}
