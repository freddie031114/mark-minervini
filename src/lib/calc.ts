/**
 * Pure trade calculations. No I/O, no dates-from-the-clock unless passed in.
 */

const OPTION_STRUCTURES = new Set([
  'Long Call',
  'Long Put',
  'Call Spread',
  'Put Spread',
  'LEAP Call',
]);

/** Structures that are option trades (multiplier 100). "Other" is treated as stock-like. */
export function isOption(structure: string): boolean {
  return OPTION_STRUCTURES.has(structure);
}

/** Spreads (and Other) can be opened for a net debit or a net credit. */
export function canBeCredit(structure: string): boolean {
  return structure === 'Call Spread' || structure === 'Put Spread' || structure === 'Other';
}

export function multiplier(structure: string): number {
  return isOption(structure) ? 100 : 1;
}

export interface CalcInput {
  structure: string;
  is_credit?: boolean;
  entry_price: number;
  quantity: number;
  exit_price?: number | null;
  stop_price?: number | null;
  fees?: number | null;
  entry_date?: string | null;
  exit_date?: string | null;
}

/** True when profit comes from the price falling: credit trades and stock shorts. */
export function isShortSide(t: Pick<CalcInput, 'structure' | 'is_credit'>): boolean {
  return t.structure === 'Stock Short' || (!!t.is_credit && canBeCredit(t.structure));
}

/** Net P&L after fees, or null if the trade has no exit price. */
export function pnl(t: CalcInput): number | null {
  if (t.exit_price == null || !Number.isFinite(t.exit_price)) return null;
  const m = multiplier(t.structure);
  const diff = isShortSide(t) ? t.entry_price - t.exit_price : t.exit_price - t.entry_price;
  const gross = diff * t.quantity * m;
  return round2(gross - (t.fees ?? 0));
}

/** Dollar risk defined by the stop, or null if no stop / zero distance. */
export function riskAmount(t: CalcInput): number | null {
  if (t.stop_price == null || !Number.isFinite(t.stop_price)) return null;
  const r = Math.abs(t.entry_price - t.stop_price) * t.quantity * multiplier(t.structure);
  return r > 0 ? r : null;
}

/**
 * P&L as a fraction (0.25 = 25%).
 * Debit trades (incl. stock short): relative to entry cost.
 * Credit trades: relative to stop-defined risk, blank without a stop.
 */
export function pnlPct(t: CalcInput): number | null {
  const p = pnl(t);
  if (p == null) return null;
  if (t.is_credit && canBeCredit(t.structure)) {
    const risk = riskAmount(t);
    return risk == null ? null : p / risk;
  }
  const basis = t.entry_price * t.quantity * multiplier(t.structure);
  return basis > 0 ? p / basis : null;
}

/** R-multiple; only when a stop was entered. */
export function rMultiple(t: CalcInput): number | null {
  const p = pnl(t);
  const risk = riskAmount(t);
  if (p == null || risk == null) return null;
  return p / risk;
}

function parseDay(d: string): number {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b) - parseDay(a)) / 86_400_000);
}

/** Holding period: entry to exit, or entry to `today` for an open trade. */
export function holdingDays(t: Pick<CalcInput, 'entry_date' | 'exit_date'>, today: string): number | null {
  if (!t.entry_date) return null;
  return Math.max(0, daysBetween(t.entry_date, t.exit_date || today));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ---------------- Aggregate stats ---------------- */

export interface Summary {
  count: number;
  wins: number;
  losses: number;
  totalPnl: number;
  winRate: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  expectancy: number | null;
  profitFactor: number | null; // Infinity when there are wins and no losses
}

/** Summary over a list of P&L values (closed trades). Breakeven counts as neither win nor loss. */
export function summarize(pnls: number[]): Summary {
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = losses.reduce((a, b) => a + b, 0);
  const total = grossWin + grossLoss;
  return {
    count: pnls.length,
    wins: wins.length,
    losses: losses.length,
    totalPnl: round2(total),
    winRate: pnls.length ? wins.length / pnls.length : null,
    avgWin: wins.length ? grossWin / wins.length : null,
    avgLoss: losses.length ? grossLoss / losses.length : null,
    expectancy: pnls.length ? total / pnls.length : null,
    profitFactor: losses.length ? grossWin / Math.abs(grossLoss) : wins.length ? Infinity : null,
  };
}

/** Cumulative P&L ordered by exit date. */
export function equityCurve(items: { date: string; pnl: number }[]): { date: string; equity: number; pnl: number }[] {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  let eq = 0;
  return sorted.map((i) => {
    eq += i.pnl;
    return { date: i.date, pnl: i.pnl, equity: round2(eq) };
  });
}

/** Group values by key and summarise each group. */
export function breakdown<T>(items: T[], key: (t: T) => string | null, value: (t: T) => number) {
  const groups = new Map<string, number[]>();
  for (const it of items) {
    const k = key(it) ?? '(none)';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(value(it));
  }
  return [...groups.entries()].map(([group, pnls]) => ({ group, ...summarize(pnls) }));
}

/* ---------------- Input validation helpers ---------------- */

/** Parse a user-typed number. Empty -> null; garbage -> NaN. */
export function parseNum(s: string | number | null | undefined): number | null {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  const t = s.trim().replace(/,/g, '').replace(/^\$/, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
