/**
 * Watchlist logic (pure). Dates are US market dates (America/New_York), stored as YYYY-MM-DD.
 */
import { daysBetween } from './calc';

export interface Level {
  kind: 'R' | 'S';
  /** As typed: "265-266", "248.5", "16.0". */
  price: string;
  note: string | null;
}

export interface WatchItem {
  id: string;
  ticker: string;
  levels: Level[];
  gex_date: string | null;
  gex_note: string | null;
  earnings_date: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

/** Today's date on the US market calendar (New York), whatever the local time zone. */
export function marketToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const PRICE = String.raw`\d+(?:\.\d+)?`;
const LEVEL_RE = new RegExp(String.raw`^([RS])\s*(${PRICE}(?:\s*-\s*${PRICE})?)\s*(?:\((.*)\)|[:—–]\s*(.*))?$`, 'i');

/**
 * Parse "R 265-266 · S 248.5-250 (gap fill) · S 236". Separators: · , ; or new line.
 * A note goes in brackets or after a colon. Returns levels or the first bad chunk.
 */
export function parseLevels(text: string): { levels: Level[] } | { error: string } {
  const levels: Level[] = [];
  for (const raw of text.split(/[·,;\n]/)) {
    const chunk = raw.trim();
    if (!chunk) continue;
    const m = LEVEL_RE.exec(chunk);
    if (!m) return { error: `Can't read "${chunk}". Use e.g. R 265-266 or S 236 (note)` };
    const [lo, hi] = m[2].split('-').map((x) => x.trim());
    if (hi !== undefined && Number(hi) < Number(lo)) return { error: `"${chunk}": put the lower price first` };
    const note = (m[3] ?? m[4] ?? '').trim();
    levels.push({ kind: m[1].toUpperCase() as 'R' | 'S', price: hi === undefined ? lo : `${lo}-${hi}`, note: note || null });
  }
  return { levels: sortLevels(levels) };
}

const top = (l: Level) => Math.max(...l.price.split('-').map(Number));

/** Price ladder from the top: resistances, then supports, each highest first. */
export function sortLevels(levels: Level[]): Level[] {
  return [...levels].sort((a, b) => (a.kind === b.kind ? top(b) - top(a) : a.kind === 'R' ? -1 : 1));
}

export function formatLevel(l: Level): string {
  return `${l.kind} ${l.price}${l.note ? ` (${l.note})` : ''}`;
}

export function formatLevels(levels: Level[]): string {
  return sortLevels(levels).map(formatLevel).join(' · ');
}

/** Days from today to the date (negative = past). */
export function daysUntil(date: string | null, today: string): number | null {
  return date ? daysBetween(today, date) : null;
}

/** GEX recheck is due when its date is today or past. */
export function gexDue(item: Pick<WatchItem, 'gex_date'>, today: string): boolean {
  return !!item.gex_date && item.gex_date <= today;
}

/** Earnings within 14 days (and not already past). */
export function earningsSoon(item: Pick<WatchItem, 'earnings_date'>, today: string): boolean {
  const d = daysUntil(item.earnings_date, today);
  return d != null && d >= 0 && d <= 14;
}

/** Sort by the sooner of GEX recheck or earnings; tickers with neither date go last, then A-Z. */
export function sortWatchlist<T extends Pick<WatchItem, 'gex_date' | 'earnings_date' | 'ticker'>>(items: T[]): T[] {
  const key = (i: T) => [i.gex_date, i.earnings_date].filter(Boolean).sort()[0] ?? '9999-12-31';
  return [...items].sort((a, b) => key(a).localeCompare(key(b)) || a.ticker.localeCompare(b.ticker));
}

/** "Oct 16" from YYYY-MM-DD (no time-zone shifting). */
export function shortDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function relDays(n: number): string {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n > 0) return `in ${n}d`;
  return `${-n}d ago`;
}

/** Initial watchlist (written once per account). */
export const WATCHLIST_SEED: Omit<WatchItem, 'id' | 'created_at' | 'updated_at' | 'archived'>[] = [
  {
    ticker: 'AMZN',
    levels: [
      { kind: 'R', price: '265-266', note: null },
      { kind: 'S', price: '248.5-250', note: null },
      { kind: 'S', price: '236', note: null },
    ],
    gex_date: '2026-10-16',
    gex_note: 'after monthly expiry',
    earnings_date: '2026-10-29',
  },
  {
    ticker: 'SOFI',
    levels: [
      { kind: 'R', price: '18', note: null },
      { kind: 'R', price: '16.0', note: null },
      { kind: 'S', price: '15.5', note: null },
      { kind: 'S', price: '14.88', note: null },
    ],
    gex_date: null,
    gex_note: 'before any entry',
    earnings_date: '2026-10-27',
  },
];
