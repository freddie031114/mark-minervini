// Import from the old local journal folder (journal.db + screenshots/), e.g. Dropbox/TradingJournal.
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { doc, setDoc } from 'firebase/firestore';
import { commitOps, writeTradeOps, type Op } from './api';
import { compressImage } from './images';
import { normalizeTrade, type ImportShot } from './validate';
import { fb } from './firebase';
import { SHOT_LABELS, type Settings, type ShotLabel, type Trade } from './types';

export interface LegacyResult {
  imported: number;
  skipped: number;
  missingScreenshots: number;
}

/**
 * `files` comes from a folder picker. Real (non-demo) trades are added to the current journal;
 * trades already imported earlier are skipped, so running it twice is safe.
 */
export async function importLegacyFolder(
  files: File[],
  existing: Trade[],
  settings: Settings,
  onStatus: (msg: string) => void,
): Promise<LegacyResult> {
  const dbFile = files.find((f) => f.name === 'journal.db');
  if (!dbFile) throw new Error('No journal.db in that folder. Pick the folder that contains journal.db and screenshots.');
  const images = new Map(files.filter((f) => /(^|[\\/])screenshots[\\/]/.test(f.webkitRelativePath)).map((f) => [f.name, f]));

  onStatus('Reading old journal…');
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database(new Uint8Array(await dbFile.arrayBuffer()));
  const rows = <T,>(sql: string): T[] => {
    const res = db.exec(sql);
    if (!res.length) return [];
    const { columns, values } = res[0];
    return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])) as T);
  };

  const trades = rows<Record<string, unknown>>('SELECT * FROM trades WHERE is_demo = 0 ORDER BY id');
  const shots = rows<{ trade_id: number; filename: string; label: string; caption: string | null; created_at: string }>(
    'SELECT * FROM screenshots ORDER BY id',
  );
  let tags: string[] = [];
  try {
    tags = rows<{ name: string }>('SELECT name FROM tags ORDER BY sort_order, id').map((r) => r.name);
  } catch {
    /* older file without tags */
  }
  db.close();

  const done = new Set(existing.map((t) => t.legacy_id).filter((x) => x != null));
  const ops: Op[] = [];
  let imported = 0;
  let skipped = 0;
  let missing = 0;

  for (const [i, r] of trades.entries()) {
    const legacyId = Number(r.id);
    if (done.has(legacyId)) {
      skipped++;
      continue;
    }
    onStatus(`Preparing trade ${i + 1} of ${trades.length}…`);
    const { value } = normalizeTrade(r);
    const tradeShots: ImportShot[] = [];
    for (const s of shots.filter((x) => x.trade_id === legacyId)) {
      const f = images.get(s.filename);
      if (!f) {
        missing++;
        continue;
      }
      tradeShots.push({
        label: (SHOT_LABELS as readonly string[]).includes(s.label) ? (s.label as ShotLabel) : 'Other',
        caption: s.caption,
        created_at: s.created_at,
        data: await compressImage(f),
      });
    }
    writeTradeOps(
      ops,
      {
        ...value,
        status: r.status === 'closed' ? 'closed' : 'open',
        is_demo: false,
        created_at: typeof r.created_at === 'string' ? r.created_at : undefined,
        shots: tradeShots,
      },
      legacyId,
    );
    imported++;
  }

  onStatus('Uploading…');
  await commitOps(ops, (d, t) => onStatus(`Uploading… ${Math.round((d / t) * 100)}%`));
  const merged = [...settings.tags, ...tags.filter((t) => !settings.tags.includes(t))];
  if (merged.length !== settings.tags.length) {
    await setDoc(doc(fb().db, 'users', fb().auth.currentUser!.uid, 'meta', 'settings'), { tags: merged }, { merge: true });
  }
  return { imported, skipped, missingScreenshots: missing };
}
