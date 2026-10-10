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

export const CURRENCIES = ['AUD', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const GRADES = ['A', 'B', 'C'] as const;
export const EMOTIONS = ['Calm', 'Confident', 'FOMO', 'Revenge', 'Bored', 'Anxious'] as const;
export const THESIS_RIGHT = ['Yes', 'Partly', 'No'] as const;
export const SHOT_LABELS = ['Entry', 'Exit', 'Gamma', 'Other'] as const;
export type ShotLabel = (typeof SHOT_LABELS)[number];

export interface Screenshot {
  id: number;
  trade_id: number;
  filename: string;
  label: ShotLabel;
  caption: string | null;
  created_at: string;
}

export interface Trade {
  id: number;
  ticker: string;
  structure: Structure;
  currency: Currency;
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
  created_at: string;
  updated_at: string;
  screenshots: Screenshot[];
}

export interface Tag {
  id: number;
  name: string;
}

export interface Settings {
  default_currency: Currency;
  last_structure?: Structure;
  last_currency?: Currency;
  last_setup_tag?: string | null;
}
