import { useEffect, useRef, useState } from 'react';
import { Modal, useIsTop } from './Modal';
import { ChipGroup } from './ChipGroup';
import { SHOT_LABELS, type ShotLabel } from '../lib/types';

export interface ShotItem {
  key: string | number;
  url: string;
  label: ShotLabel;
  caption: string | null;
}

/** Image waiting to be saved with a form (new trade / close dialog). */
export interface PendingShot extends ShotItem {
  blob: Blob;
}

/**
 * Default label after a paste: Exit when closing; when opening, Gamma if the last image
 * was Entry, otherwise Entry.
 */
export function defaultLabel(context: 'open' | 'close', items: ShotItem[]): ShotLabel {
  if (context === 'close') return 'Exit';
  return items[items.length - 1]?.label === 'Entry' ? 'Gamma' : 'Entry';
}

export function imagesFromClipboard(e: ClipboardEvent): File[] {
  const out: File[] = [];
  for (const item of Array.from(e.clipboardData?.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}

interface Props {
  items: ShotItem[];
  context: 'open' | 'close';
  onAdd: (blob: Blob, label: ShotLabel, caption: string) => void | Promise<void>;
  onDelete: (item: ShotItem) => void | Promise<void>;
  /** Labels added earlier in this dialog that aren't in `items` yet (for the default-label rule). */
  extraHistory?: ShotItem[];
  compact?: boolean;
}

/**
 * Screenshots grid with paste (Cmd/Ctrl+V anywhere in the enclosing dialog),
 * drag-and-drop and a file picker. Each new image goes through a quick label picker.
 */
export function Screenshots({ items, context, onAdd, onDelete, extraHistory = [], compact }: Props) {
  const isTop = useIsTop();
  const [queue, setQueue] = useState<Blob[]>([]);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Paste anywhere while this component's dialog is the top-most one.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!isTop()) return;
      const imgs = imagesFromClipboard(e);
      if (!imgs.length) return; // let text paste through
      e.preventDefault();
      setQueue((q) => [...q, ...imgs]);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [isTop]);

  const addFiles = (files: FileList | File[] | null) => {
    const imgs = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'));
    if (imgs.length) setQueue((q) => [...q, ...imgs]);
  };

  const history = [...items, ...extraHistory];

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDrag(true);
        }
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        addFiles(e.dataTransfer.files);
      }}
      className={`rounded-lg border border-dashed p-3 transition-colors ${drag ? 'border-sky-500 bg-sky-500/10' : 'border-zinc-700'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-zinc-400">
          Screenshots{items.length ? ` (${items.length})` : ''} ·{' '}
          <span className="text-zinc-500">paste, drop or</span>{' '}
          <button type="button" tabIndex={-1} className="text-sky-400 hover:underline" onClick={() => fileInput.current?.click()}>
            choose file
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {items.length > 0 && (
        <div className={`mt-2 grid gap-2 ${compact ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-4'}`}>
          {items.map((s, i) => (
            <div key={s.key} className="group relative overflow-hidden rounded border border-zinc-800 bg-zinc-950">
              <button type="button" tabIndex={-1} className="block w-full" onClick={() => setLightbox(i)} title="Open full size">
                <img src={s.url} alt={s.caption ?? s.label} className="h-20 w-full object-cover" />
              </button>
              <div className="flex items-center justify-between gap-1 px-1.5 py-1 text-[11px]">
                <span className="truncate">
                  <span className="font-medium text-zinc-300">{s.label}</span>
                  {s.caption && <span className="text-zinc-500"> · {s.caption}</span>}
                </span>
                <button
                  type="button"
                  tabIndex={-1}
                  className="text-zinc-600 hover:text-red-400"
                  title="Delete image"
                  onClick={() => {
                    if (confirm('Delete this image?')) onDelete(s);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {queue.length > 0 && (
        <LabelPicker
          key={queue.length}
          blob={queue[0]}
          initial={defaultLabel(context, history)}
          remaining={queue.length - 1}
          onCancel={() => setQueue((q) => q.slice(1))}
          onPick={async (label, caption) => {
            const blob = queue[0];
            setQueue((q) => q.slice(1));
            await onAdd(blob, label, caption);
          }}
        />
      )}
      {lightbox != null && items[lightbox] && (
        <Lightbox items={items} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

function LabelPicker({
  blob,
  initial,
  remaining,
  onPick,
  onCancel,
}: {
  blob: Blob;
  initial: ShotLabel;
  remaining: number;
  onPick: (l: ShotLabel, caption: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState<ShotLabel>(initial);
  const [caption, setCaption] = useState('');
  const [url] = useState(() => URL.createObjectURL(blob));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <Modal onClose={onCancel} title="Label this screenshot" width="max-w-md">
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          onPick(label, caption.trim());
        }}
        onKeyDown={(e) => {
          // 1-4 pick a label when not typing a caption.
          const n = Number(e.key);
          if (!e.metaKey && !e.ctrlKey && n >= 1 && n <= 4 && (e.target as HTMLElement).tagName !== 'INPUT') {
            setLabel(SHOT_LABELS[n - 1]);
          }
        }}
      >
        <img src={url} alt="" className="max-h-48 w-full rounded border border-zinc-800 object-contain" />
        <ChipGroup options={SHOT_LABELS} value={label} onChange={(v) => v && setLabel(v)} ariaLabel="Label" />
        <input
          autoFocus
          className="w-full"
          placeholder="Optional caption — Enter to save"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onKeyDown={(e) => {
            // Quick label switching with Alt+1..4 while in the caption field.
            const n = Number(e.key);
            if (e.altKey && n >= 1 && n <= 4) {
              e.preventDefault();
              setLabel(SHOT_LABELS[n - 1]);
            }
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            {remaining > 0 ? `${remaining} more after this · ` : ''}Enter save · Esc discard
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onCancel}>
              Discard
            </button>
            <button type="submit" className="btn btn-primary">
              Add
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function Lightbox({ items, index, onIndex, onClose }: { items: ShotItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const s = items[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onIndex((index + 1) % items.length);
      if (e.key === 'ArrowLeft') onIndex((index - 1 + items.length) % items.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndex]);

  return (
    <Modal onClose={onClose} dismissOnBackdrop bare>
      <div className="flex min-h-[80vh] flex-col items-center justify-center gap-2" onClick={onClose}>
        <img src={s.url} alt={s.caption ?? s.label} className="max-h-[85vh] max-w-[92vw] rounded shadow-2xl" onClick={(e) => e.stopPropagation()} />
        <div className="text-sm text-zinc-300">
          <span className="font-medium">{s.label}</span>
          {s.caption && <span className="text-zinc-400"> · {s.caption}</span>}
          <span className="ml-3 text-xs text-zinc-500">
            {index + 1}/{items.length} · ← → · Esc
          </span>
        </div>
      </div>
    </Modal>
  );
}

/** Hook for forms that hold screenshots locally until the trade is saved. */
export function usePendingShots() {
  const [pending, setPending] = useState<PendingShot[]>([]);
  useEffect(() => () => pending.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    pending,
    add: (blob: Blob, label: ShotLabel, caption: string) =>
      setPending((p) => [...p, { key: `p${Date.now()}${Math.random()}`, blob, url: URL.createObjectURL(blob), label, caption: caption || null }]),
    remove: (item: ShotItem) => setPending((p) => p.filter((x) => x.key !== item.key)),
  };
}
