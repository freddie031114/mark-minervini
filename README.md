# Trading Journal

A fast, local, single-user trading journal for options (verticals, LEAPS) and stocks.
It has no accounts and no cloud: everything lives in one folder on your laptop.

## Run it

Requires Node.js 22 or newer.

```bash
npm install && npm start
```

Then open **http://localhost:3000**. `npm start` builds the front end and starts the server.
Later runs only need `npm start`. To skip the rebuild, use `npm run serve`.

To use a different port, set `PORT`, for example `PORT=4000 npm start`.

## Where your data lives

Everything is stored in one folder, `./data` by default:

```
data/
  journal.db        SQLite database (trades, tags, settings)
  screenshots/      image files referenced from the database
```

### Change the data folder

Set `JOURNAL_DATA_DIR` to point it anywhere, such as a synced folder:

```bash
JOURNAL_DATA_DIR=~/Dropbox/trading-journal npm start
```

On Windows PowerShell, run `$env:JOURNAL_DATA_DIR="C:\Users\me\Dropbox\trading-journal"; npm start`.

Relative paths are resolved from the project folder. Settings → Data folder shows the folder in use.

> If you use a synced folder, run the journal on one machine at a time. SQLite does not
> like two computers writing to the same file at once.

## Backing up

**Copy the whole data folder** (`journal.db` plus `screenshots/`) somewhere safe, ideally with the app stopped.
To restore, copy it back, or point `JOURNAL_DATA_DIR` at the copy.

In Settings you can also export:

- **Export CSV**: one row per trade, including computed P&L, P&L %, R and holding days, and
  screenshot filenames in a `screenshots` column. Use it with spreadsheets.
- **Export JSON**: a full restore point for trades, tags and default currency.
  **Import JSON** restores from it. The file is validated first, and nothing changes if it's wrong.
  An import **replaces** all current trades. Screenshot images are not inside the JSON (only
  their filenames are), so keep the `screenshots/` folder alongside it.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `N` | New trade (quick-add) |
| `/` | Focus search / filter (jumps to Journal) |
| `↑` `↓` (or `j` `k`) | Select a row in Open positions / Journal |
| `Enter` | Open the selected trade |
| `C` | Close the selected open trade (also works inside trade detail) |
| `E` | Edit (inside trade detail) |
| `Esc` | Close the top dialog |
| `Cmd/Ctrl + Enter` | Save the current form |
| `Enter` in a single-line field | Save (except in Ticker, where it picks a suggestion) |
| `Cmd/Ctrl + V` | Paste a screenshot into the open form / trade |
| `←` `→` | Move between chips (structure, setup, grade, …). `Backspace` clears an optional chip |

In the screenshot label picker: `Enter` adds the image, `Esc` discards it, `Alt+1..4` picks Entry/Exit/Gamma/Other.

### Logging a trade in a few seconds

`N` → type ticker → `Tab` → arrows for structure (last one is remembered) → `Tab` → price → `Tab` → quantity → `Ctrl/Cmd+Enter`.

## How numbers are calculated

All calculations are in `src/lib/calc.ts` (tested in `src/lib/calc.test.ts`, run `npm test`).

- Multiplier: 100 for options (Long Call/Put, Call/Put Spread, LEAP Call), 1 for stock and Other.
- P&L, long/debit: `(exit − entry) × qty × multiplier − fees`.
- P&L, credit spreads and Stock Short: `(entry − exit) × qty × multiplier − fees`.
- P&L %: P&L ÷ (entry × qty × multiplier). For credit spreads, it's blank unless a stop is set (then P&L ÷ stop risk).
- R: P&L ÷ (|entry − stop| × qty × multiplier), only when a stop is entered.
- Stats are per currency (AUD / USD) with no FX conversion. Breakeven trades count as neither win nor loss.
  Groups with fewer than 10 trades are marked "small sample".

## Demo data

Settings → **Load demo data** adds about 48 flagged trades (marked DEMO).
**Clear demo data** removes only those, along with their placeholder images, and never touches your own trades.

## Development

```bash
npm run serve        # API on :3000 (serves the last build)
npm run dev          # Vite dev server with hot reload on :5173 (proxies /api to :3000)
npm test             # unit tests
npm run typecheck
```

The server uses `better-sqlite3`. If it can't be installed on your machine (it's an optional
dependency), the server falls back to Node's built-in `node:sqlite` automatically.
