// Input normalisation for trades and validation of JSON imports.
import { ENTRY_FIELDS, CLOSE_FIELDS } from './db.js';

export const STRUCTURES = ['Stock Long', 'Stock Short', 'Long Call', 'Long Put', 'Call Spread', 'Put Spread', 'LEAP Call', 'Other'];
export const CURRENCIES = ['AUD', 'USD'];
export const SHOT_LABELS = ['Entry', 'Exit', 'Gamma', 'Other'];
const GRADES = ['A', 'B', 'C'];
const THESIS_RIGHT = ['Yes', 'Partly', 'No'];

const NUM_FIELDS = ['entry_price', 'quantity', 'stop_price', 'target_price', 'position_pct', 'exit_price', 'fees'];
const BOOL_FIELDS = ['is_credit', 'planned', 'followed_plan'];
const DATE_FIELDS = ['entry_date', 'expiry', 'exit_date'];
const TEXT_FIELDS = ['setup_tag', 'emotion', 'thesis', 'legs', 'gamma_notes', 'notes', 'change_note'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalise a (possibly partial) trade payload.
 * Returns { value, errors } where errors maps field -> message.
 * `required` lists fields that must be present.
 */
export function normalizeTrade(input, { required = [] } = {}) {
  const value = {};
  const errors = {};
  const src = input && typeof input === 'object' ? input : {};

  for (const k of [...ENTRY_FIELDS, ...CLOSE_FIELDS]) {
    if (!(k in src)) continue;
    let v = src[k];
    if (typeof v === 'string') v = v.trim();
    if (v === '' || v === undefined) v = null;

    if (v != null) {
      if (NUM_FIELDS.includes(k)) {
        const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
        if (!Number.isFinite(n)) errors[k] = 'Not a number';
        else if (n < 0 && k !== 'position_pct') errors[k] = 'Must not be negative';
        v = n;
      } else if (BOOL_FIELDS.includes(k)) {
        v = v === true || v === 1 || v === 'true' || v === '1';
      } else if (DATE_FIELDS.includes(k)) {
        if (!DATE_RE.test(String(v))) errors[k] = 'Use YYYY-MM-DD';
      } else if (k === 'ticker') {
        v = String(v).toUpperCase();
      } else if (k === 'structure') {
        if (!STRUCTURES.includes(v)) errors[k] = 'Unknown structure';
      } else if (k === 'currency') {
        if (!CURRENCIES.includes(v)) errors[k] = 'AUD or USD';
      } else if (k === 'grade') {
        if (!GRADES.includes(v)) errors[k] = 'A, B or C';
      } else if (k === 'thesis_right') {
        if (!THESIS_RIGHT.includes(v)) errors[k] = 'Yes, Partly or No';
      } else if (TEXT_FIELDS.includes(k)) {
        v = String(v);
      }
    }
    if (k === 'fees' && v == null) v = 0;
    if (k === 'is_credit' && v == null) v = false;
    value[k] = v;
  }

  for (const k of required) {
    if (value[k] == null && !errors[k]) errors[k] = 'Required';
  }
  return { value, errors };
}

/** Validate a JSON export file. Returns { ok, errors, data }. */
export function validateImport(json) {
  const errors = [];
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, errors: ['File is not a JSON object.'] };
  }
  if (json.app !== 'trading-journal') errors.push('Not a trading-journal export (missing "app": "trading-journal").');
  if (!Array.isArray(json.trades)) errors.push('Missing "trades" array.');
  if (json.tags !== undefined && !Array.isArray(json.tags)) errors.push('"tags" must be an array.');
  if (errors.length) return { ok: false, errors };

  const trades = [];
  const seenIds = new Set();
  json.trades.forEach((t, i) => {
    const where = `Trade #${i + 1}${t && t.ticker ? ` (${t.ticker})` : ''}`;
    const { value, errors: fe } = normalizeTrade(t, {
      required: ['ticker', 'structure', 'entry_price', 'quantity', 'entry_date'],
    });
    for (const [f, m] of Object.entries(fe)) errors.push(`${where}: ${f} — ${m}`);
    const status = t?.status ?? (value.exit_price != null ? 'closed' : 'open');
    if (!['open', 'closed'].includes(status)) errors.push(`${where}: status must be open or closed`);
    if (status === 'closed' && value.exit_price == null) errors.push(`${where}: closed trade has no exit_price`);
    const shots = [];
    if (t?.screenshots !== undefined) {
      if (!Array.isArray(t.screenshots)) errors.push(`${where}: screenshots must be an array`);
      else
        t.screenshots.forEach((s, j) => {
          if (!s || typeof s.filename !== 'string' || !/^[\w.-]+$/.test(s.filename))
            errors.push(`${where}: screenshot ${j + 1} has an invalid filename`);
          else
            shots.push({
              filename: s.filename,
              label: SHOT_LABELS.includes(s.label) ? s.label : 'Other',
              caption: typeof s.caption === 'string' ? s.caption : null,
            });
        });
    }
    trades.push({
      ...value,
      id: Number.isInteger(t?.id) && t.id > 0 && !seenIds.has(t.id) ? (seenIds.add(t.id), t.id) : undefined,
      status,
      is_demo: !!t?.is_demo,
      created_at: typeof t?.created_at === 'string' ? t.created_at : undefined,
      screenshots: shots,
    });
  });

  const tags = (json.tags || []).map((x) => (typeof x === 'string' ? x : x?.name)).filter((x) => typeof x === 'string' && x.trim());
  const settings = {};
  if (json.settings && typeof json.settings === 'object') {
    if (CURRENCIES.includes(json.settings.default_currency)) settings.default_currency = json.settings.default_currency;
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 30).concat(errors.length > 30 ? [`…and ${errors.length - 30} more`] : []) };
  return { ok: true, errors: [], data: { trades, tags: [...new Set(tags)], settings } };
}
