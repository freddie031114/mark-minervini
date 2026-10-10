import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Settings, Tag, Trade } from './types';

interface Journal {
  trades: Trade[];
  tags: Tag[];
  settings: Settings;
  loaded: boolean;
  reload: () => Promise<void>;
  openAdd: () => void;
  openDetail: (id: number) => void;
  openClose: (id: number) => void;
}

const Ctx = createContext<Journal | null>(null);
export const useJournal = () => useContext(Ctx)!;

export function JournalProvider({
  children,
  actions,
}: {
  children: ReactNode;
  actions: Pick<Journal, 'openAdd' | 'openDetail' | 'openClose'>;
}) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [t, g, s] = await Promise.all([api.trades(), api.tags(), api.settings()]);
    setTrades(t);
    setTags(g);
    setSettings(s);
    setLoaded(true);
  }, []);

  useEffect(() => {
    reload().catch((e) => console.error(e));
  }, [reload]);

  return <Ctx.Provider value={{ trades, tags, settings, loaded, reload, ...actions }}>{children}</Ctx.Provider>;
}
