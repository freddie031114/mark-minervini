import { derive } from './derive';
import type { Trade } from './types';

const COLUMNS: [string, (t: Trade, d: ReturnType<typeof derive>) => unknown][] = [
  ['id', (t) => t.id],
  ['ticker', (t) => t.ticker],
  ['structure', (t) => t.structure],
  ['debit_credit', (t) => (t.is_credit ? 'credit' : 'debit')],
  ['status', (t) => t.status],
  ['entry_date', (t) => t.entry_date],
  ['entry_price', (t) => t.entry_price],
  ['quantity', (t) => t.quantity],
  ['setup_tag', (t) => t.setup_tag],
  ['grade', (t) => t.grade],
  ['planned_impulse', (t) => (t.planned == null ? '' : t.planned ? 'planned' : 'impulse')],
  ['emotion', (t) => t.emotion],
  ['thesis', (t) => t.thesis],
  ['legs', (t) => t.legs],
  ['expiry', (t) => t.expiry],
  ['stop_price', (t) => t.stop_price],
  ['target_price', (t) => t.target_price],
  ['position_pct', (t) => t.position_pct],
  ['gamma_notes', (t) => t.gamma_notes],
  ['notes', (t) => t.notes],
  ['exit_date', (t) => t.exit_date],
  ['exit_price', (t) => t.exit_price],
  ['fees', (t) => t.fees],
  ['pnl', (_t, d) => d.pnl],
  ['pnl_pct', (_t, d) => (d.pnlPct == null ? null : +(d.pnlPct * 100).toFixed(2))],
  ['r_multiple', (_t, d) => (d.r == null ? null : +d.r.toFixed(2))],
  ['holding_days', (_t, d) => d.days],
  ['thesis_right', (t) => t.thesis_right],
  ['followed_plan', (t) => (t.followed_plan == null ? '' : t.followed_plan ? 'yes' : 'no')],
  ['what_id_change', (t) => t.change_note],
  ['screenshots', (t) => t.screenshots.map((s) => s.filename).join(';')],
  ['is_demo', (t) => (t.is_demo ? 1 : 0)],
];

const esc = (v: unknown) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function tradesToCsv(trades: Trade[]): string {
  const lines = [COLUMNS.map((c) => c[0]).join(',')];
  for (const t of trades) {
    const d = derive(t);
    lines.push(COLUMNS.map(([, f]) => esc(f(t, d))).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
