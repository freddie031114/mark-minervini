// Data layer: everything lives in Firestore under users/{uid}/…
//
//   users/{uid}/trades/{tradeId}   trade fields + `screenshots` (labels/captions only)
//   users/{uid}/shots/{shotId}     one compressed image per document (loaded on demand)
//   users/{uid}/meta/settings      tag list + remembered form defaults
import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  writeBatch,
  type DocumentReference,
  type WriteBatch,
} from 'firebase/firestore';
import { fb } from './firebase';
import { compressImage } from './images';
import { buildDemo, placeholderSvg } from './demo';
import { TRADE_FIELDS, validateImport, type ImportTrade, type TradeData } from './validate';
import { today } from './format';
import { SEED_TAGS, type Screenshot, type Settings, type ShotLabel, type Trade } from './types';

export class ApiError extends Error {
  constructor(message: string, public details?: string[]) {
    super(message);
  }
}

export type TradeInput = Partial<Omit<Trade, 'id' | 'screenshots' | 'created_at' | 'updated_at' | 'is_demo'>>;

const uid = () => {
  const u = fb().auth.currentUser;
  if (!u) throw new ApiError('Not signed in');
  return u.uid;
};
const col = (name: 'trades' | 'shots') => collection(fb().db, 'users', uid(), name);
const tradeRef = (id: string) => doc(fb().db, 'users', uid(), 'trades', id);
const shotRef = (id: string) => doc(fb().db, 'users', uid(), 'shots', id);
const settingsRef = () => doc(fb().db, 'users', uid(), 'meta', 'settings');
const now = () => new Date().toISOString();

/* ---------------- Writing ---------------- */

/** Report a write that failed after we stopped waiting for it. */
function reportError(e: unknown) {
  console.error(e);
  window.dispatchEvent(new CustomEvent('journal-error', { detail: e instanceof Error ? e.message : String(e) }));
}

/**
 * Wait for the server to confirm a write, but not forever: offline, Firestore keeps the
 * change locally (it already shows in the app) and syncs later, so we move on after a moment.
 */
async function settle(p: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failed: unknown = null;
  await Promise.race([
    p.catch((e) => {
      failed = e;
    }),
    new Promise((r) => (timer = setTimeout(r, 2000))),
  ]);
  clearTimeout(timer);
  if (failed) throw failed;
  p.catch(reportError);
}

interface Op {
  apply: (b: WriteBatch) => void;
  bytes: number;
}

/** Commit many writes in batches that respect Firestore's limits (500 writes / ~10 MB). */
async function commitOps(ops: Op[], onProgress?: (done: number, total: number) => void) {
  let batch = writeBatch(fb().db);
  let n = 0;
  let bytes = 0;
  let done = 0;
  for (const op of ops) {
    if (n >= 450 || bytes + op.bytes > 7_000_000) {
      await settle(batch.commit());
      batch = writeBatch(fb().db);
      n = 0;
      bytes = 0;
    }
    op.apply(batch);
    n++;
    bytes += op.bytes;
    done++;
    onProgress?.(done, ops.length);
  }
  if (n) await settle(batch.commit());
}

const setOp = (ref: DocumentReference, data: object, bytes = 2000): Op => ({ apply: (b) => b.set(ref, data), bytes });
const delOp = (ref: DocumentReference): Op => ({ apply: (b) => b.delete(ref), bytes: 100 });

/** A complete trade document with every field present (null when empty). */
function tradeDoc(input: TradeData, extra: Partial<Record<string, unknown>> = {}) {
  const base: Record<string, unknown> = {};
  for (const k of TRADE_FIELDS) base[k] = input[k] ?? null;
  const ts = now();
  return {
    ...base,
    ticker: String(input.ticker ?? '').toUpperCase(),
    is_credit: !!input.is_credit,
    fees: (input.fees as number) ?? 0,
    status: input.status ?? 'open',
    entry_date: input.entry_date || today(),
    is_demo: false,
    legacy_id: null,
    screenshots: [] as Screenshot[],
    created_at: ts,
    updated_at: ts,
    ...extra,
  };
}

/* ---------------- Subscriptions ---------------- */

export function subscribeTrades(cb: (t: Trade[]) => void, onErr: (e: Error) => void) {
  return onSnapshot(
    col('trades'),
    (snap) => {
      const list = snap.docs.map((d) => ({ ...(d.data() as Omit<Trade, 'id'>), id: d.id }));
      list.sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at));
      cb(list);
    },
    onErr,
  );
}

export function subscribeSettings(cb: (s: Settings) => void, onErr: (e: Error) => void) {
  return onSnapshot(
    settingsRef(),
    { includeMetadataChanges: true },
    (snap) => {
      if (!snap.exists()) {
        // First sign-in: seed the tag list, but only once the server confirms there's no
        // settings doc. A fresh computer's empty cache must never overwrite real tags.
        if (!snap.metadata.fromCache) {
          settle(writeBatch(fb().db).set(settingsRef(), { tags: SEED_TAGS }, { merge: true }).commit()).catch(reportError);
        }
        cb({ tags: SEED_TAGS });
        return;
      }
      const d = snap.data() as Partial<Settings>;
      cb({ ...d, tags: Array.isArray(d.tags) ? d.tags : SEED_TAGS });
    },
    onErr,
  );
}

/** Live map of screenshot id -> image data URL for one trade. */
export function subscribeShotImages(tradeId: string, cb: (m: Record<string, string>) => void) {
  return onSnapshot(query(col('shots'), where('trade_id', '==', tradeId)), (snap) => {
    const m: Record<string, string> = {};
    snap.docs.forEach((d) => (m[d.id] = d.data().data));
    cb(m);
  }, reportError);
}

/* ---------------- Trades ---------------- */

export const api = {
  /** Creates the trade and returns its id (known immediately, even offline). */
  async createTrade(t: TradeInput): Promise<string> {
    const ref = doc(col('trades'));
    const b = writeBatch(fb().db);
    b.set(ref, tradeDoc(t as TradeData));
    b.set(settingsRef(), { last_structure: t.structure ?? null, last_setup_tag: t.setup_tag ?? null }, { merge: true });
    await settle(b.commit());
    return ref.id;
  },

  async updateTrade(id: string, t: TradeInput) {
    const b = writeBatch(fb().db);
    b.update(tradeRef(id), { ...t, ...(t.ticker ? { ticker: t.ticker.toUpperCase() } : {}), updated_at: now() });
    await settle(b.commit());
  },

  async closeTrade(id: string, t: TradeInput) {
    await api.updateTrade(id, { ...t, status: 'closed', exit_date: t.exit_date || today(), fees: t.fees ?? 0 });
  },

  async deleteTrade(t: Trade) {
    await commitOps([...t.screenshots.map((s) => delOp(shotRef(s.id))), delOp(tradeRef(t.id))]);
  },

  async addShot(tradeId: string, blob: Blob, label: ShotLabel, caption: string) {
    const data = await compressImage(blob);
    await writeShot(tradeId, data, label, caption || null);
  },

  async deleteShot(trade: Trade, shotId: string) {
    const b = writeBatch(fb().db);
    b.delete(shotRef(shotId));
    b.update(tradeRef(trade.id), { screenshots: trade.screenshots.filter((s) => s.id !== shotId), updated_at: now() });
    await settle(b.commit());
  },

  /* ---------------- Tags ---------------- */

  async addTag(settings: Settings, name: string) {
    if (settings.tags.some((t) => t.toLowerCase() === name.toLowerCase())) throw new ApiError('Tag already exists');
    await settle(writeBatch(fb().db).set(settingsRef(), { tags: [...settings.tags, name] }, { merge: true }).commit());
  },

  async renameTag(settings: Settings, trades: Trade[], from: string, to: string) {
    if (settings.tags.some((t) => t !== from && t.toLowerCase() === to.toLowerCase())) throw new ApiError('Tag already exists');
    const ops: Op[] = [
      {
        apply: (b) =>
          b.set(
            settingsRef(),
            {
              tags: settings.tags.map((t) => (t === from ? to : t)),
              ...(settings.last_setup_tag === from ? { last_setup_tag: to } : {}),
            },
            { merge: true },
          ),
        bytes: 1000,
      },
      ...trades.filter((t) => t.setup_tag === from).map((t) => ({ apply: (b: WriteBatch) => b.update(tradeRef(t.id), { setup_tag: to }), bytes: 200 })),
    ];
    await commitOps(ops);
  },

  async deleteTag(settings: Settings, name: string) {
    await settle(writeBatch(fb().db).set(settingsRef(), { tags: settings.tags.filter((t) => t !== name) }, { merge: true }).commit());
  },

  /* ---------------- Demo data ---------------- */

  async loadDemo() {
    await api.clearDemo();
    const ops: Op[] = [];
    buildDemo().forEach((t, i) => {
      const ref = doc(col('trades'));
      const shots: Screenshot[] = [];
      if (i % 6 === 0) {
        const up = t.status === 'open' || ((t.exit_price as number) ?? 0) >= (t.entry_price as number);
        for (const label of (t.status === 'closed' ? ['Entry', 'Exit'] : ['Entry']) as ShotLabel[]) {
          const sref = doc(col('shots'));
          const svg = placeholderSvg(String(t.ticker), label, up);
          const data = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
          const meta = { id: sref.id, label, caption: `${label} chart`, created_at: now() };
          shots.push(meta);
          ops.push(setOp(sref, { trade_id: ref.id, data, label, caption: meta.caption, created_at: meta.created_at, is_demo: true }, data.length));
        }
      }
      ops.push(setOp(ref, tradeDoc(t, { is_demo: true, screenshots: shots })));
    });
    await commitOps(ops);
    return ops.length;
  },

  async clearDemo() {
    const [t, s] = await Promise.all([
      getDocs(query(col('trades'), where('is_demo', '==', true))),
      getDocs(query(col('shots'), where('is_demo', '==', true))),
    ]);
    await commitOps([...t.docs, ...s.docs].map((d) => delOp(d.ref)));
  },

  /* ---------------- Backup ---------------- */

  /** Full backup, including the screenshot images. */
  async exportJson(trades: Trade[], settings: Settings) {
    const shots = await getDocs(col('shots'));
    const images = new Map(shots.docs.map((d) => [d.id, d.data().data as string]));
    return {
      app: 'trading-journal',
      version: 2,
      exported_at: now(),
      tags: settings.tags,
      trades: trades.map(({ screenshots, ...t }) => ({
        ...t,
        screenshots: screenshots.map((s) => ({ label: s.label, caption: s.caption, created_at: s.created_at, data: images.get(s.id) ?? null })),
      })),
    };
  },

  /** Restore from a JSON backup: replaces all trades, screenshots and tags. */
  async importJson(json: unknown, onProgress?: (done: number, total: number) => void) {
    const v = validateImport(json);
    if (!v.ok) throw new ApiError('Import file is not valid', v.errors);
    const [oldT, oldS] = await Promise.all([getDocs(col('trades')), getDocs(col('shots'))]);
    const ops: Op[] = [...oldT.docs, ...oldS.docs].map((d) => delOp(d.ref));
    let missing = 0;
    for (const t of v.trades) missing += writeTradeOps(ops, t);
    if (v.tags.length) ops.push(setOp(settingsRef(), { tags: v.tags }));
    await commitOps(ops, onProgress);
    return { trades: v.trades.length, missingScreenshots: missing };
  },
};

/** Add ops that write one imported trade with its screenshots; returns how many images were missing. */
export function writeTradeOps(ops: Op[], t: ImportTrade, legacyId: number | null = null): number {
  const ref = doc(col('trades'));
  const metas: Screenshot[] = [];
  let missing = 0;
  for (const s of t.shots) {
    if (!s.data) {
      missing++;
      continue;
    }
    const sref = doc(col('shots'));
    const meta = { id: sref.id, label: s.label, caption: s.caption, created_at: s.created_at ?? now() };
    metas.push(meta);
    ops.push(setOp(sref, { trade_id: ref.id, data: s.data, label: s.label, caption: s.caption, created_at: meta.created_at, is_demo: t.is_demo }, s.data.length));
  }
  const { shots: _ignored, ...fields } = t;
  ops.push(
    setOp(
      ref,
      tradeDoc(fields, {
        is_demo: t.is_demo,
        legacy_id: legacyId,
        screenshots: metas,
        ...(t.created_at ? { created_at: t.created_at } : {}),
      }),
    ),
  );
  return missing;
}

async function writeShot(tradeId: string, data: string, label: ShotLabel, caption: string | null) {
  const sref = doc(col('shots'));
  const meta: Screenshot = { id: sref.id, label, caption, created_at: now() };
  const b = writeBatch(fb().db);
  b.set(sref, { trade_id: tradeId, data, label, caption, created_at: meta.created_at, is_demo: false });
  b.update(tradeRef(tradeId), { screenshots: arrayUnion(meta), updated_at: now() });
  await settle(b.commit());
}

export { commitOps, type Op };
