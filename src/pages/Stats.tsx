import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useJournal } from '../lib/store';
import { derive } from '../lib/derive';
import { breakdown, equityCurve, summarize, type Summary } from '../lib/calc';
import { money, pct, pnlClass } from '../lib/format';
import { EMOTIONS, GRADES, THESIS_RIGHT, type Trade } from '../lib/types';

const SMALL = 10;
type Item = { t: Trade; pnl: number };

export function Stats() {
  const { trades, tags } = useJournal();

  const items: Item[] = useMemo(
    () =>
      trades
        .filter((t) => t.status === 'closed')
        .map((t) => ({ t, pnl: derive(t).pnl ?? 0 })),
    [trades],
  );
  const s = useMemo(() => summarize(items.map((i) => i.pnl)), [items]);
  const curve = useMemo(() => equityCurve(items.map((i) => ({ date: i.t.exit_date!, pnl: i.pnl }))), [items]);
  const fmt = (n: number | null) => money(n, true);
  const yesNo = (v: boolean | null, y: string, n: string) => (v == null ? null : v ? y : n);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-zinc-100">
        Stats <span className="ml-1 text-sm font-normal text-zinc-500">{s.count} closed trades</span>
      </h1>

      {s.count === 0 ? (
        <div className="card p-10 text-center text-sm text-zinc-500">No closed trades yet.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Total P&L" value={fmt(s.totalPnl)} cls={pnlClass(s.totalPnl)} />
            <Tile label="Win rate" value={pct(s.winRate, 0).replace('+', '')} sub={`${s.wins}W / ${s.losses}L`} />
            <Tile label="Average win" value={fmt(s.avgWin)} cls={pnlClass(s.avgWin)} />
            <Tile label="Average loss" value={fmt(s.avgLoss)} cls={pnlClass(s.avgLoss)} />
            <Tile label="Expectancy / trade" value={fmt(s.expectancy)} cls={pnlClass(s.expectancy)} />
            <Tile label="Profit factor" value={s.profitFactor == null ? '—' : Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'} />
          </div>
          {s.count < SMALL && <SmallNote />}

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-medium text-zinc-300">Equity curve · cumulative P&amp;L</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curve} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#3f3f46' }} minTickGap={40} />
                  <YAxis
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                    tickFormatter={(v: number) => money(v).replace(/\.\d+$/, '')}
                  />
                  <ReferenceLine y={0} stroke="#52525b" />
                  <Tooltip
                    cursor={{ stroke: '#52525b' }}
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: '#a1a1aa' }}
                    formatter={(v: number, name: string) => [fmt(v), name === 'equity' ? 'Equity' : 'Trade']}
                  />
                  <Line type="linear" dataKey="equity" stroke="#38bdf8" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: '#18181b', strokeWidth: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Breakdown title="By setup" items={items} keyOf={(t) => t.setup_tag} order={tags} />
            <Breakdown title="By grade" items={items} keyOf={(t) => t.grade} order={[...GRADES]} />
            <Breakdown title="Planned vs impulse" items={items} keyOf={(t) => yesNo(t.planned, 'Planned', 'Impulse')} order={['Planned', 'Impulse']} />
            <Breakdown title="By emotional state" items={items} keyOf={(t) => t.emotion} order={[...EMOTIONS]} />
            <Breakdown title="Followed plan?" items={items} keyOf={(t) => yesNo(t.followed_plan, 'Followed plan', 'Broke plan')} order={['Followed plan', 'Broke plan']} />
            <ThesisMatrix items={items} />
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub, cls = 'text-zinc-100' }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold ${cls}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

const SmallNote = () => <p className="text-xs text-amber-400/80">Small sample: fewer than {SMALL} trades, so treat these numbers as noise.</p>;
const SmallTag = () => (
  <span className="ml-1.5 rounded bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-400/90" title={`Fewer than ${SMALL} trades`}>
    small sample
  </span>
);

function Breakdown({
  title,
  items,
  keyOf,
  order,
}: {
  title: string;
  items: Item[];
  keyOf: (t: Trade) => string | null;
  order: string[];
}) {
  const rows = useMemo(() => {
    const b = breakdown(items, (i) => keyOf(i.t), (i) => i.pnl);
    const rank = (g: string) => (order.indexOf(g) >= 0 ? order.indexOf(g) : g === '(none)' ? 1e6 : 1e5);
    return b.sort((x, y) => rank(x.group) - rank(y.group) || x.group.localeCompare(y.group));
  }, [items, keyOf, order]);
  return (
    <section className="card overflow-x-auto">
      <h2 className="px-4 pt-3 text-sm font-medium text-zinc-300">{title}</h2>
      <BreakdownTable rows={rows} />
    </section>
  );
}

function BreakdownTable({ rows }: { rows: (Summary & { group: string })[] }) {
  return (
    <table className="mt-1 w-full text-sm">
      <thead>
        <tr className="border-b border-zinc-800">
          <th className="th">Group</th>
          <th className="th text-right">Trades</th>
          <th className="th text-right">Win rate</th>
          <th className="th text-right">Total P&amp;L</th>
          <th className="th text-right">Avg / trade</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.group} className="border-b border-zinc-800/60 last:border-0">
            <td className="td text-zinc-200">
              {r.group}
              {r.count < SMALL && <SmallTag />}
            </td>
            <td className="td text-right text-zinc-400">{r.count}</td>
            <td className="td text-right">{pct(r.winRate, 0).replace('+', '')}</td>
            <td className={`td text-right font-medium ${pnlClass(r.totalPnl)}`}>{money(r.totalPnl, true)}</td>
            <td className={`td text-right ${pnlClass(r.expectancy)}`}>{money(r.expectancy, true)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Thesis right? × outcome. Highlights the two "luck" cells. */
function ThesisMatrix({ items }: { items: Item[] }) {
  const rowsOrder = [...THESIS_RIGHT, '(none)'];
  const cell = (thesis: string, won: boolean) => {
    const g = items.filter((i) => (i.t.thesis_right ?? '(none)') === thesis && (won ? i.pnl > 0 : i.pnl <= 0));
    return { n: g.length, pnl: g.reduce((a, b) => a + b.pnl, 0) };
  };
  const present = rowsOrder.filter((r) => items.some((i) => (i.t.thesis_right ?? '(none)') === r));
  return (
    <section className="card overflow-x-auto">
      <h2 className="px-4 pt-3 text-sm font-medium text-zinc-300">Thesis right? vs outcome</h2>
      <table className="mt-1 w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="th">Thesis right?</th>
            <th className="th text-right">Made money</th>
            <th className="th text-right">Lost / flat</th>
            <th className="th text-right">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {present.map((r) => {
            const w = cell(r, true);
            const l = cell(r, false);
            const n = w.n + l.n;
            return (
              <tr key={r} className="border-b border-zinc-800/60 last:border-0">
                <td className="td text-zinc-200">
                  {r}
                  {n < SMALL && <SmallTag />}
                </td>
                <MatrixCell c={w} flag={r === 'No' ? 'Wrong but made money' : null} />
                <MatrixCell c={l} flag={r === 'Yes' ? 'Right but lost money' : null} />
                <td className="td text-right">{n ? `${Math.round((w.n / n) * 100)}%` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-4 pb-3 pt-2 text-[11px] text-zinc-500">
        <span className="text-amber-300">Highlighted</span>: thesis right but lost money (execution?) and thesis wrong but made money (luck).
      </p>
    </section>
  );
}

function MatrixCell({ c, flag }: { c: { n: number; pnl: number }; flag: string | null }) {
  const hl = flag && c.n > 0;
  return (
    <td className={`td text-right ${hl ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/50' : ''}`} title={flag ?? undefined}>
      <span className="text-zinc-300">{c.n}</span>
      <span className={`ml-2 ${pnlClass(c.n ? c.pnl : null)}`}>{c.n ? money(c.pnl, true) : ''}</span>
      {hl && <div className="text-[10px] text-amber-300">{flag}</div>}
    </td>
  );
}
