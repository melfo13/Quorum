'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui/primitives';

// The analysis first; loading files, mappings and validation live in Configuración, at the end.
// One list for both navigations: the sidebar on wide screens and the top row on phones.
export type NavGroup = 'Análisis' | 'Sistema';
export const LINKS: { href: string; label: string; group: NavGroup; icon: string }[] = [
  { href: '/summary', label: 'Resumen', group: 'Análisis', icon: 'home' },
  { href: '/consolidated', label: 'Consolidado', group: 'Análisis', icon: 'ledger' },
  { href: '/companies', label: 'Empresas', group: 'Análisis', icon: 'graph' },
  { href: '/simulator', label: 'Simulador', group: 'Análisis', icon: 'trend' },
  { href: '/load', label: 'Configuración', group: 'Sistema', icon: 'gear' },
];

export const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

export function NavLinks({ counts }: { counts: { load?: number } }) {
  const path = usePathname();
  return (
    <nav aria-label="Secciones" className="-mx-4 flex h-14 min-w-0 flex-auto items-center gap-1 overflow-x-auto whitespace-nowrap px-4 sm:mx-0 sm:px-0 md:hidden">
      {LINKS.map((l) => {
        const active = isActive(path, l.href);
        const count = l.href === '/load' ? counts.load : undefined;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'inline-flex h-8 items-center gap-1.5 rounded-full px-3 no-underline transition-colors',
              active ? 'bg-brand-tint font-semibold text-[var(--accent)]' : 'font-medium text-muted hover:bg-white/80 hover:text-ink',
            )}
          >
            {l.label}
            {count ? (
              <span className="rounded-full bg-neg-bg px-1.5 text-xs font-medium text-neg-ink" aria-label={`${count} bloqueos abiertos`}>
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
