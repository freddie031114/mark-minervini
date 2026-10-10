import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { ChipGroup } from './ChipGroup';
import { Screenshots, usePendingShots } from './Screenshots';
import { Field, numError } from './TradeForm';
import { useJournal } from '../lib/store';
import { api } from '../lib/api';
import { parseNum, pnl, pnlPct, rMultiple, holdingDays } from '../lib/calc';
import { money, modKey, pct, pnlClass, rFmt, today } from '../lib/format';
import { THESIS_RIGHT } from '../lib/types';

export function CloseDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { trades, reload } = useJournal();
  const trade = trades.find((t) => t.id === id);
  const [exitPrice, setExitPrice] = useState('');
  const [exitDate, setExitDate] = useState(today());
  const [fees, setFees] = useState('0');
  const [thesisRight, setThesisRight] = useState<string | null>(null);
  const [followed, setFollowed] = useState<'Yes' | 'No' | null>(null);
  const [change, setChange] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const shots = usePendingShots();

  const errs = { exit: numError(exitPrice, { required: true }), fees: numError(fees) };
  const preview = useMemo(() => {
    const ex = parseNum(exitPrice);
    if (!trade || ex == null || Number.isNaN(ex)) return null;
    const input = { ...trade, exit_price: ex, exit_date: exitDate, fees: parseNum(fees) || 0 };
    return { pnl: pnl(input), pct: pnlPct(input), r: rMultiple(input), days: holdingDays(input, today()) };
  }, [trade, exitPrice, exitDate, fees]);

  if (!trade) return null;

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setSubmitted(true);
    if (errs.exit || errs.fees || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      await api.closeTrade(id, {
        exit_price: parseNum(exitPrice)!,
        exit_date: exitDate || today(),
        fees: parseNum(fees) ?? 0,
        thesis_right: thesisRight,
        followed_plan: followed == null ? null : followed === 'Yes',
        change_note: change.trim() || null,
      });
      for (const p of shots.pending) await api.addShot(id, p.blob, p.label, p.caption ?? '');
      await reload();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} title={`Close ${trade.ticker} · ${trade.structure}${trade.legs ? ` ${trade.legs}` : ''}`} width="max-w-xl">
      <form
        className="space-y-4 p-5"
        noValidate
        onSubmit={save}
        onKeyDown={(e) => {
          if (!e.currentTarget.contains(e.target as Node)) return; // from a nested dialog
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
      >
        <div className="text-xs text-zinc-500">
          Entry {trade.entry_price} × {trade.quantity} on {trade.entry_date}
          {trade.stop_price != null && ` · stop ${trade.stop_price}`} · {trade.currency}
          {trade.is_credit && ' · credit'}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Exit price" error={(submitted || exitPrice) && errs.exit}>
            <input autoFocus inputMode="decimal" className="w-full" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} />
          </Field>
          <Field label="Exit date">
            <input type="date" className="w-full" value={exitDate} onChange={(e) => setExitDate(e.target.value)} />
          </Field>
          <Field label="Fees" error={errs.fees}>
            <input inputMode="decimal" className="w-full" value={fees} onChange={(e) => setFees(e.target.value)} onFocus={(e) => e.target.select()} />
          </Field>
        </div>
        {preview && (
          <div className="rounded bg-zinc-950/60 px-3 py-2 text-sm">
            P&amp;L <span className={`font-semibold ${pnlClass(preview.pnl)}`}>{money(preview.pnl, trade.currency, true)}</span>
            <span className="text-zinc-500"> · {pct(preview.pct)} · {rFmt(preview.r)} · {preview.days}d held</span>
          </div>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Field label="Thesis right?">
            <ChipGroup options={THESIS_RIGHT} value={thesisRight as never} onChange={setThesisRight} allowNone ariaLabel="Thesis right" />
          </Field>
          <Field label="Followed my plan?">
            <ChipGroup options={['Yes', 'No'] as const} value={followed} onChange={setFollowed} allowNone ariaLabel="Followed plan" />
          </Field>
        </div>
        <Field label="What I'd change">
          <input
            className="w-full"
            value={change}
            onChange={(e) => setChange(e.target.value)}
            placeholder="One line — Enter saves"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                save();
              }
            }}
          />
        </Field>
        <Screenshots items={shots.pending} extraHistory={trade.screenshots.map(toItem)} context="close" onAdd={shots.add} onDelete={shots.remove} compact />
        {error && <div className="text-sm text-red-400">{error}</div>}
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            <span className="kbd">{modKey}↵</span> save · <span className="kbd">Esc</span> cancel
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Close trade'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export const toItem = (s: { id: number; filename: string; label: string; caption: string | null }) => ({
  key: s.id,
  url: `/screenshots/${encodeURIComponent(s.filename)}`,
  label: s.label as never,
  caption: s.caption,
});
