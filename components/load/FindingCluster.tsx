'use client';

/**
 * The same error repeated in one company and one account (the income tax with the wrong sign in all
 * twelve months) is one problem, not twelve. This row says it once, with the total effect and one
 * action for all of them; the individual rows stay one click away.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Pill, cx } from '@/components/ui/primitives';
import type { StatusView } from './labels';

export type FindingClusterView = {
  id: string;
  rule: string;
  status: StatusView;
  where: string;
  found: string;
  expected: string;
  figure: string;
  words: string;
  count: number;
  /** Ids of the findings inside, so a link to one of them opens the group. */
  childIds: string[];
};

export function FindingCluster({
  v,
  action,
  children,
}: {
  v: FindingClusterView;
  action: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (hash === v.id || v.childIds.includes(hash)) setOpen(true);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [v.id, v.childIds]);

  const cell = '@max-4xl/main:p-0 @4xl/main:border-b @4xl/main:border-rule @4xl/main:px-3 @4xl/main:py-2.5 @4xl/main:align-top';
  return (
    <>
      <tr
        id={v.id}
        className="scroll-mt-6 @max-4xl/main:grid @max-4xl/main:grid-cols-[minmax(0,1fr)_auto] @max-4xl/main:gap-x-4 @max-4xl/main:gap-y-1 @max-4xl/main:border-b @max-4xl/main:border-rule @max-4xl/main:py-3.5"
      >
        <th scope="row" className={cx(cell, 'text-left font-medium @max-4xl/main:col-start-1')}>
          <div className="flex flex-col items-start gap-1">
            <span>
              {v.rule}{' '}
              <span className="ml-1 rounded-full bg-raised px-1.5 text-xs font-medium tabular-nums">
                ×{v.count}
              </span>
            </span>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="cursor-pointer border-0 bg-transparent p-0 text-xs text-muted underline decoration-dotted underline-offset-[3px] hover:text-ink"
            >
              {open ? 'Ocultar el detalle' : `Ver las ${v.count} filas`}
            </button>
          </div>
        </th>
        <td className={cx(cell, '@max-4xl/main:col-start-2 @max-4xl/main:row-start-1 @max-4xl/main:text-right')}>
          <Pill tone={v.status.tone}>{v.status.text}</Pill>
        </td>
        <td
          className={cx(
            cell,
            'font-mono text-[13px] text-muted @max-4xl/main:col-span-2 @4xl/main:whitespace-nowrap @4xl/main:text-ink',
          )}
        >
          {v.where}
        </td>
        <td className={cx(cell, '@max-4xl/main:col-span-2')}>
          <div>{v.found}</div>
          <div className="text-muted">Esperado: {v.expected}</div>
        </td>
        <td className={cx(cell, '@max-4xl/main:col-start-1 @4xl/main:min-w-[150px] @4xl/main:text-right')}>
          <div className="whitespace-nowrap font-semibold tabular-nums">{v.figure}</div>
          <div className="text-muted">{v.words}</div>
        </td>
        <td className={cx(cell, '@max-4xl/main:col-start-2 @max-4xl/main:self-end @4xl/main:text-right')}>{action}</td>
      </tr>
      {open && children}
    </>
  );
}
