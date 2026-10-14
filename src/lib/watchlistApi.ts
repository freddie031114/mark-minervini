// Watchlist storage: users/{uid}/watchlist/{id}. Covered by the existing per-user security rules.
import { collection, doc, getDocFromServer, onSnapshot, writeBatch } from 'firebase/firestore';
import { fb } from './firebase';
import { settle } from './api';
import { WATCHLIST_SEED, type WatchItem } from './watchlist';

const uid = () => fb().auth.currentUser!.uid;
const col = () => collection(fb().db, 'users', uid(), 'watchlist');
const itemRef = (id: string) => doc(fb().db, 'users', uid(), 'watchlist', id);
const settingsRef = () => doc(fb().db, 'users', uid(), 'meta', 'settings');
const now = () => new Date().toISOString();

let seeding = false;

/**
 * Writes the starter watchlist once per account. Only runs when the server (not a fresh
 * computer's empty cache) says the watchlist is empty and it has never been seeded.
 */
async function seedOnce() {
  if (seeding) return;
  seeding = true;
  try {
    const s = await getDocFromServer(settingsRef());
    if (s.exists() && s.data().watchlist_seeded) return;
    const b = writeBatch(fb().db);
    const ts = now();
    for (const item of WATCHLIST_SEED) b.set(doc(col()), { ...item, archived: false, created_at: ts, updated_at: ts });
    b.set(settingsRef(), { watchlist_seeded: true }, { merge: true });
    await settle(b.commit());
  } catch {
    // Offline: try again next time the watchlist opens.
  } finally {
    seeding = false;
  }
}

export function subscribeWatchlist(cb: (items: WatchItem[]) => void, onErr: (e: Error) => void) {
  return onSnapshot(
    col(),
    { includeMetadataChanges: true },
    (snap) => {
      cb(snap.docs.map((d) => ({ ...(d.data() as Omit<WatchItem, 'id'>), id: d.id })));
      if (snap.empty && !snap.metadata.fromCache) seedOnce();
    },
    onErr,
  );
}

export const watchlistApi = {
  /** Returns the new id immediately (works offline). */
  async add(ticker: string): Promise<string> {
    const ref = doc(col());
    const ts = now();
    const item: Omit<WatchItem, 'id'> = {
      ticker: ticker.trim().toUpperCase(),
      levels: [],
      gex_date: null,
      gex_note: null,
      earnings_date: null,
      archived: false,
      created_at: ts,
      updated_at: ts,
    };
    await settle(writeBatch(fb().db).set(ref, item).commit());
    return ref.id;
  },
  async update(id: string, patch: Partial<Omit<WatchItem, 'id' | 'created_at'>>) {
    await settle(writeBatch(fb().db).update(itemRef(id), { ...patch, updated_at: now() }).commit());
  },
  archive: (id: string, archived: boolean) => watchlistApi.update(id, { archived }),
};
