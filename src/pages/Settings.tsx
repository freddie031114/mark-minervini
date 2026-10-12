import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { useJournal } from '../lib/store';
import { api, ApiError } from '../lib/api';
import { importLegacyFolder } from '../lib/legacy';
import { clearConfig, fb, storedConfig } from '../lib/firebase';
import { download, tradesToCsv } from '../lib/csv';
import { today } from '../lib/format';

type Msg = { ok: boolean; text: string; details?: string[] } | null;

export function SettingsPage() {
  const { user, trades, tags, settings } = useJournal();
  const [newTag, setNewTag] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const demoCount = trades.filter((t) => t.is_demo).length;

  // Folder picker attributes aren't in React's types.
  useEffect(() => {
    folderRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  const run = async (label: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e), details: e instanceof ApiError ? e.details : undefined });
    } finally {
      setBusy(null);
    }
  };

  async function onImportJson(file: File) {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setMsg({ ok: false, text: `“${file.name}” is not valid JSON.` });
      return;
    }
    const n = Array.isArray((data as { trades?: unknown })?.trades) ? (data as { trades: unknown[] }).trades.length : '?';
    if (!confirm(`Restore from “${file.name}”?\n\nThis REPLACES all ${trades.length} current trades, their screenshots and your tag list with the ${n} trades in the file.`)) return;
    await run('Restoring…', async () => {
      const r = await api.importJson(data, (d, t) => setBusy(`Restoring… ${Math.round((d / t) * 100)}%`));
      setMsg({
        ok: true,
        text: `Restored ${r.trades} trades.${r.missingScreenshots ? ` ${r.missingScreenshots} screenshots weren't in the file (older backups only had filenames).` : ''}`,
      });
    });
  }

  async function onLegacyFolder(files: File[]) {
    await run('Importing…', async () => {
      const r = await importLegacyFolder(files, trades, settings, setBusy);
      setMsg({
        ok: true,
        text:
          `Imported ${r.imported} trade${r.imported === 1 ? '' : 's'} from your old journal.` +
          (r.skipped ? ` ${r.skipped} were already imported before and were skipped.` : '') +
          (r.missingScreenshots ? ` ${r.missingScreenshots} screenshot files couldn't be found in the folder.` : ''),
      });
    });
  }

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-lg font-semibold text-zinc-100">Settings</h1>
      {busy && <div className="rounded border border-sky-800 bg-sky-900/20 px-3 py-2 text-sm text-sky-200">{busy}</div>}
      {msg && (
        <div className={`rounded border px-3 py-2 text-sm ${msg.ok ? 'border-emerald-700 bg-emerald-900/20 text-emerald-200' : 'border-red-700 bg-red-900/20 text-red-200'}`}>
          <div className="flex justify-between gap-3">
            <span>{msg.text}</span>
            <button className="text-xs opacity-60 hover:opacity-100" onClick={() => setMsg(null)}>
              dismiss
            </button>
          </div>
          {msg.details && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {msg.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Section title="Account" sub="Your journal is stored in your Firebase project and syncs to every computer you sign in on.">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-zinc-300">{user.email}</span>
          <button className="btn" onClick={() => signOut(fb().auth)}>
            Sign out
          </button>
          {!import.meta.env.VITE_FIREBASE_CONFIG && (
            <button
              className="text-xs text-zinc-500 hover:text-zinc-300"
              onClick={async () => {
                if (!confirm('Sign out and connect this computer to a different Firebase project?')) return;
                await signOut(fb().auth);
                clearConfig();
                location.reload();
              }}
            >
              Change Firebase project ({storedConfig()?.projectId})
            </button>
          )}
        </div>
      </Section>

      <Section title="Setup tags" sub="Renaming a tag updates every trade that uses it. Deleting a tag keeps it on existing trades.">
        <ul className="space-y-1.5">
          {tags.map((t) => (
            <TagRow
              key={t}
              name={t}
              onRename={(name) => run('Saving…', () => api.renameTag(settings, trades, t, name))}
              onDelete={() => {
                if (confirm(`Delete tag “${t}”?`)) run('Saving…', () => api.deleteTag(settings, t));
              }}
            />
          ))}
        </ul>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newTag.trim();
            if (name) run('Saving…', () => api.addTag(settings, name)).then(() => setNewTag(''));
          }}
        >
          <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="New tag" className="w-56" />
          <button className="btn" type="submit">
            Add tag
          </button>
        </form>
      </Section>

      <Section title="Backup" sub="CSV is for spreadsheets. JSON is a complete backup (trades, tags and screenshot images) that you can restore from.">
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => download(`trading-journal-${today()}.csv`, tradesToCsv(trades), 'text/csv')}>
            Export CSV
          </button>
          <button
            className="btn"
            disabled={!!busy}
            onClick={() =>
              run('Preparing backup…', async () => {
                const data = await api.exportJson(trades, settings);
                download(`trading-journal-${today()}.json`, JSON.stringify(data), 'application/json');
              })
            }
          >
            Export JSON backup
          </button>
          <button className="btn" disabled={!!busy} onClick={() => jsonRef.current?.click()}>
            Restore from JSON…
          </button>
          <input
            ref={jsonRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onImportJson(f);
            }}
          />
        </div>
      </Section>

      <Section
        title="Import old journal"
        sub="Brings in trades and screenshots from the old local version (the folder with journal.db and screenshots, e.g. Dropbox/TradingJournal). Adds to your current journal; safe to run twice."
      >
        <button className="btn" disabled={!!busy} onClick={() => folderRef.current?.click()}>
          Choose old journal folder…
        </button>
        <input
          ref={folderRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) onLegacyFolder(files);
          }}
        />
      </Section>

      <Section title="Demo data" sub="Demo trades are flagged and marked DEMO. Clearing removes only them; your real trades are untouched.">
        <div className="flex items-center gap-2">
          <button className="btn" disabled={!!busy} onClick={() => run('Loading demo data…', () => api.loadDemo(), 'Demo data loaded.')}>
            {demoCount ? 'Reload demo data' : 'Load demo data'}
          </button>
          <button className="btn btn-danger" disabled={!demoCount || !!busy} onClick={() => run('Clearing…', () => api.clearDemo(), 'Demo data cleared.')}>
            Clear demo data
          </button>
          <span className="text-xs text-zinc-500">{demoCount} demo trades</span>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-zinc-200">{title}</h2>
      {sub && <p className="mb-3 mt-0.5 text-xs text-zinc-500">{sub}</p>}
      {children}
    </section>
  );
}

function TagRow({ name, onRename, onDelete }: { name: string; onRename: (n: string) => void; onDelete: () => void }) {
  const [v, setV] = useState(name);
  useEffect(() => setV(name), [name]);
  const commit = () => {
    if (v.trim() && v.trim() !== name) onRename(v.trim());
    else setV(name);
  };
  return (
    <li className="flex items-center gap-2">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setV(name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-56"
        aria-label={`Rename ${name}`}
      />
      <button className="text-xs text-zinc-500 hover:text-red-400" onClick={onDelete}>
        Delete
      </button>
    </li>
  );
}
