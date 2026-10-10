// Deterministic demo data. Every trade is flagged is_demo = 1 so it can be wiped safely.
import fs from 'node:fs';
import path from 'node:path';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const day = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);

const US = [['NVDA', 130], ['TSLA', 240], ['AAPL', 210], ['AMD', 150], ['META', 560], ['SPY', 570], ['PLTR', 45], ['MSFT', 420], ['AMZN', 185], ['CRWD', 330]];
const TAGS = ['Breakout', 'Pullback', 'Base/VCP', 'Earnings', 'Catalyst', 'Reversal', 'Thesis/LEAP'];
const EMO = ['Calm', 'Confident', 'FOMO', 'Revenge', 'Bored', 'Anxious'];

function placeholderSvg(ticker, label, up) {
  const pts = [];
  let y = 120;
  for (let x = 0; x <= 600; x += 20) {
    y += Math.sin(x / 37) * 8 + (up ? -2 : 2);
    pts.push(`${x},${Math.max(20, Math.min(280, y)).toFixed(0)}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">
<rect width="640" height="320" fill="#18181b"/>
<polyline points="${pts.join(' ')}" transform="translate(20,0)" fill="none" stroke="${up ? '#34d399' : '#f87171'}" stroke-width="3"/>
<text x="24" y="40" fill="#e4e4e7" font-family="sans-serif" font-size="24">${ticker} — ${label} (demo)</text>
</svg>`;
}

export function buildDemo(today = new Date()) {
  const r = rng(42);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const trades = [];
  const N = 48;
  for (let i = 0; i < N; i++) {
    const [ticker, px] = pick(US);
    const sr = r();
    const structure =
      sr < 0.4 ? 'Stock Long' : sr < 0.48 ? 'Stock Short' : sr < 0.62 ? 'Call Spread' : sr < 0.72 ? 'Put Spread'
        : sr < 0.85 ? 'Long Call' : sr < 0.93 ? 'LEAP Call' : 'Long Put';
    const isOpt = !structure.startsWith('Stock');
    const isCredit = structure === 'Put Spread' && r() < 0.6;
    const grade = r() < 0.35 ? 'A' : r() < 0.6 ? 'B' : 'C';
    const planned = r() < 0.75;
    const emotion = planned ? pick(['Calm', 'Calm', 'Confident', 'Bored']) : pick(EMO);
    const tag = structure === 'LEAP Call' ? 'Thesis/LEAP' : pick(TAGS.slice(0, 6));
    // Edge: A/planned trades win more often.
    const winP = 0.35 + (grade === 'A' ? 0.25 : grade === 'B' ? 0.1 : 0) + (planned ? 0.1 : -0.1);
    const win = r() < winP;

    const entryDaysAgo = Math.floor(5 + (N - i) * 5.5 + r() * 4);
    const entryDate = addDays(today, -entryDaysAgo);
    const open = i >= N - 7;
    const hold = structure === 'LEAP Call' ? 30 + Math.floor(r() * 60) : 2 + Math.floor(r() * 18);

    let entry, qty, stop, target, legs = null, expiry = null;
    if (!isOpt) {
      entry = +(px * (0.9 + r() * 0.2)).toFixed(2);
      qty = Math.max(1, Math.round(10000 / entry / 5) * 5);
      const short = structure === 'Stock Short';
      stop = +(entry * (short ? 1.06 : 0.94)).toFixed(2);
      target = +(entry * (short ? 0.85 : 1.2)).toFixed(2);
    } else if (structure.includes('Spread')) {
      const k = Math.round(px / 5) * 5;
      legs = structure === 'Call Spread' ? `${k}/${k + 10}` : `${k}/${k - 10}`;
      entry = +(isCredit ? 1 + r() * 2 : 3 + r() * 4).toFixed(2);
      qty = 1 + Math.floor(r() * 4);
      stop = isCredit ? +(entry * 2).toFixed(2) : r() < 0.5 ? +(entry * 0.5).toFixed(2) : null;
      target = null;
      expiry = day(addDays(entryDate, 21 + Math.floor(r() * 30)));
    } else {
      const k = Math.round(px / 5) * 5;
      legs = String(k);
      entry = +(structure === 'LEAP Call' ? 20 + r() * 25 : 2 + r() * 6).toFixed(2);
      qty = 1 + Math.floor(r() * 3);
      stop = r() < 0.6 ? +(entry * 0.6).toFixed(2) : null;
      target = r() < 0.4 ? +(entry * 2).toFixed(2) : null;
      expiry = day(addDays(entryDate, structure === 'LEAP Call' ? 400 : 20 + Math.floor(r() * 40)));
    }
    if (open && expiry && isOpt && structure !== 'LEAP Call') {
      // Make some open options near expiry so the highlighting shows.
      expiry = day(addDays(today, [3, 9, 25, 40][i % 4]));
    }

    const t = {
      ticker, structure, is_credit: isCredit,
      entry_price: entry, quantity: qty, entry_date: day(entryDate),
      setup_tag: tag, grade, planned, emotion,
      thesis: `${tag} ${structure.startsWith('Stock') ? 'entry' : 'play'} on ${ticker}`,
      legs, expiry, stop_price: stop, target_price: target,
      position_pct: +(2 + r() * 8).toFixed(1),
      gamma_notes: isOpt && r() < 0.3 ? 'Large call wall above, dealers long gamma' : null,
      notes: null, status: 'open', fees: 0,
    };

    if (!open) {
      const move = win ? 0.04 + r() * 0.25 : -(0.02 + r() * 0.12);
      const shortSide = structure === 'Stock Short' || isCredit;
      let exit;
      if (isOpt && !isCredit) exit = Math.max(0, entry * (1 + move * 3));
      else if (isCredit) exit = Math.max(0, entry * (win ? 0.2 + r() * 0.5 : 1.5 + r()));
      else exit = entry * (1 + (shortSide ? -move : move));
      const thesisRight = win ? (r() < 0.8 ? 'Yes' : r() < 0.5 ? 'Partly' : 'No') : r() < 0.3 ? 'Yes' : r() < 0.5 ? 'Partly' : 'No';
      Object.assign(t, {
        status: 'closed',
        exit_price: +exit.toFixed(2),
        exit_date: day(addDays(entryDate, Math.min(hold, entryDaysAgo - 1))),
        fees: isOpt ? +(qty * 2 * 1.3).toFixed(2) : 2,
        thesis_right: thesisRight,
        followed_plan: planned ? r() < 0.8 : r() < 0.3,
        change_note: win ? (r() < 0.5 ? 'Size up on A setups' : null) : pick(['Respect the stop', 'Wait for confirmation', 'Smaller size', 'Skip impulse entries']),
      });
    }
    trades.push(t);
  }
  return trades;
}

/** Insert demo trades (plus a few placeholder chart images). */
export function loadDemo(store, shotsDir) {
  const trades = buildDemo();
  store.tx(() => {
    trades.forEach((t, i) => {
      const id = store.insertTrade(t, { isDemo: true });
      if (i % 6 === 0) {
        const up = t.status === 'open' || (t.exit_price ?? 0) >= t.entry_price;
        const labels = t.status === 'closed' ? ['Entry', 'Exit'] : ['Entry'];
        for (const label of labels) {
          const filename = `demo-${id}-${label.toLowerCase()}.svg`;
          fs.writeFileSync(path.join(shotsDir, filename), placeholderSvg(t.ticker, label, up));
          store.addScreenshot(id, filename, label, `${label} chart`);
        }
      }
    });
  });
  return trades.length;
}
