import Link from 'next/link';
import { NavLinks } from './NavLinks';

/** Six short bars that converge into one: six companies, one group number. Drawn in ink. */
function Mark() {
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
    <header className="border-b border-border bg-surface">
      <div className="flex min-h-12 flex-wrap items-center gap-x-8 px-4 sm:flex-nowrap sm:px-9">
        <Link href="/load" className="flex items-center gap-2 text-base font-semibold no-underline">
          <Mark />
          PulseGroup
        </Link>
        <NavLinks counts={{ load: openBlocks }} />
        <div className="hidden items-center gap-3 py-2 text-muted md:flex">
          {uploaded ? (
            <span className="rounded-full bg-neu-bg px-2 py-0.5 text-xs font-medium text-ink">Archivos subidos</span>
          ) : practice ? (
            <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn-ink ring-1 ring-inset ring-warn-border">
              Datos de ejemplo
            </span>
          ) : (
            <span className="rounded-full bg-neu-bg px-2 py-0.5 text-xs font-medium text-muted">Sin datos</span>
          )}
          <span>{scope}</span>
        </div>
      </div>
    </header>
  );
}
