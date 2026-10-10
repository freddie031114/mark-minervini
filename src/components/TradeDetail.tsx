import { useEffect, useState, type ReactNode } from 'react';
import { Modal, useIsTop } from './Modal';
import { Screenshots } from './Screenshots';
import { TradeForm } from './TradeForm';
import { toItem } from './CloseDialog';
import { useJournal } from '../lib/store';
import { api } from '../lib/api';
import { derive } from '../lib/derive';
import { isTyping, money, num, pct, pnlClass, rFmt } from '../lib/format';
import { isOption } from '../lib/calc';

export function TradeDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { trades, reload, openClose } = useJournal();
  const [editing, setEditing] = useState(false);
  const trade = trades.find((t) => t.id === id);

  useEffect(() => {
    if (!trade) onClose();
  }, [trade, onClose]);
  if (!trade) return null;

  const d = derive(trade);
  const opt = isOption(trade.structure);
  const bool = (v: boolean | null, yes: string, no: string) => (v == null ? null : v ? yes : no);

  async function del() {
    if (!confirm(`Delete ${trade!.ticker} trade and its screenshots? This cannot be undone.`)) return;
    await api.deleteTrade(trade!.id);
    await reload();
    onClose();
  }

  return (
    <Modal
      onClose={onClose}
      dismissOnBackdrop
      width="max-w-3xl"
      title={
        <span className="flex items-center gap-2">
          {trade.ticker}
          <span className="text-sm font-normal text-zinc-400">
            {trade.structure}
            {trade.is_credit && ' (credit)'}
            {trade.legs && ` ${trade.legs}`}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${trade.status === 'open' ? 'bg-sky-500/20 text-sky-300' : 'bg-zinc-700 text-zinc-300'}`}>
            {trade.status}
          </span>
          {trade.is_demo && <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] uppercase text-purple-300">demo</span>}
        </span>
      }
    >
      <DetailBody
        onKey={(k) => {
          if (k === 'c' && trade.status === 'open') openClose(trade.id);
          if (k === 'e') setEditing(true);
        }}
      >
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap gap-2">
            {trade.status === 'open' && (
              <button className="btn btn-primary" onClick={() => openClose(trade.id)}>
                Close trade <span className="kbd border-sky-400/40 bg-sky-700 text-sky-100">C</span>
              </button>
            )}
            <button className="btn" onClick={() => setEditing(true)}>
              Edit <span className="kbd">E</span>
            </button>
            <button className="btn btn-danger ml-auto" onClick={del}>
              Delete
            </button>
          </div>

          {trade.status === 'closed' && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="P&L" value={money(d.pnl, trade.currency, true)} cls={pnlClass(d.pnl)} />
              <Stat label="P&L %" value={pct(d.pnl == null ? null : d.pnlPct)} cls={pnlClass(d.pnlPct)} />
              <Stat label="R multiple" value={rFmt(d.r)} cls={pnlClass(d.r)} />
              <Stat label="Held" value={`${d.days ?? '—'} days`} />
            </div>
          )}

          <Grid>
            <Item k="Entry" v={`${num(trade.entry_price, 4)} ${trade.currency}`} />
            <Item k={opt ? 'Contracts' : 'Quantity'} v={num(trade.quantity, 4)} />
            <Item k="Entry date" v={trade.entry_date} />
            {opt && <Item k="Expiry" v={trade.expiry ? `${trade.expiry}${trade.status === 'open' && d.dte != null ? ` (${d.dte}d)` : ''}` : null} />}
            <Item k="Setup" v={trade.setup_tag} />
            <Item k="Grade" v={trade.grade} />
            <Item k="Planned / impulse" v={bool(trade.planned, 'Planned', 'Impulse')} />
            <Item k="Emotion" v={trade.emotion} />
            <Item k="Stop" v={trade.stop_price != null ? num(trade.stop_price, 4) : null} />
            <Item k="Target" v={trade.target_price != null ? num(trade.target_price, 4) : null} />
            <Item k="Size % capital" v={trade.position_pct != null ? `${trade.position_pct}%` : null} />
            {trade.status === 'open' && <Item k="Days held" v={String(d.days)} />}
            {trade.status === 'closed' && (
              <>
                <Item k="Exit" v={num(trade.exit_price, 4)} />
                <Item k="Exit date" v={trade.exit_date} />
                <Item k="Fees" v={money(trade.fees, trade.currency)} />
                <Item k="Thesis right?" v={trade.thesis_right} />
                <Item k="Followed plan?" v={bool(trade.followed_plan, 'Yes', 'No')} />
              </>
            )}
          </Grid>
          <div className="space-y-2 text-sm">
            <Text k="Thesis / trigger" v={trade.thesis} />
            {trade.status === 'closed' && <Text k="What I'd change" v={trade.change_note} />}
            <Text k="Gamma exposure" v={trade.gamma_notes} />
            <Text k="Notes" v={trade.notes} />
          </div>

          <Screenshots
            items={trade.screenshots.map(toItem)}
            context={trade.status === 'open' ? 'open' : 'close'}
            onAdd={async (blob, label, caption) => {
              await api.addShot(trade.id, blob, label, caption);
              await reload();
            }}
            onDelete={async (item) => {
              await api.deleteShot(Number(item.key));
              await reload();
            }}
          />
        </div>
      </DetailBody>
      {editing && <TradeForm trade={trade} onClose={() => setEditing(false)} />}
    </Modal>
  );
}

/** Handles single-letter shortcuts while this dialog is top-most and the user isn't typing. */
function DetailBody({ children, onKey }: { children: ReactNode; onKey: (k: string) => void }) {
  const isTop = useIsTop();
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e) || !isTop()) return;
      const k = e.key.toLowerCase();
      if (k === 'c' || k === 'e') {
        e.preventDefault();
        onKey(k);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isTop, onKey]);
  return <>{children}</>;
}

const Grid = ({ children }: { children: ReactNode }) => <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">{children}</dl>;
const Item = ({ k, v }: { k: string; v: string | null | undefined }) => (
  <div>
    <dt className="text-xs text-zinc-500">{k}</dt>
    <dd className={v ? 'text-zinc-200' : 'text-zinc-600'}>{v || '—'}</dd>
  </div>
);
const Text = ({ k, v }: { k: string; v: string | null }) =>
  v ? (
    <div>
      <div className="text-xs text-zinc-500">{k}</div>
      <div className="whitespace-pre-wrap text-zinc-200">{v}</div>
    </div>
  ) : null;
const Stat = ({ label, value, cls = 'text-zinc-100' }: { label: string; value: string; cls?: string }) => (
  <div className="card px-3 py-2">
    <div className="text-xs text-zinc-500">{label}</div>
    <div className={`text-lg font-semibold ${cls}`}>{value}</div>
  </div>
);
