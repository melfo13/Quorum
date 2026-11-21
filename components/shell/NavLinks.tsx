'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui/primitives';

const LINKS = [
  { href: '/load', label: 'Carga' },
  { href: '/summary', label: 'Resumen' },
  { href: '/consolidated', label: 'Consolidado' },
  { href: '/companies', label: 'Empresas' },
  { href: '/simulator', label: 'Simulador' },
];

export function NavLinks({ counts }: { counts: { load?: number } }) {
  const path = usePathname();
  return (
    <nav aria-label="Secciones" className="-mx-4 flex min-w-0 flex-auto gap-5 overflow-x-auto whitespace-nowrap px-4 sm:mx-0 sm:gap-6 sm:px-0">
      {LINKS.map((l) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        const count = l.href === '/load' ? counts.load : undefined;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'inline-flex h-12 items-center gap-1.5 border-b-2 no-underline transition-colors',
              active ? 'border-ink font-semibold text-ink' : 'border-transparent font-medium text-muted hover:text-ink',
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
