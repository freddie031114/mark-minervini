import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { subscribeSettings, subscribeTrades } from './api';
import { SEED_TAGS, type Settings, type Trade } from './types';

interface Journal {
  user: User;
  trades: Trade[];
  tags: string[];
  settings: Settings;
  loaded: boolean;
  openAdd: () => void;
  openDetail: (id: string) => void;
  openClose: (id: string) => void;
}

const Ctx = createContext<Journal | null>(null);
export const useJournal = () => useContext(Ctx)!;

/** Live view of the signed-in user's journal. Updates instantly, including from other computers. */
export function JournalProvider({
  user,
  children,
  actions,
}: {
  user: User;
  children: ReactNode;
  actions: Pick<Journal, 'openAdd' | 'openDetail' | 'openClose'>;
}) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [settings, setSettings] = useState<Settings>({ tags: SEED_TAGS });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onErr = (e: Error) => setError(e.message);
    const a = subscribeTrades((t) => {
      setTrades(t);
      setLoaded(true);
    }, onErr);
    const b = subscribeSettings(setSettings, onErr);
    return () => {
      a();
      b();
    };
  }, [user.uid]);

  if (error)
    return (
      <div className="m-8 max-w-xl rounded border border-red-700 bg-red-900/20 p-4 text-sm text-red-200">
        <div className="font-medium">Couldn't load your journal.</div>
        <div className="mt-1 text-red-300/80">{error}</div>
        <div className="mt-2 text-xs text-red-300/70">
          If this says "permission denied", the Firestore security rules haven't been set up yet (see the setup guide).
        </div>
      </div>
    );

  return <Ctx.Provider value={{ user, trades, tags: settings.tags, settings, loaded, ...actions }}>{children}</Ctx.Provider>;
}
