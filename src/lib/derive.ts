import { holdingDays, pnl, pnlPct, rMultiple, daysBetween } from './calc';
import { today } from './format';
import type { Trade } from './types';

export interface Derived {
  pnl: number | null;
  pnlPct: number | null;
  r: number | null;
  days: number | null;
  dte: number | null;
  outcome: 'Win' | 'Loss' | 'Breakeven' | null;
}

export function derive(t: Trade, now = today()): Derived {
  const p = pnl(t);
  return {
    pnl: p,
    pnlPct: pnlPct(t),
    r: rMultiple(t),
    days: holdingDays(t, now),
    dte: t.expiry ? daysBetween(now, t.expiry) : null,
    outcome: p == null ? null : p > 0 ? 'Win' : p < 0 ? 'Loss' : 'Breakeven',
  };
}
