'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const layers: HTMLElement[] = [];
let scrollLocks = 0;
let originalOverflow = '';

export function useModalBehavior<T extends HTMLElement>(
  onClose: () => void,
  { active = true, lockScroll = true, trapFocus = true }: { active?: boolean; lockScroll?: boolean; trapFocus?: boolean } = {},
) {
  const containerRef = useRef<T>(null);
  const closeRef = useRef(onClose);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const root = container;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    layers.push(root);
    if (lockScroll) {
      if (scrollLocks++ === 0) originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    const focusable = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((node) => node.getClientRects().length > 0);
    const frame = window.requestAnimationFrame(() => { if (layers.at(-1) === root) (focusable()[0] ?? root).focus(); });

    function handleKeyDown(event: KeyboardEvent) {
      if (layers.at(-1) !== root) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !trapFocus) return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!root.contains(document.activeElement) || document.activeElement === root) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.cancelAnimationFrame(frame);
      const index = layers.indexOf(root);
      const wasTop = index === layers.length - 1;
      if (index >= 0) layers.splice(index, 1);
      if (lockScroll && --scrollLocks === 0) document.body.style.overflow = originalOverflow;
      if (wasTop && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [active, lockScroll, trapFocus]);

  return containerRef;
}
