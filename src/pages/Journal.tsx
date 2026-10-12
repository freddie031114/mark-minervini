import { useMemo, useState } from 'react';
import { useJournal } from '../lib/store';
import { derive, type Derived } from '../lib/derive';
import { money, num, pct, pnlClass, rFmt } from '../lib/format';
import { useRowNav } from '../lib/useRowNav';
import { GRADES, type Trade } from '../lib/types';
import { DemoBadge } from './Home';

type Row = { t: Trade; d: Derived };
type SortKey = 'exit_date' | 'entry_date' | 'ticker' | 'structure' | 'setup_tag' | 'grade' | 'pnl' | 'pnlPct' | 'r' | 'days';

const COLS: { key: SortKey | null; label: string; right?: boolean }[] = [
  { key: 'exit_date', label: 'Closed' },
  { key: 'ticker', label: 'Ticker' },
  { key: 'structure', label: 'Structure' },
  { key: 'setup_tag', label: 'Setup' },
  { key: 'grade', label: 'Grade' },
  { key: null, label: 'P/I' },
  { key: null, label: 'Entry → Exit', right: true },
  { key: 'pnl', label: 'P&L', right: true },
  { key: 'pnlPct', label: 'P&L %', right: true },
  { key: 'r', label: 'R', right: true },
  { key: 'days', label: 'Days', right: true },
];

const val = (r: Row, k: SortKey): string | number | null => {
  if (k === 'pnl' || k === 'pnlPct' || k === 'r' || k === 'days') return r.d[k];
  return r.t[k];
};

const EMPTY = { q: '', setup: '', grade: '', outcome: '', planned: '', from: '', to: '' };

export function Journal() {
  const { trades, tags, openDetail } = useJournal();
  const [flt, setFlt] = useState(EMPTY);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'exit_date', dir: -1 });
  const set = (k: keyof typeof EMPTY, v: string) => setFlt((f) => ({ ...f, [k]: v }));

  const rows = useMemo(() => {
    const q = flt.q.trim().toUpperCase();
    const out: Row[] = trades
      .filter((t) => t.status === 'closed')
      .map((t) => ({ t, d: derive(t) }))
      .filter(({ t, d }) => {
        if (q && !t.ticker.includes(q)) return false;
        if (flt.setup && (t.setup_tag ?? '(none)') !== flt.setup) return false;
        if (flt.grade && (t.grade ?? '(none)') !== flt.grade) return false;
        if (flt.outcome && d.outcome !== flt.outcome) return false;
        if (flt.planned === 'Planned' && t.planned !== true) return false;
        if (flt.planned === 'Impulse' && t.planned !== false) return false;
        if (flt.from && (t.exit_date ?? '') < flt.from) return false;
        if (flt.to && (t.exit_date ?? '') > flt.to) return false;
        return true;
      });
    out.sort((a, b) => {
      const x = val(a, sort.key);
      const y = val(b, sort.key);
      if (x == null && y == null) return 0;
      if (x == null) return 1; // blanks last
      if (y == null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
    return out;
  }, [trades, flt, sort]);

  const [sel, setSel] = useRowNav(rows, (r) => openDetail(r.t.id));
  const active = Object.values(flt).some(Boolean);

  const total = useMemo(() => rows.reduce((a, r) => a + (r.d.pnl ?? 0), 0), [rows]);

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-zinc-100">
        Journal <span className="ml-1 text-sm font-normal text-zinc-500">{rows.length} closed</span>
      </h1>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <input
          data-search
          className="w-36"
          placeholder="Ticker  ( / )"
          value={flt.q}
          onChange={(e) => set('q', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
        />
        <Select value={flt.setup} onChange={(v) => set('setup', v)} placeholder="All setups" options={[...tags, '(none)']} />
        <Select value={flt.grade} onChange={(v) => set('grade', v)} placeholder="All grades" options={[...GRADES, '(none)']} />
        <Select value={flt.outcome} onChange={(v) => set('outcome', v)} placeholder="All outcomes" options={['Win', 'Loss', 'Breakeven']} />
        <Select value={flt.planned} onChange={(v) => set('planned', v)} placeholder="Planned + impulse" options={['Planned', 'Impulse']} />
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          From <input type="date" value={flt.from} onChange={(e) => set('from', e.target.value)} />
        </label>
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          To <input type="date" value={flt.to} onChange={(e) => set('to', e.target.value)} />
        </label>
        {active && (
          <button className="btn text-xs" onClick={() => setFlt(EMPTY)}>
            Clear
          </button>
        )}
        <div className="ml-auto text-sm text-zinc-400">
          Total <span className={pnlClass(total)}>{money(total, true)}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-zinc-500">{active ? 'No trades match these filters.' : 'No closed trades yet.'}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr>
                {COLS.map((c) => (
                  <th key={c.label} className={`th ${c.right ? 'text-right' : ''}`}>
                    {c.key ? (
                      <button
                        className="uppercase hover:text-zinc-200"
                        onClick={() => setSort((s) => (s.key === c.key ? { key: c.key!, dir: (s.dir * -1) as 1 | -1 } : { key: c.key!, dir: -1 }))}
                      >
                        {c.label}
                        {sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, d }, i) => (
                <tr
                  key={t.id}
                  data-row={i}
                  onClick={() => {
                    setSel(i);
                    openDetail(t.id);
                  }}
                  className={`cursor-pointer border-b border-zinc-800/60 last:border-0 ${i === sel ? 'bg-sky-500/10 outline outline-1 -outline-offset-1 outline-sky-500/50' : 'hover:bg-zinc-800/40'}`}
                >
                  <td className="td text-zinc-400">{t.exit_date}</td>
                  <td className="td font-medium text-zinc-100">
                    {t.ticker}
                    {t.is_demo && <DemoBadge />}
                  </td>
                  <td className="td text-zinc-300">
                    {t.structure}
                    {t.legs && <span className="text-zinc-500"> {t.legs}</span>}
                  </td>
                  <td className="td text-zinc-300">{t.setup_tag ?? ''}</td>
                  <td className="td">{t.grade ?? ''}</td>
                  <td className="td text-zinc-400">{t.planned == null ? '' : t.planned ? 'P' : <span className="text-amber-400">I</span>}</td>
                  <td className="td text-right text-zinc-400">
                    {num(t.entry_price, 4)} → {num(t.exit_price, 4)}
                  </td>
                  <td className={`td text-right font-medium ${pnlClass(d.pnl)}`}>{money(d.pnl, true)}</td>
                  <td className={`td text-right ${pnlClass(d.pnlPct)}`}>{pct(d.pnlPct)}</td>
                  <td className={`td text-right ${pnlClass(d.r)}`}>{rFmt(d.r)}</td>
                  <td className="td text-right text-zinc-400">{d.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Select({ value, onChange, placeholder, options }: { value: string; onChange: (v: string) => void; placeholder: string; options: readonly string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={value ? 'border-sky-600' : 'text-zinc-400'}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
