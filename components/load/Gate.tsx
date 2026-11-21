'use client';

import { cx } from '@/components/ui/primitives';
import { useFlash } from './flash';

export type GateCell = { key: string; label: string; figure: string; detail: string; tone?: 'negative' | 'positive' | 'ink' };

function Cell({ c, lead }: { c: GateCell; lead: boolean }) {
  const ref = useFlash<HTMLDivElement>(`gate:${c.key}`, c.figure);
  return (
    <div ref={ref} className="flex min-w-0 flex-col gap-1 bg-surface p-5">
      <div className="text-muted">{c.label}</div>
      <div
        className={cx(
          'tabular-nums leading-tight',
          lead ? 'text-[30px] font-semibold' : 'text-[24px]',
          c.tone === 'negative' && 'text-neg-ink',
          c.tone === 'positive' && 'text-positive',
        )}
      >
        {c.figure}
      </div>
      <div className="text-xs text-muted">{c.detail}</div>
    </div>
  );
}

/** What the gate is holding back right now, in money. Each figure flashes when it changes. */
export function Gate({ cells }: { cells: GateCell[] }) {
  return (
    <section
      aria-label="Fuera del número del grupo"
      className="grid grid-cols-1 gap-px overflow-hidden rounded-[8px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4"
    >
      {cells.map((c, i) => (
        <Cell key={c.key} c={c} lead={i === 0} />
      ))}
    </section>
  );
}
