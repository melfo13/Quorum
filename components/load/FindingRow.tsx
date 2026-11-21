'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Pill, buttonClass, cx } from '@/components/ui/primitives';
import { SourceExcerpt } from '@/components/ui/SourceExcerpt';
import type { Excerpt } from '@/lib/server/excerpt';
import { useFlash } from './flash';
import type { StatusView } from './labels';

export type FindingRowView = {
  id: string;
  rule: string;
  status: StatusView;
  where: string;
  found: string;
  expected: string;
  figure: string;
  words: string;
  resolved: boolean;
  resolutionText?: string;
  /** When set, the action column is the disclosure itself, with this label. */
  toggleLabel?: string;
  /** The action needs the full row width on a phone (a select and a button). */
  wideAction?: boolean;
};

/**
 * One finding. Two table rows: the finding, and its source rows (hidden until opened). Below the
 * lg breakpoint the cells stack into a two-column card-free list row.
 */
export function FindingRow({ f, excerpts, action }: { f: FindingRowView; excerpts: Excerpt[]; action?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = `${f.id}-source`;
  const flashRef = useFlash<HTMLTableRowElement>(`finding:${f.id}`, f.status.text);

  useEffect(() => {
    const sync = () => {
      if (decodeURIComponent(window.location.hash.slice(1)) === f.id) setOpen(true);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [f.id]);

  const toggle = (label: string, variant: 'secondary' | 'text') => (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => setOpen((o) => !o)}
      className={
        variant === 'secondary'
          ? cx(buttonClass('secondary', 'sm'), 'cursor-pointer')
          : 'cursor-pointer border-0 bg-transparent p-0 text-xs text-muted underline decoration-dotted underline-offset-[3px] hover:text-ink'
      }
    >
      {variant === 'text' ? (open ? 'Ocultar filas de origen' : 'Filas de origen') : open ? 'Ocultar' : label}
    </button>
  );

  const cell = 'max-lg:p-0 lg:border-b lg:border-rule lg:px-3 lg:py-2.5 lg:align-top';
  return (
    <>
      <tr
        ref={flashRef}
        id={f.id}
        className={cx(
          'scroll-mt-6 target:bg-raised max-lg:grid max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-x-4 max-lg:gap-y-1 max-lg:border-b max-lg:border-rule max-lg:py-3.5',
          open && 'lg:[&>td]:border-b-0 lg:[&>th]:border-b-0',
        )}
      >
        <th scope="row" className={cx(cell, 'text-left font-medium max-lg:col-start-1')}>
          <div className="flex flex-col items-start gap-1">
            <span>{f.rule}</span>
            {!f.toggleLabel && excerpts.length > 0 && toggle('', 'text')}
          </div>
        </th>
        <td className={cx(cell, 'max-lg:col-start-2 max-lg:row-start-1 max-lg:text-right')}>
          <Pill tone={f.status.tone}>{f.status.text}</Pill>
        </td>
        <td className={cx(cell, 'font-mono text-[13px] text-muted max-lg:col-span-2 lg:text-ink')}>
          {f.where.split(' y ').map((w) => (
            <div key={w} className="lg:whitespace-nowrap">
              {w}
            </div>
          ))}
        </td>
        <td className={cx(cell, 'max-lg:col-span-2')}>
          <div>{f.found}</div>
          <div className="text-muted">Esperado: {f.expected}</div>
        </td>
        <td className={cx(cell, 'max-lg:col-start-1 lg:min-w-[150px] lg:text-right')}>
          <div className="whitespace-nowrap font-semibold tabular-nums">{f.figure}</div>
          <div className="text-muted">{f.words}</div>
        </td>
        <td
          className={cx(
            cell,
            'lg:text-right',
            f.wideAction ? 'max-lg:col-span-2 max-lg:flex max-lg:justify-end' : 'max-lg:col-start-2 max-lg:self-end',
          )}
        >
          {f.resolved ? (
            <span className="text-muted">{f.resolutionText}</span>
          ) : f.toggleLabel ? (
            excerpts.length ? toggle(f.toggleLabel, 'secondary') : null
          ) : (
            action
          )}
        </td>
      </tr>
      <tr id={panelId} hidden={!open} className="max-lg:block">
        <td colSpan={6} className="border-b border-rule px-3 pb-4 pt-1 max-lg:block max-lg:px-0">
          <div className="flex flex-col gap-3">
            {excerpts.map((e) => (
              <SourceExcerpt key={`${e.file}!${e.sheet}!${e.rows.find((r) => r.isTarget)?.row}`} excerpt={e} />
            ))}
          </div>
        </td>
      </tr>
    </>
  );
}
