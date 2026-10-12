export const STRUCTURES = [
  'Stock Long',
  'Stock Short',
  'Long Call',
  'Long Put',
  'Call Spread',
  'Put Spread',
  'LEAP Call',
  'Other',
] as const;
export type Structure = (typeof STRUCTURES)[number];

export const GRADES = ['A', 'B', 'C'] as const;
export const EMOTIONS = ['Calm', 'Confident', 'FOMO', 'Revenge', 'Bored', 'Anxious'] as const;
export const THESIS_RIGHT = ['Yes', 'Partly', 'No'] as const;
export const SHOT_LABELS = ['Entry', 'Exit', 'Gamma', 'Other'] as const;
export type ShotLabel = (typeof SHOT_LABELS)[number];

/** Screenshot metadata kept on the trade. The image itself lives in its own document. */
export interface Screenshot {
  id: string;
  label: ShotLabel;
  caption: string | null;
  created_at: string;
}

export interface Trade {
  id: string;
  ticker: string;
  structure: Structure;
  is_credit: boolean;
  entry_price: number;
  quantity: number;
  entry_date: string; // YYYY-MM-DD
  setup_tag: string | null;
  grade: string | null;
  planned: boolean | null; // true = planned, false = impulse
  emotion: string | null;
  thesis: string | null;
  legs: string | null;
  expiry: string | null;
  stop_price: number | null;
  target_price: number | null;
  position_pct: number | null;
  gamma_notes: string | null;
  notes: string | null;
  status: 'open' | 'closed';
  exit_price: number | null;
  exit_date: string | null;
  fees: number;
  thesis_right: string | null;
  followed_plan: boolean | null;
  change_note: string | null;
  is_demo: boolean;
  /** id from the old local (SQLite) journal, so importing twice never duplicates. */
  legacy_id?: number | null;
  created_at: string;
  updated_at: string;
  screenshots: Screenshot[];
}

export interface Settings {
  tags: string[];
  last_structure?: Structure;
  last_setup_tag?: string | null;
}

export const SEED_TAGS = ['Breakout', 'Pullback', 'Base/VCP', 'Earnings', 'Catalyst', 'Reversal', 'Thesis/LEAP'];
