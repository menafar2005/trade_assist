import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Settings } from "./types";

const empty: Settings = { mistakeTags: [], evidenceTags: [], signalSources: [], checklist: [], currency: "USDT" };

interface Ctx {
  settings: Settings;
  loaded: boolean;
  reload: () => Promise<void>;
  set: (s: Settings) => void;
}
const C = createContext<Ctx>({ settings: empty, loaded: false, reload: async () => {}, set: () => {} });
export const useSettings = () => useContext(C);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, set] = useState(empty);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    set(await api.settings());
    setLoaded(true);
  }, []);
  useEffect(() => { reload().catch(() => setLoaded(true)); }, [reload]);
  return <C.Provider value={{ settings, loaded, reload, set }}>{children}</C.Provider>;
}
