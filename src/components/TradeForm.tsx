import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Modal } from './Modal';
import { ChipGroup } from './ChipGroup';
import { Screenshots, usePendingShots } from './Screenshots';
import { useJournal } from '../lib/store';
import { api, ApiError, type TradeInput } from '../lib/api';
import { canBeCredit, isOption, parseNum } from '../lib/calc';
import { today, modKey } from '../lib/format';
import {
  CURRENCIES, EMOTIONS, GRADES, STRUCTURES, THESIS_RIGHT,
  type Currency, type Structure, type Trade,
} from '../lib/types';

type Num = string;
interface FormState {
  ticker: string;
  structure: Structure | null;
  is_credit: boolean;
  currency: Currency;
  entry_price: Num;
  quantity: Num;
  setup_tag: string | null;
  grade: string | null;
  planned: 'Planned' | 'Impulse' | null;
  emotion: string | null;
  thesis: string;
  legs: string;
  expiry: string;
  stop_price: Num;
  target_price: Num;
  position_pct: Num;
  entry_date: string;
  gamma_notes: string;
  notes: string;
  // closed trades only (edit mode)
  exit_price: Num;
  exit_date: string;
  fees: Num;
  thesis_right: string | null;
  followed_plan: 'Yes' | 'No' | null;
  change_note: string;
}

const s = (v: unknown) => (v == null ? '' : String(v));

function initialState(trade: Trade | undefined, defaults: { structure: Structure; currency: Currency; setup_tag: string | null }): FormState {
  if (trade)
    return {
      ticker: trade.ticker,
      structure: trade.structure,
      is_credit: trade.is_credit,
      currency: trade.currency,
      entry_price: s(trade.entry_price),
      quantity: s(trade.quantity),
      setup_tag: trade.setup_tag,
      grade: trade.grade,
      planned: trade.planned == null ? null : trade.planned ? 'Planned' : 'Impulse',
      emotion: trade.emotion,
      thesis: s(trade.thesis),
      legs: s(trade.legs),
      expiry: s(trade.expiry),
      stop_price: s(trade.stop_price),
      target_price: s(trade.target_price),
      position_pct: s(trade.position_pct),
      entry_date: trade.entry_date,
      gamma_notes: s(trade.gamma_notes),
      notes: s(trade.notes),
      exit_price: s(trade.exit_price),
      exit_date: s(trade.exit_date),
      fees: s(trade.fees),
      thesis_right: trade.thesis_right,
      followed_plan: trade.followed_plan == null ? null : trade.followed_plan ? 'Yes' : 'No',
      change_note: s(trade.change_note),
    };
  return {
    ticker: '', structure: defaults.structure, is_credit: false, currency: defaults.currency,
    entry_price: '', quantity: '', setup_tag: defaults.setup_tag, grade: null, planned: null, emotion: null,
    thesis: '', legs: '', expiry: '', stop_price: '', target_price: '', position_pct: '', entry_date: today(),
    gamma_notes: '', notes: '', exit_price: '', exit_date: '', fees: '', thesis_right: null, followed_plan: null, change_note: '',
  };
}

/** Inline number check: returns a message for obviously invalid input, else null. */
export function numError(v: string, { required = false, allowNegative = false } = {}): string | null {
  const n = parseNum(v);
  if (n == null) return required ? 'Required' : null;
  if (Number.isNaN(n)) return 'Not a number';
  if (n < 0 && !allowNegative) return 'Must be positive';
  return null;
}

export function TradeForm({ trade, onClose }: { trade?: Trade; onClose: () => void }) {
  const { trades, tags, settings, reload } = useJournal();
  const editing = !!trade;
  const closed = trade?.status === 'closed';
  const [f, setF] = useState<FormState>(() =>
    initialState(trade, {
      structure: settings.last_structure ?? 'Stock Long',
      currency: settings.last_currency ?? settings.default_currency ?? 'AUD',
      setup_tag: settings.last_setup_tag && tags.some((t) => t.name === settings.last_setup_tag) ? settings.last_setup_tag : null,
    }),
  );
  const [more, setMore] = useState(editing);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const shots = usePendingShots();

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setServerErrors((e) => ({ ...e, [k]: '' }));
  };
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  const opt = f.structure ? isOption(f.structure) : false;
  const creditable = f.structure ? canBeCredit(f.structure) : false;

  const errors = useMemo(() => {
    const e: Record<string, string | null> = {
      ticker: f.ticker.trim() ? null : 'Required',
      structure: f.structure ? null : 'Required',
      entry_price: numError(f.entry_price, { required: true }),
      quantity: numError(f.quantity, { required: true }),
      stop_price: numError(f.stop_price),
      target_price: numError(f.target_price),
      position_pct: numError(f.position_pct),
      fees: numError(f.fees),
      exit_price: closed ? numError(f.exit_price, { required: true }) : null,
    };
    if (!e.quantity && parseNum(f.quantity) === 0) e.quantity = 'Must be more than 0';
    return e;
  }, [f, closed]);

  const shown = (k: string) => serverErrors[k] || ((touched[k] || submitted) && errors[k]) || null;

  // Recent tickers, most recent first.
  const recent = useMemo(() => {
    const seen = new Set<string>();
    return [...trades]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((t) => t.ticker)
      .filter((t) => (seen.has(t) ? false : (seen.add(t), true)));
  }, [trades]);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean) || inFlight.current) return;
    const payload: TradeInput = {
      ticker: f.ticker.trim().toUpperCase(),
      structure: f.structure!,
      is_credit: creditable && f.is_credit,
      currency: f.currency,
      entry_price: parseNum(f.entry_price)!,
      quantity: parseNum(f.quantity)!,
      setup_tag: f.setup_tag,
      grade: f.grade,
      planned: f.planned == null ? null : f.planned === 'Planned',
      emotion: f.emotion,
      thesis: f.thesis.trim() || null,
      legs: opt ? f.legs.trim() || null : null,
      expiry: opt ? f.expiry || null : null,
      stop_price: parseNum(f.stop_price),
      target_price: parseNum(f.target_price),
      position_pct: parseNum(f.position_pct),
      entry_date: f.entry_date || today(),
      gamma_notes: f.gamma_notes.trim() || null,
      notes: f.notes.trim() || null,
    };
    if (closed) {
      Object.assign(payload, {
        exit_price: parseNum(f.exit_price),
        exit_date: f.exit_date || today(),
        fees: parseNum(f.fees) ?? 0,
        thesis_right: f.thesis_right,
        followed_plan: f.followed_plan == null ? null : f.followed_plan === 'Yes',
        change_note: f.change_note.trim() || null,
      });
    }
    inFlight.current = true;
    setSaving(true);
    setFormError(null);
    try {
      const saved = editing ? await api.updateTrade(trade!.id, payload) : await api.createTrade(payload);
      for (const p of shots.pending) await api.addShot(saved.id, p.blob, p.label, p.caption ?? '');
      await reload();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setServerErrors(err.fields);
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const onFormKey = (e: KeyboardEvent<HTMLFormElement>) => {
    if (!e.currentTarget.contains(e.target as Node)) return; // from a nested dialog
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  };
  // Enter in a single-line field saves (except the ticker, where Enter picks a suggestion).
  const enterSaves = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      save();
    }
  };

  const numInput = (k: keyof FormState, props: { placeholder?: string; className?: string } = {}) => (
    <input
      inputMode="decimal"
      value={f[k] as string}
      onChange={(e) => set(k, e.target.value as never)}
      onBlur={() => touch(k)}
      onKeyDown={enterSaves}
      aria-invalid={!!shown(k)}
      className={`w-full ${shown(k) ? 'border-red-500' : ''} ${props.className ?? ''}`}
      placeholder={props.placeholder}
    />
  );

  return (
    <Modal onClose={onClose} title={editing ? `Edit ${trade!.ticker}` : 'Log trade'} width="max-w-2xl">
      <form onSubmit={save} onKeyDown={onFormKey} className="space-y-4 p-5" noValidate>
        {/* Required */}
        <Field label="Ticker" error={shown('ticker')} className="max-w-xs">
          <TickerInput value={f.ticker} onChange={(v) => set('ticker', v)} onBlur={() => touch('ticker')} options={recent} invalid={!!shown('ticker')} />
        </Field>
        <Field label="Structure" error={shown('structure')}>
          <div className="flex flex-wrap items-center gap-3">
            <ChipGroup options={STRUCTURES} value={f.structure} onChange={(v) => v && set('structure', v)} ariaLabel="Structure" size="sm" />
            {creditable && (
              <ChipGroup
                options={['Debit', 'Credit'] as const}
                value={f.is_credit ? 'Credit' : 'Debit'}
                onChange={(v) => set('is_credit', v === 'Credit')}
                ariaLabel="Debit or credit"
                size="sm"
                tone={() => 'border-amber-500 bg-amber-500/20 text-amber-200'}
              />
            )}
          </div>
        </Field>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
          <Field label={opt ? `${f.is_credit && creditable ? 'Credit' : 'Price'} per contract` : `Entry price${f.is_credit && creditable ? ' (credit)' : ''}`} error={shown('entry_price')}>
            {numInput('entry_price', { placeholder: opt ? 'e.g. 2.35' : 'e.g. 45.20' })}
          </Field>
          <Field label={opt ? 'Contracts' : f.structure === 'Other' ? 'Quantity' : 'Shares'} error={shown('quantity')}>
            {numInput('quantity', { placeholder: opt ? 'e.g. 2' : 'e.g. 200' })}
          </Field>
          <Field label="Currency">
            <ChipGroup options={CURRENCIES} value={f.currency} onChange={(v) => v && set('currency', v)} ariaLabel="Currency" />
          </Field>
        </div>

        {/* Encouraged */}
        <div className="space-y-3 rounded-lg bg-zinc-950/40 p-3">
          <Field label="Setup">
            <ChipGroup options={tags.map((t) => t.name)} value={f.setup_tag} onChange={(v) => set('setup_tag', v)} allowNone ariaLabel="Setup" size="sm" />
          </Field>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Field label="Grade">
              <ChipGroup options={GRADES} value={f.grade as never} onChange={(v) => set('grade', v)} allowNone ariaLabel="Grade" />
            </Field>
            <Field label="Planned or impulse">
              <ChipGroup
                options={['Planned', 'Impulse'] as const}
                value={f.planned}
                onChange={(v) => set('planned', v)}
                allowNone
                ariaLabel="Planned or impulse"
                tone={(v) => (v === 'Impulse' ? 'border-amber-500 bg-amber-500/20 text-amber-200' : undefined)}
              />
            </Field>
          </div>
          <Field label="Emotional state">
            <ChipGroup options={EMOTIONS} value={f.emotion as never} onChange={(v) => set('emotion', v)} allowNone ariaLabel="Emotional state" size="sm" />
          </Field>
          <Field label="Thesis / trigger">
            <input
              className="w-full"
              value={f.thesis}
              onChange={(e) => set('thesis', e.target.value)}
              onKeyDown={enterSaves}
              placeholder="One line — Enter saves"
            />
          </Field>
        </div>

        {/* More */}
        <div>
          <button type="button" className="text-xs font-medium text-zinc-400 hover:text-zinc-200" onClick={() => setMore((m) => !m)} aria-expanded={more}>
            {more ? '▾' : '▸'} More {opt ? '(strikes, expiry, stop, target, size, notes)' : '(stop, target, size, date, notes)'}
          </button>
          {more && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {opt && (
                <>
                  <Field label="Strikes / legs">
                    <input className="w-full" value={f.legs} onChange={(e) => set('legs', e.target.value)} onKeyDown={enterSaves} placeholder="140/160" />
                  </Field>
                  <Field label="Expiry">
                    <input type="date" className="w-full" value={f.expiry} onChange={(e) => set('expiry', e.target.value)} />
                  </Field>
                </>
              )}
              <Field label="Entry date">
                <input type="date" className="w-full" value={f.entry_date} onChange={(e) => set('entry_date', e.target.value)} />
              </Field>
              <Field label="Stop / invalidation" error={shown('stop_price')}>
                {numInput('stop_price')}
              </Field>
              <Field label="Target" error={shown('target_price')}>
                {numInput('target_price')}
              </Field>
              <Field label="Size % of capital" error={shown('position_pct')}>
                {numInput('position_pct', { placeholder: 'e.g. 5' })}
              </Field>
              <Field label="Gamma exposure notes" className="col-span-full">
                <input className="w-full" value={f.gamma_notes} onChange={(e) => set('gamma_notes', e.target.value)} onKeyDown={enterSaves} />
              </Field>
              <Field label="Notes" className="col-span-full">
                <textarea className="w-full" rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
              </Field>
            </div>
          )}
        </div>

        {closed && (
          <div className="grid grid-cols-3 gap-3 border-t border-zinc-800 pt-4">
            <Field label="Exit price" error={shown('exit_price')}>
              {numInput('exit_price')}
            </Field>
            <Field label="Exit date">
              <input type="date" className="w-full" value={f.exit_date} onChange={(e) => set('exit_date', e.target.value)} />
            </Field>
            <Field label="Fees" error={shown('fees')}>
              {numInput('fees', { placeholder: '0' })}
            </Field>
            <Field label="Thesis right?">
              <ChipGroup options={THESIS_RIGHT} value={f.thesis_right as never} onChange={(v) => set('thesis_right', v)} allowNone ariaLabel="Thesis right" />
            </Field>
            <Field label="Followed plan?">
              <ChipGroup options={['Yes', 'No'] as const} value={f.followed_plan} onChange={(v) => set('followed_plan', v)} allowNone ariaLabel="Followed plan" />
            </Field>
            <Field label="What I'd change" className="col-span-full">
              <input className="w-full" value={f.change_note} onChange={(e) => set('change_note', e.target.value)} onKeyDown={enterSaves} />
            </Field>
          </div>
        )}

        {!editing && <Screenshots items={shots.pending} context="open" onAdd={shots.add} onDelete={shots.remove} compact />}

        {formError && <div className="text-sm text-red-400">{formError}</div>}
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            <span className="kbd">{modKey}↵</span> save · <span className="kbd">Esc</span> cancel · <span className="kbd">←→</span> pick chips
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Save trade'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function Field({ label, error, children, className = '' }: { label: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="label">{label}</div>
      {children}
      {error && <div className="err">{error}</div>}
    </div>
  );
}

function TickerInput({
  value,
  onChange,
  onBlur,
  options,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  options: string[];
  invalid: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const ref = useRef<HTMLInputElement>(null);
  const q = value.trim().toUpperCase();
  const [browse, setBrowse] = useState(false); // ↓ in an empty field lists recent tickers
  const matches = (q ? options.filter((o) => o.startsWith(q) && o !== q) : browse ? options : []).slice(0, 6);
  const show = open && matches.length > 0;

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setHi(-1);
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        autoFocus
        value={value}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setOpen(true);
          setHi(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setBrowse(false);
          setTimeout(() => setOpen(false), 120);
          onBlur();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && (matches.length || (!q && options.length))) {
            e.preventDefault();
            setBrowse(true);
            setOpen(true);
            setHi((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp' && show) {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, -1));
          } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            if (show && hi >= 0) pick(matches[hi]);
          } else if (e.key === 'Tab' && show && hi >= 0) {
            pick(matches[hi]);
          } else if (e.key === 'Escape' && show) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className={`w-full font-medium uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal ${invalid ? 'border-red-500' : ''}`}
        placeholder={options.length ? `e.g. ${options.slice(0, 3).join(', ')}` : 'e.g. BHP'}
        autoComplete="off"
        spellCheck={false}
      />
      {show && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded border border-zinc-700 bg-zinc-900 shadow-lg">
          {matches.map((m, i) => (
            <li
              key={m}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              className={`cursor-pointer px-2 py-1 text-sm ${i === hi ? 'bg-sky-600/40 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
            >
              {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
