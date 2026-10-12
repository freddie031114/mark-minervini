import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Gate } from './components/Gate';
import { JournalProvider, useJournal } from './lib/store';
import { anyModalOpen } from './components/Modal';
import { TradeForm } from './components/TradeForm';
import { TradeDetail } from './components/TradeDetail';
import { CloseDialog } from './components/CloseDialog';
import { Home } from './pages/Home';
import { Journal } from './pages/Journal';
import { Stats } from './pages/Stats';
import { SettingsPage } from './pages/Settings';
import { isTyping, modKey } from './lib/format';

const PAGES = [
  { id: 'open', label: 'Open positions' },
  { id: 'journal', label: 'Journal' },
  { id: 'stats', label: 'Stats' },
  { id: 'settings', label: 'Settings' },
] as const;
type Page = (typeof PAGES)[number]['id'];

const pageFromHash = (): Page => {
  const h = location.hash.replace('#/', '');
  return (PAGES.find((p) => p.id === h)?.id ?? 'open') as Page;
};

export default function App() {
  return <Gate>{(user) => <Journal_ user={user} />}</Gate>;
}

function Journal_({ user }: { user: User }) {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [adding, setAdding] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [closeId, setCloseId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Writes that fail after the UI moved on (e.g. rejected by the server) surface here.
  useEffect(() => {
    const on = (e: Event) => setToast((e as CustomEvent<string>).detail);
    window.addEventListener('journal-error', on);
    return () => window.removeEventListener('journal-error', on);
  }, []);

  useEffect(() => {
    const on = () => setPage(pageFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (p: Page) => {
    location.hash = `#/${p}`;
  };

  // Global shortcuts: N (new), / (search). C is handled by the list / detail that owns the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e) || anyModalOpen()) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setAdding(true);
      } else if (e.key === '/') {
        e.preventDefault();
        const el = document.querySelector<HTMLInputElement>('[data-search]');
        if (el) el.focus();
        else {
          go('journal');
          setTimeout(() => document.querySelector<HTMLInputElement>('[data-search]')?.focus(), 50);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <JournalProvider user={user} actions={{ openAdd: () => setAdding(true), openDetail: setDetailId, openClose: setCloseId }}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 flex h-screen w-48 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 px-3 py-4 max-md:w-36">
          <div className="mb-5 px-2 text-sm font-semibold tracking-wide text-zinc-100">Trading Journal</div>
          <button className="btn btn-primary mb-4 justify-center" onClick={() => setAdding(true)}>
            + Log trade <span className="kbd border-sky-400/40 bg-sky-700 text-sky-100">N</span>
          </button>
          <nav className="flex flex-col gap-0.5">
            {PAGES.map((p) => (
              <a
                key={p.id}
                href={`#/${p.id}`}
                className={`rounded px-2 py-1.5 text-sm ${page === p.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}
              >
                {p.label}
              </a>
            ))}
          </nav>
          <div className="mt-auto space-y-1 px-2 text-[11px] leading-5 text-zinc-500">
            <div><span className="kbd">N</span> new trade</div>
            <div><span className="kbd">/</span> search</div>
            <div><span className="kbd">↑↓</span> select · <span className="kbd">↵</span> open</div>
            <div><span className="kbd">C</span> close trade</div>
            <div><span className="kbd">{modKey}↵</span> save · <span className="kbd">Esc</span></div>
            <div><span className="kbd">{modKey}V</span> paste image</div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-6 py-5 max-md:px-3">
          <Screen page={page} />
        </main>
      </div>

      {adding && <TradeForm onClose={() => setAdding(false)} />}
      {detailId != null && <TradeDetail id={detailId} onClose={() => setDetailId(null)} />}
      {closeId != null && <CloseDialog id={closeId} onClose={() => setCloseId(null)} />}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-200 shadow-xl">
          <div className="flex gap-3">
            <span>Couldn't save a change: {toast}</span>
            <button className="text-red-400 hover:text-red-200" onClick={() => setToast(null)}>
              ✕
            </button>
          </div>
        </div>
      )}
    </JournalProvider>
  );
}

function Screen({ page }: { page: Page }) {
  const { loaded } = useJournal();
  if (!loaded) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (page === 'journal') return <Journal />;
  if (page === 'stats') return <Stats />;
  if (page === 'settings') return <SettingsPage />;
  return <Home />;
}
