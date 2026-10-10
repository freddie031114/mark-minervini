# Trading Journal

A fast, local, single-user trading journal for options (verticals, LEAPS) and stocks.
It has no accounts and no cloud: everything lives in one folder on your laptop.

## Run it

Requires Node.js 22.9 or newer (any current LTS).

```bash
npm install && npm start
```

Then open **http://localhost:3000**. `npm start` builds the front end and starts the server.
Later runs only need `npm start`. To skip the rebuild, use `npm run serve`.

To use a different port, set `PORT`, for example `PORT=4000 npm start`.

## Day-to-day use

- **Start it:** `npm start` in the project folder, then open http://localhost:3000. Leave the terminal
  open while you journal. Press Ctrl+C to stop it.
- **Get updates:** `git pull && npm install && npm start`. Your data folder is never part of the code
  (it's git-ignored), so updating never touches your trades.
- **Using several computers?** See [Using it on several computers](#using-it-on-several-computers).

### Windows: start with a double-click

Double-click **`Start Journal.bat`** in the project folder. It starts the journal and opens your browser.
For a desktop shortcut, right-click the file → **Show more options** → **Send to** → **Desktop (create shortcut)**.
Close the black window (or press Ctrl+C in it) to stop the journal.

## Where your data lives

Everything is stored in one folder, `./data` by default:

```
data/
  journal.db        SQLite database (trades, tags, settings)
  screenshots/      image files referenced from the database
```

### Change the data folder

Copy `.env.example` to `.env` in the project folder and set the path:

```
JOURNAL_DATA_DIR=~/Dropbox/TradingJournal
```

After that, `npm start` always uses that folder. `.env` stays on that computer and is never committed.
You can also set `JOURNAL_DATA_DIR` as an environment variable. Settings → Data folder shows the folder in use.

## Using it on several computers

Install the app on each computer and point them all at **one shared folder** in Dropbox, Google Drive
or iCloud Drive. Every computer then sees the same trades and screenshots.

**One-time setup on each computer:**

1. Install [Node.js](https://nodejs.org) (LTS) and [Git](https://git-scm.com).
2. Get the app:
   ```bash
   git clone https://github.com/freddie031114/mark-minervini.git trading-journal
   cd trading-journal
   npm install
   ```
3. Create `.env` (copy `.env.example`) with the shared folder, using that computer's path to it:
   - Mac + Dropbox: `JOURNAL_DATA_DIR=~/Dropbox/TradingJournal`
   - Mac + iCloud Drive: `JOURNAL_DATA_DIR=~/Library/Mobile Documents/com~apple~CloudDocs/TradingJournal`
   - Windows + Dropbox: `JOURNAL_DATA_DIR=C:\Users\yourname\Dropbox\TradingJournal`
4. Make sure the sync app keeps that folder **fully downloaded**, not online-only:
   - iCloud: right-click the folder → **Keep Downloaded**.
   - Dropbox / Google Drive: mark it **Available offline**.
5. `npm start`, then open http://localhost:3000.

**The rules that keep your data safe:**

- **Run it on one computer at a time.** Stop it with **Ctrl+C** before you switch.
- **Let the sync finish** (the sync icon goes quiet) before starting it on the other computer.
- If you ever see a "conflicted copy" of `journal.db` in the folder, two computers wrote at once.
  Keep the newer one and use Settings → Export/Import if you need to merge by hand.

The app helps: every save goes straight into `journal.db` (no side files that could sync separately),
Ctrl+C closes the database cleanly, and it refuses to start if the folder has screenshots but no
database yet (the sync hasn't caught up), rather than creating an empty journal.

## Backing up

**Copy the whole data folder** (`journal.db` plus `screenshots/`) somewhere safe, ideally with the app stopped.
To restore, copy it back, or point `JOURNAL_DATA_DIR` at the copy.

In Settings you can also export:

- **Export CSV**: one row per trade, including computed P&L, P&L %, R and holding days, and
  screenshot filenames in a `screenshots` column. Use it with spreadsheets.
- **Export JSON**: a full restore point for trades and tags.
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
- All amounts are in USD. Breakeven trades count as neither win nor loss.
  Groups with fewer than 10 trades are marked "small sample".

## Demo data

Settings → **Load demo data** adds 48 flagged trades (marked DEMO).
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
