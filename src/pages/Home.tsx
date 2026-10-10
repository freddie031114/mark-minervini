import { useMemo } from 'react';
import { useJournal } from '../lib/store';
import { derive } from '../lib/derive';
import { num } from '../lib/format';
import { useRowNav } from '../lib/useRowNav';
import { isOption } from '../lib/calc';

export function Home() {
  const { trades, openAdd, openDetail, openClose } = useJournal();
  const open = useMemo(
    () =>
      trades
        .filter((t) => t.status === 'open')
        .map((t) => ({ t, d: derive(t) }))
        .sort((a, b) => (a.d.dte ?? 1e9) - (b.d.dte ?? 1e9) || b.t.entry_date.localeCompare(a.t.entry_date)),
    [trades],
  );
  const [sel, setSel] = useRowNav(
    open,
    (r) => openDetail(r.t.id),
    (k, r) => {
      if (k !== 'c') return false;
      openClose(r.t.id);
      return true;
    },
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-100">
          Open positions <span className="ml-1 text-sm font-normal text-zinc-500">{open.length}</span>
        </h1>
        <button className="btn btn-primary px-4 py-2 text-base" onClick={openAdd}>
          + Log trade <span className="kbd border-sky-400/40 bg-sky-700 text-sky-100">N</span>
        </button>
      </div>
      {open.length === 0 ? (
        <div className="card p-10 text-center text-sm text-zinc-500">
          No open trades. Press <span className="kbd">N</span> to log one, or load demo data in Settings.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr>
                <th className="th">Ticker</th>
                <th className="th">Structure</th>
                <th className="th">Strikes</th>
                <th className="th">Expiry</th>
                <th className="th text-right">Days held</th>
                <th className="th text-right">DTE</th>
                <th className="th text-right">Entry</th>
                <th className="th text-right">Size</th>
                <th className="th">Setup</th>
                <th className="th">Grade</th>
              </tr>
            </thead>
            <tbody>
              {open.map(({ t, d }, i) => (
                <tr
                  key={t.id}
                  data-row={i}
                  onClick={() => {
                    setSel(i);
                    openDetail(t.id);
                  }}
                  className={`cursor-pointer border-b border-zinc-800/60 last:border-0 ${i === sel ? 'bg-sky-500/10 outline outline-1 -outline-offset-1 outline-sky-500/50' : 'hover:bg-zinc-800/40'}`}
                >
                  <td className="td font-medium text-zinc-100">
                    {t.ticker}
                    {t.is_demo && <DemoBadge />}
                  </td>
                  <td className="td text-zinc-300">
                    {t.structure}
                    {t.is_credit && <span className="text-amber-400"> cr</span>}
                  </td>
                  <td className="td text-zinc-400">{t.legs ?? ''}</td>
                  <td className="td text-zinc-400">{t.expiry ?? ''}</td>
                  <td className="td text-right">{d.days}</td>
                  <td className="td text-right">
                    <Dte dte={isOption(t.structure) || t.expiry ? d.dte : null} />
                  </td>
                  <td className="td text-right text-zinc-300">
                    {num(t.entry_price, 4)}
                  </td>
                  <td className="td text-right text-zinc-300">
                    {num(t.quantity, 4)}
                    {t.position_pct != null && <span className="text-xs text-zinc-500"> · {t.position_pct}%</span>}
                  </td>
                  <td className="td text-zinc-300">{t.setup_tag ?? ''}</td>
                  <td className="td">{t.grade ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open.length > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          <span className="kbd">↑↓</span> select · <span className="kbd">↵</span> open · <span className="kbd">C</span> close the selected trade
        </p>
      )}
    </div>
  );
}

function Dte({ dte }: { dte: number | null }) {
  if (dte == null) return <span className="text-zinc-600">—</span>;
  const cls = dte < 5 ? 'bg-red-500/20 text-red-300 font-semibold' : dte < 14 ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-zinc-300';
  return <span className={`rounded px-1.5 py-0.5 ${cls}`}>{dte}d</span>;
}

export const DemoBadge = () => (
  <span className="ml-1.5 rounded bg-purple-500/20 px-1 py-0.5 align-middle text-[9px] font-medium uppercase text-purple-300">demo</span>
);
