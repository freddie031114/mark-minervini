# Trading Journal

A fast trading journal for options (verticals, LEAPS) and stocks, as a Windows desktop app.
Sign in with your email and password, and your journal syncs between every computer you use.
Your data is stored in **your own Firebase project** (Google's free app backend), not on anyone else's server.

## 1. One-time Firebase setup (about 10 minutes)

You do this **once**, not once per computer.

1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. **Create a project.** Click **Create a project** (or **Add project**), name it `trading-journal`, and click Continue.
   Google Analytics isn't needed, so turn it off. Click **Create project**.
3. **Turn on sign-in.** In the left menu, open **Build → Authentication** and click **Get started**.
   Under **Sign-in method**, click **Email/Password**, switch on the first toggle (**Email/Password**), and **Save**.
4. **Create the database.** Open **Build → Firestore Database** and click **Create database**.
   - Choose a location near you, for example `australia-southeast1 (Sydney)`, and click Next.
     The location can't be changed later.
   - Choose **Start in production mode** and click **Create**.
5. **Lock it down to your account.** Still in Firestore, open the **Rules** tab. Replace everything there with
   the contents of [`firestore.rules`](firestore.rules) from this repo, then click **Publish**:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
   This means each signed-in person can only read and write their own journal.
6. **Get the config.** Click the ⚙ gear next to **Project Overview** → **Project settings**. Under **Your apps**,
   click the **`</>`** (Web) icon. Name it `desktop`, leave Hosting unticked, and click **Register app**.
   You'll see a block starting with `const firebaseConfig = {`. Keep that page open.
   You can find it again any time under Project settings → Your apps.

The free (Spark) plan is plenty: 1 GB of storage holds thousands of trades with screenshots. No card is needed.

## 2. Install the app

1. Open the [latest release](../../releases/latest) and download **Trading Journal Setup x.y.z.exe**.
2. Run it. Windows will probably say **"Windows protected your PC"**, because the app isn't code-signed.
   Click **More info → Run anyway**.
3. Open **Trading Journal** from the desktop shortcut or Start menu.
4. **First launch on each computer:** paste the whole `firebaseConfig` block from step 1.6 and click Continue.
5. **First time ever:** click **First time? Create account** and choose an email and password.
   **On your other computers:** just sign in with the same email and password.

The app remembers you, so after that it opens straight into your journal.

## 3. Bring in your old journal (optional)

If you used the earlier local version: in the app, go to **Settings → Import old journal → Choose old journal folder…**
and pick the folder that contains `journal.db` and `screenshots` (e.g. `Dropbox\TradingJournal`).
Your trades, tags and screenshots are copied in. Demo trades are skipped, and running it twice won't duplicate anything.

## Everyday use

- It's a normal app: open it, journal, close it.
- **Several computers:** sign in on each. Changes show up on the others within a second or two.
  Both can be open at once.
- **Offline:** you can keep logging trades. They're saved on the computer and sync when you're back online.
- **Updates:** download and run the newest installer from the [releases page](../../releases/latest).
  Your data lives in Firebase, so reinstalling never touches it.

## Watchlist

One compact row per ticker: support/resistance levels, the next GEX recheck and the earnings date.

- **Add:** type a ticker in **+ Add ticker** and press Enter. The levels box opens straight away.
- **Edit:** click any cell (or Tab to it and press Enter). Enter or clicking away saves, and Esc cancels.
- **Levels** go on one line: `R 265-266 · S 248.5-250 (gap fill) · S 236`. Separate them with `·` or commas.
  Put notes in brackets. They're shown as a price ladder (resistances, then supports, highest first).
- **GEX recheck** takes a date and/or a note (e.g. "after monthly expiry", or just "before any entry").
- **Sorting:** by whichever comes first, the GEX recheck or earnings. Tickers with neither date go last.
- **Highlighting:** a row is highlighted when its GEX recheck is today or overdue, or when earnings are 14 days or fewer away.
- **Archive** hides a ticker; it stays under **Archived** at the bottom, where **Restore** brings it back.
- **Dates are US market dates.** "Today" and "days until" use New York's date, so on a Sydney morning
  the app still counts from the previous US trading day.

## Backups

Your data is in Firebase, which Google runs, but it's still worth keeping your own copy now and then:
**Settings → Export JSON backup** saves everything, including screenshot images, to one file.
**Restore from JSON…** brings it back (it replaces what's there). **Export CSV** gives a spreadsheet.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `N` | New trade |
| `/` | Focus search / filter (jumps to Journal) |
| `↑` `↓` (or `j` `k`) | Select a row in Open positions / Journal |
| `Enter` | Open the selected trade |
| `C` | Close the selected open trade (also inside trade detail) |
| `E` | Edit (inside trade detail) |
| `Esc` | Close the top dialog |
| `Ctrl + Enter` | Save the current form |
| `Enter` in a single-line field | Save (except in Ticker, where it picks a suggestion) |
| `Ctrl + V` | Paste a screenshot into the open form / trade |
| `←` `→` | Move between chips (structure, setup, grade, …). `Backspace` clears an optional chip |

In the screenshot label picker: `Enter` adds it, `Esc` discards it, `Alt+1..4` picks Entry/Exit/Gamma/Other.

## Screenshots

Pasted, dropped or chosen images are resized to at most 1920 px wide and compressed (WebP) so each one fits in a
single Firestore document. They're typically 100 to 300 KB, sharp enough to read a chart. Images for a trade load
only when you open that trade, so the app stays fast however many you have.

## How numbers are calculated

All calculations are in `src/lib/calc.ts` (tested in `src/lib/calc.test.ts`).

- Multiplier: 100 for options (Long Call/Put, Call/Put Spread, LEAP Call), 1 for stock and Other.
- P&L, long/debit: `(exit − entry) × qty × multiplier − fees`.
- P&L, credit spreads and Stock Short: `(entry − exit) × qty × multiplier − fees`.
- P&L %: P&L ÷ (entry × qty × multiplier). For credit spreads, it's blank unless a stop is set (then P&L ÷ stop risk).
- R: P&L ÷ (|entry − stop| × qty × multiplier), only when a stop is entered.
- All amounts are in USD. Breakeven trades count as neither win nor loss. Groups under 10 trades are marked "small sample".

## For development

```bash
npm install
npm start            # build and open the desktop app
npm run dev          # browser dev server with hot reload (http://localhost:5173)
npm test             # unit tests
npm run emulators    # local Firebase emulators (needs Java); build with VITE_FIREBASE_EMULATOR=127.0.0.1 to use them
npm run dist         # build the Windows installer (on Windows; CI does this automatically)
```

Every push to `main` builds the installer on GitHub Actions and publishes it as a release named after
`version` in `package.json`. Bump the version for a new release.

Data layout in Firestore:

```
users/{uid}/trades/{id}     trade fields + screenshot labels/captions
users/{uid}/shots/{id}      one compressed image per document
users/{uid}/meta/settings   setup tags + remembered form defaults
```
