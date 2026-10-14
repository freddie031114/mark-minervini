import { describe, it, expect } from 'vitest';
import {
  marketToday, parseLevels, formatLevels, daysUntil, gexDue, earningsSoon, sortWatchlist, shortDate, relDays, WATCHLIST_SEED,
} from './watchlist';

describe('marketToday (US market date from Sydney)', () => {
  it('Sydney Thursday 9am is still Wednesday in New York', () => {
    // 2026-10-15 09:00 AEDT = 2026-10-14 22:00 UTC = 2026-10-14 18:00 EDT
    expect(marketToday(new Date('2026-10-14T22:00:00Z'))).toBe('2026-10-14');
  });
  it('rolls over at New York midnight, not Sydney midnight', () => {
    expect(marketToday(new Date('2026-10-15T03:59:00Z'))).toBe('2026-10-14'); // 23:59 EDT
    expect(marketToday(new Date('2026-10-15T04:00:00Z'))).toBe('2026-10-15'); // 00:00 EDT
  });
  it('handles US daylight saving end (EST)', () => {
    expect(marketToday(new Date('2026-11-10T04:30:00Z'))).toBe('2026-11-09'); // 23:30 EST
  });
});

describe('parseLevels / formatLevels', () => {
  it('parses the one-line format and keeps typed prices', () => {
    const r = parseLevels('R 265-266 · S 248.5-250 · S 236');
    expect('levels' in r && formatLevels(r.levels)).toBe('R 265-266 · S 248.5-250 · S 236');
  });
  it('accepts commas/new lines, lowercase, notes, and sorts as a price ladder', () => {
    const r = parseLevels('s 14.88, R 16.0\nS 15.5 (gap fill); r 18: prior high');
    expect('levels' in r && formatLevels(r.levels)).toBe('R 18 (prior high) · R 16.0 · S 15.5 (gap fill) · S 14.88');
  });
  it('empty input means no levels', () => {
    expect(parseLevels('  ')).toEqual({ levels: [] });
  });
  it('rejects junk and reversed ranges', () => {
    expect('error' in parseLevels('X 12')).toBe(true);
    expect('error' in parseLevels('R abc')).toBe(true);
    expect('error' in parseLevels('S 250-248')).toBe(true);
  });
});

describe('dates and flags', () => {
  const today = '2026-10-14';
  it('days until earnings', () => {
    expect(daysUntil('2026-10-29', today)).toBe(15);
    expect(daysUntil('2026-10-27', today)).toBe(13);
    expect(daysUntil(null, today)).toBeNull();
  });
  it('GEX due today or past only', () => {
    expect(gexDue({ gex_date: '2026-10-14' }, today)).toBe(true);
    expect(gexDue({ gex_date: '2026-10-10' }, today)).toBe(true);
    expect(gexDue({ gex_date: '2026-10-16' }, today)).toBe(false);
    expect(gexDue({ gex_date: null }, today)).toBe(false);
  });
  it('earnings soon = 0..14 days', () => {
    expect(earningsSoon({ earnings_date: '2026-10-28' }, today)).toBe(true); // 14
    expect(earningsSoon({ earnings_date: '2026-10-29' }, today)).toBe(false); // 15
    expect(earningsSoon({ earnings_date: '2026-10-14' }, today)).toBe(true); // today
    expect(earningsSoon({ earnings_date: '2026-10-13' }, today)).toBe(false); // already reported
  });
  it('sorts by the sooner of the two dates, undated last', () => {
    const items = [
      { ticker: 'NONE', gex_date: null, earnings_date: null },
      { ticker: 'SOFI', gex_date: null, earnings_date: '2026-10-27' },
      { ticker: 'AMZN', gex_date: '2026-10-16', earnings_date: '2026-10-29' },
      { ticker: 'LATE', gex_date: '2026-12-01', earnings_date: '2026-10-20' },
    ];
    expect(sortWatchlist(items).map((i) => i.ticker)).toEqual(['AMZN', 'LATE', 'SOFI', 'NONE']);
  });
  it('formats', () => {
    expect(shortDate('2026-10-16')).toBe('Oct 16');
    expect([relDays(0), relDays(1), relDays(13), relDays(-2)]).toEqual(['today', 'tomorrow', 'in 13d', '2d ago']);
  });
});

describe('seed', () => {
  it('matches the requested watchlist', () => {
    expect(WATCHLIST_SEED.map((s) => `${s.ticker}: ${formatLevels(s.levels)}`)).toEqual([
      'AMZN: R 265-266 · S 248.5-250 · S 236',
      'SOFI: R 18 · R 16.0 · S 15.5 · S 14.88',
    ]);
  });
});
