'use client';

/**
 * Whether the agent sidebar is open and how wide it is. Lives in the root layout so the sidebar and
 * its conversation survive navigation. Open state and width are remembered per browser.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export const WIDTH = { min: 340, normal: 420, wide: 760 };

/** The widest the sidebar may get: it never leaves the page less than 480px, besides the 240px navigation. */
export const maxWidth = () =>
  typeof window === 'undefined' ? 960 : Math.max(WIDTH.min, Math.min(960, window.innerWidth - 480 - (window.innerWidth >= 768 ? 240 : 0)));
export const clampWidth = (w: number) => Math.round(Math.min(maxWidth(), Math.max(WIDTH.min, w)));

type AgentUi = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  width: number;
  setWidth: (w: number) => void;
};

const Ctx = createContext<AgentUi | null>(null);
const KEY = 'pg_agent_ui';

export function AgentProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [width, setRawWidth] = useState(WIDTH.normal);

  // Restore after mount, not during render: the server has no storage, so reading it while rendering
  // would make the first client render differ from the server's. Storage can also be blocked.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as {
        open?: boolean;
        width?: number;
      } | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore after hydration, see above
      if (saved?.width) setRawWidth(clampWidth(saved.width));
      if (saved?.open && window.matchMedia('(min-width: 768px)').matches) setOpen(true);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ open, width }));
    } catch {}
  }, [open, width]);

  const setWidth = useCallback((w: number) => setRawWidth(clampWidth(w)), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const value = useMemo(() => ({ open, setOpen, toggle, width, setWidth }), [open, toggle, width, setWidth]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAgentUi() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAgentUi outside AgentProvider');
  return v;
}
