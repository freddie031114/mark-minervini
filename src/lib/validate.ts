// Normalisation of trade data coming from files (JSON backups, old journal import).
import { STRUCTURES, SHOT_LABELS, type ShotLabel } from './types';

export const ENTRY_FIELDS = [
  'ticker', 'structure', 'is_credit', 'entry_price', 'quantity', 'entry_date',
  'setup_tag', 'grade', 'planned', 'emotion', 'thesis', 'legs', 'expiry', 'stop_price',
  'target_price', 'position_pct', 'gamma_notes', 'notes',
] as const;
export const CLOSE_FIELDS = ['exit_price', 'exit_date', 'fees', 'thesis_right', 'followed_plan', 'change_note'] as const;
export const TRADE_FIELDS = [...ENTRY_FIELDS, 'status', ...CLOSE_FIELDS] as const;

const NUM = ['entry_price', 'quantity', 'stop_price', 'target_price', 'position_pct', 'exit_price', 'fees'];
const BOOL = ['is_credit', 'planned', 'followed_plan'];
const DATE = ['entry_date', 'expiry', 'exit_date'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type TradeData = Record<string, unknown>;

/** Normalise one trade; returns the cleaned value and field errors. */
export function normalizeTrade(src: Record<string, unknown>, required: string[] = []) {
  const value: TradeData = {};
  const errors: Record<string, string> = {};
  for (const k of [...ENTRY_FIELDS, ...CLOSE_FIELDS]) {
    if (!(k in src)) continue;
    let v = src[k];
    if (typeof v === 'string') v = v.trim();
    if (v === '' || v === undefined) v = null;
    if (v != null) {
      if (NUM.includes(k)) {
        const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
        if (!Number.isFinite(n)) errors[k] = 'Not a number';
        else if (n < 0 && k !== 'position_pct') errors[k] = 'Must not be negative';
        v = n;
      } else if (BOOL.includes(k)) {
        v = v === true || v === 1 || v === 'true' || v === '1';
      } else if (DATE.includes(k)) {
        if (!DATE_RE.test(String(v))) errors[k] = 'Use YYYY-MM-DD';
      } else if (k === 'ticker') {
        v = String(v).toUpperCase();
      } else if (k === 'structure') {
        if (!(STRUCTURES as readonly string[]).includes(String(v))) errors[k] = 'Unknown structure';
      } else if (k === 'grade') {
        if (!['A', 'B', 'C'].includes(String(v))) errors[k] = 'A, B or C';
      } else if (k === 'thesis_right') {
        if (!['Yes', 'Partly', 'No'].includes(String(v))) errors[k] = 'Yes, Partly or No';
      } else {
        v = String(v);
      }
    }
    if (k === 'fees' && v == null) v = 0;
    if (k === 'is_credit' && v == null) v = false;
    value[k] = v;
  }
  for (const k of required) if (value[k] == null && !errors[k]) errors[k] = 'Required';
  return { value, errors };
}

export interface ImportShot {
  label: ShotLabel;
  caption: string | null;
  created_at?: string;
  data: string | null; // data URL; null for old exports that only had filenames
}
export interface ImportTrade extends TradeData {
  status: 'open' | 'closed';
  is_demo: boolean;
  created_at?: string;
  shots: ImportShot[];
}

/** Validate a JSON backup. */
export function validateImport(json: unknown): { ok: true; trades: ImportTrade[]; tags: string[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const j = json as Record<string, unknown>;
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, errors: ['File is not a JSON object.'] };
  if (j.app !== 'trading-journal') errors.push('Not a trading-journal export (missing "app": "trading-journal").');
  if (!Array.isArray(j.trades)) errors.push('Missing "trades" array.');
  if (j.tags !== undefined && !Array.isArray(j.tags)) errors.push('"tags" must be an array.');
  if (errors.length) return { ok: false, errors };

  const trades: ImportTrade[] = [];
  (j.trades as Record<string, unknown>[]).forEach((t, i) => {
    const where = `Trade #${i + 1}${t && t.ticker ? ` (${t.ticker})` : ''}`;
    const { value, errors: fe } = normalizeTrade(t ?? {}, ['ticker', 'structure', 'entry_price', 'quantity', 'entry_date']);
    for (const [f, m] of Object.entries(fe)) errors.push(`${where}: ${f} — ${m}`);
    const status = (t?.status ?? (value.exit_price != null ? 'closed' : 'open')) as string;
    if (status !== 'open' && status !== 'closed') errors.push(`${where}: status must be open or closed`);
    if (status === 'closed' && value.exit_price == null) errors.push(`${where}: closed trade has no exit_price`);
    const shots: ImportShot[] = [];
    if (t?.screenshots !== undefined) {
      if (!Array.isArray(t.screenshots)) errors.push(`${where}: screenshots must be an array`);
      else
        for (const s of t.screenshots as Record<string, unknown>[]) {
          const data = typeof s?.data === 'string' && s.data.startsWith('data:image/') ? s.data : null;
          shots.push({
            label: (SHOT_LABELS as readonly string[]).includes(String(s?.label)) ? (s.label as ShotLabel) : 'Other',
            caption: typeof s?.caption === 'string' ? s.caption : null,
            created_at: typeof s?.created_at === 'string' ? s.created_at : undefined,
            data,
          });
        }
    }
    trades.push({
      ...value,
      status: status as 'open' | 'closed',
      is_demo: !!t?.is_demo,
      created_at: typeof t?.created_at === 'string' ? t.created_at : undefined,
      shots,
    });
  });
  if (errors.length) return { ok: false, errors: errors.slice(0, 30).concat(errors.length > 30 ? [`…and ${errors.length - 30} more`] : []) };
  const tags = ((j.tags as unknown[]) || [])
    .map((x) => (typeof x === 'string' ? x : (x as { name?: string })?.name))
    .filter((x): x is string => typeof x === 'string' && !!x.trim());
  return { ok: true, trades, tags: [...new Set(tags)] };
}
