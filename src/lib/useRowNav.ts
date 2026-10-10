import { useEffect, useState } from 'react';
import { anyModalOpen } from '../components/Modal';
import { isTyping } from './format';

/**
 * Keyboard row selection for a table: ↑/↓ (or j/k) move, Enter opens.
 * `onKey` receives other single-letter keys with the selected row (e.g. C to close).
 */
export function useRowNav<T>(rows: T[], onOpen: (row: T) => void, onKey?: (key: string, row: T) => boolean | void) {
  const [sel, setSel] = useState(-1);
  useEffect(() => {
    if (sel >= rows.length) setSel(rows.length - 1);
  }, [rows.length, sel]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e) || anyModalOpen() || !rows.length) return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, rows.length - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
      } else if (e.key === 'Enter' && sel >= 0 && (e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'A') {
        e.preventDefault();
        onOpen(rows[sel]);
      } else if (onKey && sel >= 0 && e.key.length === 1) {
        // Swallow the key so it isn't typed into a dialog's autofocused input.
        if (onKey(e.key.toLowerCase(), rows[sel])) e.preventDefault();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [rows, sel, onOpen, onKey]);

  useEffect(() => {
    if (sel >= 0) document.querySelector(`[data-row="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  return [sel, setSel] as const;
}
