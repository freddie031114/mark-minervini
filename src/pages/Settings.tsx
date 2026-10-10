import { useEffect, useRef, useState } from 'react';
import { useJournal } from '../lib/store';
import { api, ApiError } from '../lib/api';
import { download, tradesToCsv } from '../lib/csv';
import { today } from '../lib/format';

export function SettingsPage() {
  const { trades, tags, reload } = useJournal();
  const [newTag, setNewTag] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string; details?: string[] } | null>(null);
  const [info, setInfo] = useState<{ dataDir: string; driver: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const demoCount = trades.filter((t) => t.is_demo).length;

  useEffect(() => {
    api.info().then(setInfo).catch(() => {});
  }, []);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      await reload();
      if (ok) setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e), details: e instanceof ApiError ? e.details : undefined });
    }
  };

  async function onImport(file: File) {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setMsg({ ok: false, text: `“${file.name}” is not valid JSON.` });
      return;
    }
    const n = Array.isArray((data as { trades?: unknown })?.trades) ? (data as { trades: unknown[] }).trades.length : '?';
    if (!confirm(`Restore from “${file.name}”?\n\nThis REPLACES all ${trades.length} current trades and your tag list with the ${n} trades in the file. Screenshot files in the data folder are kept.`)) return;
    await run(async () => {
      const r = await api.importJson(data);
      setMsg({
        ok: true,
        text: `Imported ${r.trades} trades.${r.missingScreenshots ? ` ${r.missingScreenshots} screenshot file(s) referenced by the export are not in the data folder.` : ''}`,
      });
    });
  }

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-lg font-semibold text-zinc-100">Settings</h1>
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

      <Section title="Setup tags" sub="Renaming a tag updates every trade that uses it. Deleting a tag keeps it on existing trades.">
        <ul className="space-y-1.5">
          {tags.map((t) => (
            <TagRow
              key={t.id}
              name={t.name}
              onRename={(name) => run(() => api.renameTag(t.id, name))}
              onDelete={() => {
                if (confirm(`Delete tag “${t.name}”?`)) run(() => api.deleteTag(t.id));
              }}
            />
          ))}
        </ul>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newTag.trim()) run(() => api.addTag(newTag.trim())).then(() => setNewTag(''));
          }}
        >
          <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="New tag" className="w-56" />
          <button className="btn" type="submit">
            Add tag
          </button>
        </form>
      </Section>

      <Section title="Export / import" sub="CSV is for spreadsheets. JSON is a full restore point for trades and tags (screenshot files stay in the data folder).">
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => download(`trading-journal-${today()}.csv`, tradesToCsv(trades), 'text/csv')}>
            Export CSV
          </button>
          <a className="btn" href="/api/export.json" download>
            Export JSON
          </a>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import JSON…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onImport(f);
            }}
          />
        </div>
      </Section>

      <Section title="Demo data" sub="Demo trades are flagged and marked DEMO. Clearing removes only them; your real trades are untouched.">
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => run(() => api.loadDemo(), 'Demo data loaded.')}>
            {demoCount ? 'Reload demo data' : 'Load demo data'}
          </button>
          <button className="btn btn-danger" disabled={!demoCount} onClick={() => run(() => api.clearDemo(), 'Demo data cleared.')}>
            Clear demo data
          </button>
          <span className="text-xs text-zinc-500">{demoCount} demo trades</span>
        </div>
      </Section>

      {info && (
        <Section title="Data folder" sub="Back up by copying this whole folder (with the app stopped). Change it with the JOURNAL_DATA_DIR environment variable.">
          <code className="rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-300">{info.dataDir}</code>
        </Section>
      )}
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
