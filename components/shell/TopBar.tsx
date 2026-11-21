import Link from 'next/link';
import { AgentToggle } from '@/components/agent/AgentSidebar';
import { NavLinks } from './NavLinks';

/** Six short bars that converge into one: six companies, one group number. Drawn in ink. */
export function Mark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="flex-none">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={1 + i * 2.4} y={3 + Math.abs(2.5 - i) * 1.6} width="1.6" height={7 - Math.abs(2.5 - i) * 1.6} rx="0.4" fill="currentColor" />
      ))}
      <rect x="1" y="13" width="15.2" height="2.2" rx="0.6" fill="currentColor" />
    </svg>
  );
}

export function TopBar({
  scope,
  openBlocks,
  practice,
  uploaded = false,
}: {
  scope: string;
  openBlocks: number;
  practice: boolean;
  /** The visitor is looking at files they uploaded. */
  uploaded?: boolean;
}) {
  return (
    <header className="@container sticky top-0 z-30 border-b border-white/70 bg-glass backdrop-blur-xl">
      <div className="flex min-h-12 flex-wrap items-center gap-x-8 px-4 sm:flex-nowrap sm:px-9">
        <Link href="/summary" className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--accent)] no-underline md:hidden">
          <Mark />
          Quórum
        </Link>
        <NavLinks counts={{ load: openBlocks }} />
        <div className="hidden flex-none items-center gap-3 whitespace-nowrap py-2 text-muted @5xl:flex md:!hidden">
          {uploaded ? (
            <span className="rounded-full bg-chip-blue px-2 py-0.5 text-xs font-medium text-ink">Archivos subidos</span>
          ) : practice ? (
            <span className="rounded-full bg-chip-yellow px-2 py-0.5 text-xs font-medium text-ink">
              Datos de ejemplo
            </span>
          ) : (
            <span className="rounded-full bg-neu-bg px-2 py-0.5 text-xs font-medium text-muted">Sin datos</span>
          )}
          <span>{scope}</span>
        </div>
        <div className="ml-auto flex items-center">
          <AgentToggle />
        </div>
      </div>
    </header>
  );
}
