'use client';

/**
 * The left sidebar on wide screens: frosted glass, the sections in collapsible groups (Análisis,
 * Sistema), line icons, the active item as a light tinted pill, and what is loaded at the bottom.
 * On phones it is not drawn; the top bar keeps its row of sections there.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { cx } from '@/components/ui/primitives';
import { LINKS, isActive, type NavGroup } from './NavLinks';
import { Mark } from './TopBar';

/** 16px line icons, 1.5px stroke. */
const ICON: Record<string, ReactNode> = {
  home: <path d="M2.5 7.5 8 3l5.5 4.5V13a.5.5 0 0 1-.5.5h-3v-4h-4v4H3a.5.5 0 0 1-.5-.5z" />,
  ledger: <path d="M2.5 3.5h11v9h-11zM2.5 6.5h11M6.5 6.5v6" />,
  graph: (
    <>
      <circle cx="4" cy="4.5" r="1.75" />
      <circle cx="12" cy="5.5" r="1.75" />
      <circle cx="7.5" cy="12" r="1.75" />
      <path d="M5.7 4.9 10.3 5.2M11.1 7 8.4 10.5M4.8 6.1l1.9 4.2" />
    </>
  ),
  trend: <path d="M2.5 12.5 6 8.5l2.5 2 5-6M10.5 4.5h3v3" />,
  gear: (
    <>
      <circle cx="8" cy="8" r="2.25" />
      <path d="M8 1.75v2M8 12.25v2M14.25 8h-2M3.75 8h-2M12.4 3.6 11 5M5 11l-1.4 1.4M12.4 12.4 11 11M5 5 3.6 3.6" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none"
    >
      {ICON[name]}
    </svg>
  );
}

export function SideNav({
  openBlocks,
  dataset,
  scope,
}: {
  openBlocks: number;
  /** What the screens read: shown as a pastel chip at the bottom. */
  dataset: 'upload' | 'practice' | 'none';
  scope: string;
}) {
  const path = usePathname();
  const [closed, setClosed] = useState<Set<NavGroup>>(new Set());
  const groups = [...new Set(LINKS.map((l) => l.group))];
  const toggle = (g: NavGroup) =>
    setClosed((s) => {
      const next = new Set(s);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  return (
    <aside
      aria-label="Navegación"
      className="sticky top-0 hidden h-screen w-60 flex-none flex-col gap-6 border-r border-white/70 bg-glass px-4 py-5 backdrop-blur-xl md:flex"
    >
      <Link
        href="/summary"
        className="flex items-center gap-2 px-2 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--accent)] no-underline"
      >
        <Mark />
        Quórum
      </Link>

      <nav className="flex flex-col gap-4">
        {groups.map((g) => {
          const open = !closed.has(g);
          const id = `grupo-${g}`;
          return (
            <div key={g} className="flex flex-col gap-1">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => toggle(g)}
                className="flex cursor-pointer items-center justify-between rounded-[8px] px-2 py-1 text-xs font-medium uppercase tracking-[0.06em] text-muted hover:text-ink"
              >
                {g}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                  className={cx('transition-transform', !open && '-rotate-90')}
                >
                  <path d="M3 4.5 6 7.5l3-3" />
                </svg>
              </button>
              <ul id={id} hidden={!open} className="m-0 flex list-none flex-col gap-0.5 p-0">
                {LINKS.filter((l) => l.group === g).map((l) => {
                  const active = isActive(path, l.href);
                  const count = l.href === '/load' ? openBlocks : 0;
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        aria-current={active ? 'page' : undefined}
                        className={cx(
                          'flex h-9 items-center gap-2.5 rounded-full px-3 no-underline transition-colors',
                          active
                            ? 'bg-brand-tint font-semibold text-[var(--accent)]'
                            : 'font-medium text-muted hover:bg-white/80 hover:text-ink',
                        )}
                      >
                        <Icon name={l.icon} />
                        <span className="flex-auto">{l.label}</span>
                        {count > 0 && (
                          <span
                            className="rounded-full bg-[#f59e42] px-1.5 text-xs font-medium text-[#2b1600]"
                            aria-label={`${count} bloqueos abiertos`}
                          >
                            {count}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-start gap-1.5 px-2 text-xs text-muted">
        <span
          className={cx(
            'rounded-full px-2 py-0.5 font-medium text-ink',
            dataset === 'upload'
              ? 'bg-chip-blue'
              : dataset === 'practice'
                ? 'bg-chip-yellow'
                : 'bg-neu-bg text-muted',
          )}
        >
          {dataset === 'upload'
            ? 'Archivos subidos'
            : dataset === 'practice'
              ? 'Datos de ejemplo'
              : 'Sin datos'}
        </span>
        <span>{scope}</span>
      </div>
    </aside>
  );
}
