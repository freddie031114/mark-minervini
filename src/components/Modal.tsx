import { createPortal } from 'react-dom';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// A simple stack so only the top-most dialog reacts to Esc / paste / shortcuts.
const stack: number[] = [];
let nextId = 1;
export const anyModalOpen = () => stack.length > 0;

const ModalCtx = createContext<{ isTop: () => boolean }>({ isTop: () => stack.length === 0 });
/** Whether the dialog this component lives in is the top-most one (or no dialog at all). */
export const useIsTop = () => useContext(ModalCtx).isTop;

interface Props {
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  width?: string;
  dismissOnBackdrop?: boolean;
  bare?: boolean;
}

export function Modal({ onClose, children, title, width = 'max-w-2xl', dismissOnBackdrop = false, bare = false }: Props) {
  const [id] = useState(() => nextId++);
  // Captured during the first render, before any autoFocus child steals focus.
  const [prevFocus] = useState(() => document.activeElement as HTMLElement | null);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    stack.push(id);
    // Focus the dialog unless a child already took focus (autoFocus).
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === id) {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus();
    };
  }, [id, prevFocus]);

  const isTop = () => stack[stack.length - 1] === id;

  // Portal to <body>. React events still bubble through the component tree, so stop
  // submits here to keep a nested dialog's form from submitting the parent's form.
  return createPortal(
    <ModalCtx.Provider value={{ isTop }}>
      <div
        className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
        onMouseDown={(e) => {
          if (dismissOnBackdrop && e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={panel}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          onSubmit={(e) => e.stopPropagation()}
          className={bare ? 'outline-none' : `w-full ${width} rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl outline-none`}
        >
          {title != null && (
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
              <div className="text-base font-semibold text-zinc-100">{title}</div>
              <button className="text-zinc-500 hover:text-zinc-200 text-sm" onClick={onClose} title="Close (Esc)">
                Esc ✕
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </ModalCtx.Provider>,
    document.body,
  );
}
