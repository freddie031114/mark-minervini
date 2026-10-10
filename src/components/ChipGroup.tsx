import { useRef, type KeyboardEvent } from 'react';

interface Props<T extends string> {
  options: readonly T[];
  value: T | null | undefined;
  onChange: (v: T | null) => void;
  /** Allow clearing (click the selected chip again, or Backspace/Delete). */
  allowNone?: boolean;
  labels?: Partial<Record<T, string>>;
  ariaLabel?: string;
  size?: 'sm' | 'md';
  tone?: (v: T) => string | undefined;
}

/**
 * A row of single-select chips that behaves like a radio group:
 * one Tab stop, arrow keys move + select, Space/Enter selects, Backspace clears.
 */
export function ChipGroup<T extends string>({ options, value, onChange, allowNone, labels, ariaLabel, size = 'md', tone }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const sel = value == null ? -1 : options.indexOf(value);
  const tabIdx = sel >= 0 ? sel : 0;

  const onKey = (e: KeyboardEvent, i: number) => {
    let n = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + options.length) % options.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = options.length - 1;
    else if ((e.key === 'Backspace' || e.key === 'Delete') && allowNone) {
      e.preventDefault();
      onChange(null);
      return;
    } else if (e.key === ' ' || (e.key === 'Enter' && !e.metaKey && !e.ctrlKey)) {
      e.preventDefault();
      onChange(allowNone && options[i] === value ? null : options[i]);
      return;
    }
    if (n >= 0) {
      e.preventDefault();
      refs.current[n]?.focus();
      onChange(options[n]);
    }
  };

  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((o, i) => {
        const on = o === value;
        return (
          <button
            key={o}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === tabIdx ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(allowNone && on ? null : o)}
            className={`rounded-full border ${pad} transition-colors ${
              on
                ? tone?.(o) ?? 'border-sky-500 bg-sky-500/20 text-sky-200'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
            }`}
          >
            {labels?.[o] ?? o}
          </button>
        );
      })}
    </div>
  );
}
