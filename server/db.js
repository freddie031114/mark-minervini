// SQLite access. Prefers better-sqlite3; falls back to Node's built-in node:sqlite.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function openDatabase(file) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(file);
    return { db, driver: 'better-sqlite3' };
  } catch (err) {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(file);
    return { db, driver: 'node:sqlite' };
  }
}

export const SEED_TAGS = ['Breakout', 'Pullback', 'Base/VCP', 'Earnings', 'Catalyst', 'Reversal', 'Thesis/LEAP'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trades (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker        TEXT    NOT NULL,
  structure     TEXT    NOT NULL,
  is_credit     INTEGER NOT NULL DEFAULT 0,
  entry_price   REAL    NOT NULL,
  quantity      REAL    NOT NULL,
  entry_date    TEXT    NOT NULL,
  setup_tag     TEXT,
  grade         TEXT,
  planned       INTEGER,
  emotion       TEXT,
  thesis        TEXT,
  legs          TEXT,
  expiry        TEXT,
  stop_price    REAL,
  target_price  REAL,
  position_pct  REAL,
  gamma_notes   TEXT,
  notes         TEXT,
  status        TEXT    NOT NULL DEFAULT 'open',
  exit_price    REAL,
  exit_date     TEXT,
  fees          REAL    NOT NULL DEFAULT 0,
  thesis_right  TEXT,
  followed_plan INTEGER,
  change_note   TEXT,
  is_demo       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE TABLE IF NOT EXISTS screenshots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id   INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  filename   TEXT    NOT NULL,
  label      TEXT    NOT NULL DEFAULT 'Other',
  caption    TEXT,
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shots_trade ON screenshots(trade_id);
CREATE TABLE IF NOT EXISTS tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

// Column lists: what a client may write.
export const ENTRY_FIELDS = [
  'ticker', 'structure', 'is_credit', 'entry_price', 'quantity', 'entry_date',
  'setup_tag', 'grade', 'planned', 'emotion', 'thesis', 'legs', 'expiry', 'stop_price',
  'target_price', 'position_pct', 'gamma_notes', 'notes',
];
export const CLOSE_FIELDS = ['exit_price', 'exit_date', 'fees', 'thesis_right', 'followed_plan', 'change_note'];
export const ALL_FIELDS = [...ENTRY_FIELDS, 'status', ...CLOSE_FIELDS];
const BOOL_FIELDS = ['is_credit', 'planned', 'followed_plan', 'is_demo'];

const now = () => new Date().toISOString();

export function createStore(dataDir) {
  fs.mkdirSync(path.join(dataDir, 'screenshots'), { recursive: true });
  const { db, driver } = openDatabase(path.join(dataDir, 'journal.db'));
  // Rollback-journal mode (not WAL): every commit lands in journal.db itself, so a synced
  // folder (Dropbox, iCloud, …) never holds a database whose recent writes sit in a side file.
  db.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  if (db.prepare('SELECT COUNT(*) AS n FROM tags').get().n === 0) {
    const ins = db.prepare('INSERT INTO tags (name, sort_order) VALUES (?, ?)');
    SEED_TAGS.forEach((t, i) => ins.run(t, i));
  }

  // node:sqlite has no db.transaction helper, so do it by hand.
  function tx(fn) {
    db.exec('BEGIN');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  // SQLite can't bind booleans/undefined portably.
  const toDb = (k, v) => {
    if (v === undefined) return null;
    if (BOOL_FIELDS.includes(k)) return v == null ? (k === 'is_credit' || k === 'is_demo' ? 0 : null) : v ? 1 : 0;
    return v;
  };

  function rowToTrade(r, shots) {
    const t = { ...r };
    t.is_credit = !!r.is_credit;
    t.is_demo = !!r.is_demo;
    t.planned = r.planned == null ? null : !!r.planned;
    t.followed_plan = r.followed_plan == null ? null : !!r.followed_plan;
    t.screenshots = shots;
    return t;
  }

  function listTrades() {
    const rows = db.prepare('SELECT * FROM trades ORDER BY entry_date DESC, id DESC').all();
    const shots = db.prepare('SELECT * FROM screenshots ORDER BY id').all();
    const byTrade = new Map();
    for (const s of shots) {
      if (!byTrade.has(s.trade_id)) byTrade.set(s.trade_id, []);
      byTrade.get(s.trade_id).push({ ...s });
    }
    return rows.map((r) => rowToTrade(r, byTrade.get(r.id) || []));
  }

  function getTrade(id) {
    const r = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
    if (!r) return null;
    const shots = db.prepare('SELECT * FROM screenshots WHERE trade_id = ? ORDER BY id').all(id).map((s) => ({ ...s }));
    return rowToTrade(r, shots);
  }

  function insertTrade(t, { isDemo = false, createdAt, id } = {}) {
    const cols = ALL_FIELDS.filter((k) => t[k] !== undefined);
    if (id != null) cols.unshift('id');
    const v = (k) => (k === 'id' ? id : toDb(k, t[k]));
    const ts = createdAt || now();
    const sql = `INSERT INTO trades (${[...cols, 'is_demo', 'created_at', 'updated_at'].join(', ')})
                 VALUES (${[...cols, 'a', 'b', 'c'].map(() => '?').join(', ')})`;
    const info = db.prepare(sql).run(...cols.map(v), isDemo ? 1 : 0, ts, ts);
    return Number(info.lastInsertRowid);
  }

  function updateTrade(id, patch) {
    const cols = ALL_FIELDS.filter((k) => patch[k] !== undefined);
    if (!cols.length) return;
    const sql = `UPDATE trades SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`;
    db.prepare(sql).run(...cols.map((k) => toDb(k, patch[k])), now(), id);
  }

  function deleteTrade(id) {
    const files = db.prepare('SELECT filename FROM screenshots WHERE trade_id = ?').all(id).map((s) => s.filename);
    db.prepare('DELETE FROM trades WHERE id = ?').run(id);
    return files;
  }

  function addScreenshot(tradeId, filename, label, caption) {
    const info = db
      .prepare('INSERT INTO screenshots (trade_id, filename, label, caption, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(tradeId, filename, label, caption ?? null, now());
    return db.prepare('SELECT * FROM screenshots WHERE id = ?').get(Number(info.lastInsertRowid));
  }

  function getScreenshot(id) {
    return db.prepare('SELECT * FROM screenshots WHERE id = ?').get(id);
  }

  function deleteScreenshot(id) {
    db.prepare('DELETE FROM screenshots WHERE id = ?').run(id);
  }

  // Tags
  const listTags = () => db.prepare('SELECT id, name FROM tags ORDER BY sort_order, id').all().map((r) => ({ ...r }));
  function addTag(name) {
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM tags').get().m;
    db.prepare('INSERT INTO tags (name, sort_order) VALUES (?, ?)').run(name, max + 1);
  }
  function renameTag(id, name) {
    tx(() => {
      const old = db.prepare('SELECT name FROM tags WHERE id = ?').get(id);
      if (!old) return;
      db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, id);
      db.prepare('UPDATE trades SET setup_tag = ? WHERE setup_tag = ?').run(name, old.name);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'last_setup_tag' AND value = ?").run(name, old.name);
    });
  }
  const deleteTag = (id) => db.prepare('DELETE FROM tags WHERE id = ?').run(id);

  // Settings (stored as JSON strings)
  function getSettings() {
    const out = {};
    for (const r of db.prepare('SELECT key, value FROM settings').all()) {
      try {
        out[r.key] = JSON.parse(r.value);
      } catch {
        out[r.key] = r.value;
      }
    }
    return out;
  }
  function setSettings(obj) {
    const up = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );
    for (const [k, v] of Object.entries(obj)) up.run(k, JSON.stringify(v ?? null));
  }

  // Demo / restore
  function demoScreenshotFiles() {
    return db
      .prepare('SELECT s.filename FROM screenshots s JOIN trades t ON t.id = s.trade_id WHERE t.is_demo = 1')
      .all()
      .map((r) => r.filename);
  }
  const clearDemo = () => db.prepare('DELETE FROM trades WHERE is_demo = 1').run();

  function replaceAll(data) {
    tx(() => {
      db.exec('DELETE FROM screenshots; DELETE FROM trades; DELETE FROM tags;');
      const insTag = db.prepare('INSERT INTO tags (name, sort_order) VALUES (?, ?)');
      data.tags.forEach((name, i) => insTag.run(name, i));
      if (data.settings) setSettings(data.settings);
      for (const t of data.trades) {
        const id = insertTrade(t, { isDemo: !!t.is_demo, createdAt: t.created_at, id: t.id });
        for (const s of t.screenshots || []) addScreenshot(id, s.filename, s.label, s.caption);
      }
    });
  }

  return {
    driver, close: () => db.close(), tx, listTrades, getTrade, insertTrade, updateTrade, deleteTrade,
    addScreenshot, getScreenshot, deleteScreenshot,
    listTags, addTag, renameTag, deleteTag, getSettings, setSettings,
    demoScreenshotFiles, clearDemo, replaceAll,
  };
}
