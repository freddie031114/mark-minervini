import { describe, it, expect } from 'vitest';
import {
  multiplier,
  isOption,
  pnl,
  pnlPct,
  rMultiple,
  holdingDays,
  daysBetween,
  summarize,
  equityCurve,
  breakdown,
  parseNum,
} from './calc';

describe('multiplier', () => {
  it('is 100 for option structures', () => {
    for (const s of ['Long Call', 'Long Put', 'Call Spread', 'Put Spread', 'LEAP Call']) {
      expect(multiplier(s)).toBe(100);
      expect(isOption(s)).toBe(true);
    }
  });
  it('is 1 for stock and Other', () => {
    expect(multiplier('Stock Long')).toBe(1);
    expect(multiplier('Stock Short')).toBe(1);
    expect(multiplier('Other')).toBe(1);
  });
});

describe('pnl', () => {
  it('stock long: (exit - entry) * qty', () => {
    expect(pnl({ structure: 'Stock Long', entry_price: 10, quantity: 100, exit_price: 12 })).toBe(200);
    expect(pnl({ structure: 'Stock Long', entry_price: 10, quantity: 100, exit_price: 9 })).toBe(-100);
  });

  it('stock short: (entry - exit) * qty', () => {
    expect(pnl({ structure: 'Stock Short', entry_price: 50, quantity: 10, exit_price: 40 })).toBe(100);
    expect(pnl({ structure: 'Stock Short', entry_price: 50, quantity: 10, exit_price: 55 })).toBe(-50);
  });

  it('long option uses the 100 multiplier', () => {
    expect(pnl({ structure: 'Long Call', entry_price: 2.5, quantity: 3, exit_price: 4 })).toBe(450);
    expect(pnl({ structure: 'LEAP Call', entry_price: 20, quantity: 1, exit_price: 15 })).toBe(-500);
  });

  it('debit spread', () => {
    expect(pnl({ structure: 'Call Spread', entry_price: 4.2, quantity: 2, exit_price: 7.5 })).toBe(660);
  });

  it('credit spread: (entry - exit) * qty * 100', () => {
    expect(pnl({ structure: 'Put Spread', is_credit: true, entry_price: 1.5, quantity: 2, exit_price: 0.3 })).toBe(240);
    expect(pnl({ structure: 'Put Spread', is_credit: true, entry_price: 1.5, quantity: 2, exit_price: 3 })).toBe(-300);
  });

  it('ignores is_credit on structures that cannot be credit', () => {
    expect(pnl({ structure: 'Long Call', is_credit: true, entry_price: 1, quantity: 1, exit_price: 2 })).toBe(100);
  });

  it('subtracts fees', () => {
    expect(pnl({ structure: 'Stock Long', entry_price: 10, quantity: 100, exit_price: 12, fees: 19.9 })).toBe(180.1);
    expect(pnl({ structure: 'Long Put', entry_price: 1, quantity: 1, exit_price: 1, fees: 5 })).toBe(-5);
  });

  it('is null for open trades', () => {
    expect(pnl({ structure: 'Stock Long', entry_price: 10, quantity: 1 })).toBeNull();
    expect(pnl({ structure: 'Stock Long', entry_price: 10, quantity: 1, exit_price: null })).toBeNull();
  });

  it('avoids float noise', () => {
    expect(pnl({ structure: 'Call Spread', entry_price: 0.1, quantity: 3, exit_price: 0.3 })).toBe(60);
  });
});

describe('pnlPct', () => {
  it('debit: pnl / cost basis', () => {
    expect(pnlPct({ structure: 'Long Call', entry_price: 2, quantity: 1, exit_price: 3 })).toBeCloseTo(0.5);
    expect(pnlPct({ structure: 'Stock Long', entry_price: 10, quantity: 10, exit_price: 8 })).toBeCloseTo(-0.2);
  });
  it('stock short: pnl / entry notional', () => {
    expect(pnlPct({ structure: 'Stock Short', entry_price: 50, quantity: 10, exit_price: 45 })).toBeCloseTo(0.1);
  });
  it('includes fees', () => {
    expect(pnlPct({ structure: 'Stock Long', entry_price: 10, quantity: 10, exit_price: 11, fees: 5 })).toBeCloseTo(0.05);
  });
  it('credit without stop is blank', () => {
    expect(pnlPct({ structure: 'Call Spread', is_credit: true, entry_price: 1, quantity: 1, exit_price: 0.5 })).toBeNull();
  });
  it('credit with stop: pnl / stop risk', () => {
    // risk = |1 - 3| * 1 * 100 = 200; pnl = 50
    expect(
      pnlPct({ structure: 'Call Spread', is_credit: true, entry_price: 1, quantity: 1, exit_price: 0.5, stop_price: 3 }),
    ).toBeCloseTo(0.25);
  });
  it('zero entry price gives blank, not Infinity', () => {
    expect(pnlPct({ structure: 'Stock Long', entry_price: 0, quantity: 10, exit_price: 1 })).toBeNull();
  });
  it('open trade is blank', () => {
    expect(pnlPct({ structure: 'Stock Long', entry_price: 10, quantity: 10 })).toBeNull();
  });
});

describe('rMultiple', () => {
  it('is null without a stop', () => {
    expect(rMultiple({ structure: 'Stock Long', entry_price: 10, quantity: 100, exit_price: 12 })).toBeNull();
  });
  it('long stock: 2R win', () => {
    expect(rMultiple({ structure: 'Stock Long', entry_price: 10, quantity: 100, exit_price: 12, stop_price: 9 })).toBeCloseTo(2);
  });
  it('-1R stop out', () => {
    expect(rMultiple({ structure: 'Stock Long', entry_price: 10, quantity: 100, exit_price: 9, stop_price: 9 })).toBeCloseTo(-1);
  });
  it('options apply multiplier on both sides', () => {
    // risk = 1 * 2 * 100 = 200, pnl = 1.5 * 2 * 100 = 300
    expect(rMultiple({ structure: 'Long Call', entry_price: 3, quantity: 2, exit_price: 4.5, stop_price: 2 })).toBeCloseTo(1.5);
  });
  it('stock short with stop above entry', () => {
    expect(rMultiple({ structure: 'Stock Short', entry_price: 50, quantity: 10, exit_price: 44, stop_price: 52 })).toBeCloseTo(3);
  });
  it('credit spread', () => {
    expect(
      rMultiple({ structure: 'Put Spread', is_credit: true, entry_price: 1, quantity: 1, exit_price: 2, stop_price: 2 }),
    ).toBeCloseTo(-1);
  });
  it('includes fees', () => {
    expect(
      rMultiple({ structure: 'Stock Long', entry_price: 10, quantity: 100, exit_price: 12, stop_price: 9, fees: 20 }),
    ).toBeCloseTo(1.8);
  });
  it('stop equal to entry gives null, not Infinity', () => {
    expect(rMultiple({ structure: 'Stock Long', entry_price: 10, quantity: 1, exit_price: 12, stop_price: 10 })).toBeNull();
  });
  it('zero entry price with a stop still works', () => {
    expect(rMultiple({ structure: 'Stock Long', entry_price: 0, quantity: 1, exit_price: 1, stop_price: 0.5 })).toBeCloseTo(2);
  });
});

describe('holding period', () => {
  it('counts days between entry and exit', () => {
    expect(holdingDays({ entry_date: '2026-01-01', exit_date: '2026-01-31' }, '2026-06-01')).toBe(30);
  });
  it('uses today for open trades', () => {
    expect(holdingDays({ entry_date: '2026-10-01', exit_date: null }, '2026-10-10')).toBe(9);
  });
  it('same-day is 0, and crosses DST without drift', () => {
    expect(holdingDays({ entry_date: '2026-03-03', exit_date: '2026-03-03' }, '2026-03-03')).toBe(0);
    expect(daysBetween('2026-04-01', '2026-04-08')).toBe(7);
    expect(daysBetween('2026-10-01', '2026-10-08')).toBe(7);
  });
  it('days to expiry can be negative', () => {
    expect(daysBetween('2026-10-10', '2026-10-07')).toBe(-3);
  });
});

describe('summarize', () => {
  it('computes core stats', () => {
    const s = summarize([100, -50, 200, -50, 0]);
    expect(s.count).toBe(5);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(2);
    expect(s.totalPnl).toBe(200);
    expect(s.winRate).toBeCloseTo(0.4);
    expect(s.avgWin).toBe(150);
    expect(s.avgLoss).toBe(-50);
    expect(s.expectancy).toBe(40);
    expect(s.profitFactor).toBe(3);
  });
  it('handles empty and no-loss sets', () => {
    expect(summarize([]).winRate).toBeNull();
    expect(summarize([]).profitFactor).toBeNull();
    expect(summarize([10]).profitFactor).toBe(Infinity);
  });
});

describe('equityCurve and breakdown', () => {
  it('accumulates by date', () => {
    const c = equityCurve([
      { date: '2026-02-01', pnl: -20 },
      { date: '2026-01-01', pnl: 100 },
    ]);
    expect(c.map((p) => p.equity)).toEqual([100, 80]);
  });
  it('groups and labels missing keys', () => {
    const b = breakdown(
      [
        { k: 'A', p: 10 },
        { k: null, p: -5 },
        { k: 'A', p: -2 },
      ],
      (x) => x.k,
      (x) => x.p,
    );
    expect(b.find((g) => g.group === 'A')!.count).toBe(2);
    expect(b.find((g) => g.group === '(none)')!.totalPnl).toBe(-5);
  });
});

describe('parseNum', () => {
  it('parses user input', () => {
    expect(parseNum('')).toBeNull();
    expect(parseNum(' 1,234.5 ')).toBe(1234.5);
    expect(parseNum('$12')).toBe(12);
    expect(Number.isNaN(parseNum('abc'))).toBe(true);
  });
});
