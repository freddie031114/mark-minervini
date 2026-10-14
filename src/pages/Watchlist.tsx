import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useJournal } from '../lib/store';
import { subscribeWatchlist, watchlistApi } from '../lib/watchlistApi';
import {
  daysUntil, earningsSoon, formatLevels, gexDue, marketToday, parseLevels, relDays, shortDate, sortLevels, sortWatchlist,
  type WatchItem,
} from '../lib/watchlist';

type Field = 'ticker' | 'levels' | 'gex' | 'earnings';

export function Watchlist() {
  const { user } = useJournal();
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<{ id: string; field: Field } | null>(null);
  const [today, setToday] = useState(marketToday);

  useEffect(
    () =>
      subscribeWatchlist(
        (i) => {
          setItems(i);
          setLoaded(true);
        },
        (e) => setError(e.message),
      ),
    [user.uid],
  );
  // Keep "today" (US market date) correct if the app stays open across midnight New York time.
  useEffect(() => {
    const t = setInterval(() => setToday(marketToday()), 60_000);
    return () => clearInterval(t);
  }, []);

  const active = useMemo(() => sortWatchlist(items.filter((i) => !i.archived)), [items]);
  const archived = useMemo(() => sortWatchlist(items.filter((i) => i.archived)), [items]);

  async function quickAdd(ticker: string) {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    const existing = items.find((i) => i.ticker === t);
    if (existing) {
      if (existing.archived) await watchlistApi.archive(existing.id, false);
      setEditing({ id: existing.id, field: 'levels' });
      return;
    }
    const id = await watchlistApi.add(t);
    setEditing({ id, field: 'levels' });
  }

  if (error) return <div className="text-sm text-red-400">Couldn't load the watchlist: {error}</div>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-zinc-100">
          Watchlist <span className="ml-1 text-sm font-normal text-zinc-500">{active.length}</span>
        </h1>
        <QuickAdd onAdd={quickAdd} />
        <span className="ml-auto text-xs text-zinc-500" title="Dates are US market dates (New York)">
          US market date: {shortDate(today)}
        </span>
      </div>

      {!loaded ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : active.length === 0 ? (
        <div className="card p-10 text-center text-sm text-zinc-500">No tickers on the watchlist. Type one above and press Enter.</div>
      ) : (
        <Table>
          {active.map((i) => (
            <Row key={i.id} item={i} today={today} editing={editing} setEditing={setEditing} />
          ))}
        </Table>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        Click a cell (or <span className="kbd">Tab</span> to it and press <span className="kbd">↵</span>) to edit · <span className="kbd">↵</span> save ·{' '}
        <span className="kbd">Esc</span> cancel · Levels: <span className="text-zinc-400">R 265-266 · S 248.5-250 (note) · S 236</span>
      </p>

      {archived.length > 0 && (
        <div className="mt-6">
          <button className="text-xs text-zinc-500 hover:text-zinc-300" onClick={() => setShowArchived((s) => !s)}>
            {showArchived ? '▾' : '▸'} Archived ({archived.length})
          </button>
          {showArchived && (
            <div className="mt-2 opacity-60">
              <Table>
                {archived.map((i) => (
                  <Row key={i.id} item={i} today={today} editing={editing} setEditing={setEditing} />
                ))}
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Table({ children }: { children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-zinc-800">
          <tr>
            <th className="th w-28">Ticker</th>
            <th className="th">Levels</th>
            <th className="th w-56">GEX recheck</th>
            <th className="th w-40">Earnings</th>
            <th className="th w-20" />
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (t: string) => void }) {
  const [v, setV] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(v);
        setV('');
      }}
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value.toUpperCase())}
        placeholder="+ Add ticker ↵"
        aria-label="Add ticker"
        className="w-36 font-medium uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal"
        spellCheck={false}
        autoComplete="off"
      />
    </form>
  );
}

interface RowProps {
  item: WatchItem;
  today: string;
  editing: { id: string; field: Field } | null;
  setEditing: (e: { id: string; field: Field } | null) => void;
}

function Row({ item, today, editing, setEditing }: RowProps) {
  const due = gexDue(item, today);
  const soon = earningsSoon(item, today);
  const flagged = !item.archived && (due || soon);
  const isEditing = (f: Field) => editing?.id === item.id && editing.field === f;
  const edit = (f: Field) => setEditing({ id: item.id, field: f });
  const done = () => setEditing(null);
  const save = (patch: Partial<WatchItem>) => {
    watchlistApi.update(item.id, patch);
    done();
  };
  const eDays = daysUntil(item.earnings_date, today);
  const gDays = daysUntil(item.gex_date, today);

  return (
    <tr
      data-ticker={item.ticker}
      className={`border-b border-zinc-800/60 align-top last:border-0 ${flagged ? 'bg-amber-500/[0.07] shadow-[inset_3px_0_0_0] shadow-amber-500' : ''}`}
    >
      <td className="td">
        <Cell editing={isEditing('ticker')} onEdit={() => edit('ticker')} label="ticker">
          {isEditing('ticker') ? (
            <TextEditor
              initial={item.ticker}
              upper
              onSave={(v) => (v.trim() ? save({ ticker: v.trim().toUpperCase() }) : done())}
              onCancel={done}
            />
          ) : (
            <span className={`font-semibold ${flagged ? 'text-amber-200' : 'text-zinc-100'}`}>{item.ticker}</span>
          )}
        </Cell>
      </td>

      <td className="td whitespace-normal">
        <Cell editing={isEditing('levels')} onEdit={() => edit('levels')} label="levels">
          {isEditing('levels') ? (
            <LevelsEditor item={item} onSave={(levels) => save({ levels })} onCancel={done} />
          ) : item.levels.length ? (
            <Levels item={item} />
          ) : (
            <span className="text-zinc-600">add levels</span>
          )}
        </Cell>
      </td>

      <td className="td">
        <Cell editing={isEditing('gex')} onEdit={() => edit('gex')} label="GEX recheck">
          {isEditing('gex') ? (
            <GexEditor item={item} onSave={save} onCancel={done} />
          ) : (
            <div>
              {item.gex_date ? (
                <span className="text-zinc-200">
                  {shortDate(item.gex_date)}{' '}
                  {due ? (
                    <Badge tone="red">{gDays === 0 ? 'recheck today' : `overdue ${-gDays!}d`}</Badge>
                  ) : (
                    <span className="text-xs text-zinc-500">{relDays(gDays!)}</span>
                  )}
                </span>
              ) : !item.gex_note ? (
                <span className="text-zinc-600">set date</span>
              ) : null}
              {item.gex_note && <div className={`text-xs ${item.gex_date ? 'text-zinc-500' : 'italic text-zinc-300'}`}>{item.gex_note}</div>}
            </div>
          )}
        </Cell>
      </td>

      <td className="td">
        <Cell editing={isEditing('earnings')} onEdit={() => edit('earnings')} label="earnings">
          {isEditing('earnings') ? (
            <DateEditor initial={item.earnings_date} onSave={(d) => save({ earnings_date: d })} onCancel={done} />
          ) : item.earnings_date ? (
            <span className="text-zinc-200">
              {shortDate(item.earnings_date)}{' '}
              {soon ? (
                <Badge tone="amber">{eDays === 0 ? 'today' : `${eDays}d`}</Badge>
              ) : (
                <span className="text-xs text-zinc-500">{eDays! < 0 ? `reported ${-eDays!}d ago` : `${eDays}d`}</span>
              )}
            </span>
          ) : (
            <span className="text-zinc-600">set date</span>
          )}
        </Cell>
      </td>

      <td className="td text-right">
        <button
          className="text-xs text-zinc-500 hover:text-zinc-200"
          onClick={() => watchlistApi.archive(item.id, !item.archived)}
          title={item.archived ? 'Move back to the watchlist' : 'Hide from the watchlist (kept in Archived)'}
        >
          {item.archived ? 'Restore' : 'Archive'}
        </button>
      </td>
    </tr>
  );
}

const Badge = ({ tone, children }: { tone: 'red' | 'amber'; children: ReactNode }) => (
  <span
    className={`ml-1 rounded px-1.5 py-0.5 text-xs font-semibold ${tone === 'red' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}
  >
    {children}
  </span>
);

function Levels({ item }: { item: WatchItem }) {
  return (
    <span title={formatLevels(item.levels)}>
      {sortLevels(item.levels).map((l, i) => (
        <span key={i}>
          {i > 0 && <span className="text-zinc-600"> · </span>}
          <span className={l.kind === 'R' ? 'text-red-300' : 'text-emerald-300'}>
            {l.kind} {l.price}
          </span>
          {l.note && <span className="text-xs text-zinc-500"> ({l.note})</span>}
        </span>
      ))}
    </span>
  );
}

/** Display ↔ editor switch. The display is a focusable button so cells are reachable by keyboard. */
function Cell({ editing, onEdit, label, children }: { editing: boolean; onEdit: () => void; label: string; children: ReactNode }) {
  if (editing) return <>{children}</>;
  return (
    <button type="button" className="-mx-1 block w-full rounded px-1 text-left hover:bg-zinc-800/60" onClick={onEdit} aria-label={`Edit ${label}`}>
      {children}
    </button>
  );
}

/** Shared editor keys: Enter saves, Esc cancels (without closing anything else). */
function editorKeys(save: () => void, cancel: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };
}

/** Saves when focus leaves the editor (click elsewhere / Tab away). */
function useBlurSave(save: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const onBlur = (e: React.FocusEvent) => {
    if (!ref.current?.contains(e.relatedTarget as Node)) saveRef.current();
  };
  return { ref, onBlur };
}

function TextEditor({ initial, upper, onSave, onCancel }: { initial: string; upper?: boolean; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const blur = useBlurSave(() => onSave(v));
  return (
    <div {...blur}>
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(upper ? e.target.value.toUpperCase() : e.target.value)}
        onKeyDown={editorKeys(() => onSave(v), onCancel)}
        className="w-24 font-semibold uppercase"
      />
    </div>
  );
}

function LevelsEditor({ item, onSave, onCancel }: { item: WatchItem; onSave: (l: WatchItem['levels']) => void; onCancel: () => void }) {
  const [v, setV] = useState(formatLevels(item.levels));
  const [err, setErr] = useState<string | null>(null);
  const commit = () => {
    const r = parseLevels(v);
    if ('error' in r) return setErr(r.error);
    onSave(r.levels);
  };
  const blur = useBlurSave(() => {
    // Leaving with an invalid entry keeps the old levels rather than losing them.
    const r = parseLevels(v);
    if ('error' in r) onCancel();
    else onSave(r.levels);
  });
  return (
    <div {...blur}>
      <input
        autoFocus
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          setErr(null);
        }}
        onKeyDown={editorKeys(commit, onCancel)}
        placeholder="R 265-266 · S 248.5-250 · S 236"
        aria-invalid={!!err}
        className={`w-full ${err ? 'border-red-500' : ''}`}
        spellCheck={false}
      />
      {err && <div className="err">{err}</div>}
    </div>
  );
}

function DateEditor({ initial, onSave, onCancel }: { initial: string | null; onSave: (d: string | null) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial ?? '');
  const blur = useBlurSave(() => onSave(v || null));
  return (
    <div {...blur} className="flex items-center gap-1">
      <input autoFocus type="date" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={editorKeys(() => onSave(v || null), onCancel)} />
      {v && (
        <button type="button" className="text-xs text-zinc-500 hover:text-red-400" onClick={() => onSave(null)} title="Clear date">
          ✕
        </button>
      )}
    </div>
  );
}

function GexEditor({ item, onSave, onCancel }: { item: WatchItem; onSave: (p: Partial<WatchItem>) => void; onCancel: () => void }) {
  const [date, setDate] = useState(item.gex_date ?? '');
  const [note, setNote] = useState(item.gex_note ?? '');
  const commit = () => onSave({ gex_date: date || null, gex_note: note.trim() || null });
  const blur = useBlurSave(commit);
  const keys = editorKeys(commit, onCancel);
  return (
    <div {...blur} className="space-y-1">
      <div className="flex items-center gap-1">
        <input autoFocus type="date" value={date} onChange={(e) => setDate(e.target.value)} onKeyDown={keys} aria-label="GEX recheck date" />
        {date && (
          <button type="button" className="text-xs text-zinc-500 hover:text-red-400" onClick={() => setDate('')} title="Clear date">
            ✕
          </button>
        )}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={keys}
        placeholder="note, e.g. after monthly expiry"
        aria-label="GEX note"
        className="w-full text-xs"
      />
    </div>
  );
}
