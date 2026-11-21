/**
 * The trail of one figure: from the group number down to the cell it came from, each step a real
 * value. The path draws itself in order when the selection changes (opacity and a short rise,
 * 70ms apart); reduced motion shows it at rest. Only the last step, the cell, carries the accent.
 */
import type { ReactNode } from 'react';
import { cx } from '@/components/ui/primitives';

export type TrailStep = { label: string; value: ReactNode; detail?: ReactNode; mono?: boolean };

const CSS = `
@keyframes pg-trail-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.pg-trail-step { animation: pg-trail-in 360ms cubic-bezier(.2,.7,.2,1) both; }
@media (prefers-reduced-motion: reduce) { .pg-trail-step { animation: none; } }
`;

/** Vertical: the hero of the audit panel. Reads top to bottom, figure first, cell last. */
export function Trail({ steps, label, after }: { steps: TrailStep[]; label: string; after?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <style href="pg-trail" precedence="default">
        {CSS}
      </style>
      <ol aria-label={label} className="m-0 flex list-none flex-col p-0">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          return (
            <li
              key={s.label}
              className="pg-trail-step grid grid-cols-[16px_minmax(0,1fr)] gap-x-3"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="relative flex justify-center" aria-hidden="true">
                {!last && <span className="absolute bottom-0 top-[13px] w-px bg-control" />}
                <span
                  className={cx(
                    'relative mt-[7px] block rounded-full',
                    last ? 'h-[11px] w-[11px] bg-accent ring-4 ring-accent-tint' : 'h-[7px] w-[7px] bg-ink',
                  )}
                />
              </div>
              <div className={cx('flex min-w-0 flex-col pb-3', last && 'pb-0')}>
                <span className="text-xs text-muted">{s.label}</span>
                <span
                  className={cx(
                    'min-w-0 break-words tabular-nums',
                    s.mono ? 'font-mono text-[13px]' : 'text-[15px] font-medium',
                    last && 'self-start rounded-[4px] bg-accent-tint px-1.5 font-semibold text-accent',
                  )}
                >
                  {s.value}
                </span>
                {s.detail && <span className="text-xs text-muted">{s.detail}</span>}
              </div>
            </li>
          );
        })}
      </ol>
      {after}
    </div>
  );
}

/**
 * Horizontal chain for a single cell's journey: raw value → … → GTQ. Wraps on narrow screens.
 * The first step is the outlined cell of the excerpt above it, so it carries the accent; the end is
 * the figure in the group number, in ink.
 */
export function Chain({ steps, label }: { steps: TrailStep[]; label: string }) {
  return (
    <>
      <style href="pg-trail" precedence="default">
        {CSS}
      </style>
      <ol aria-label={label} className="m-0 flex list-none flex-wrap items-stretch gap-y-3 p-0">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          const first = i === 0;
          return (
            <li key={s.label} className="pg-trail-step flex items-center" style={{ animationDelay: `${i * 70}ms` }}>
              <div
                className={cx(
                  'flex min-w-0 flex-col rounded-[6px] px-2.5 py-1.5',
                  first ? 'bg-accent-tint' : last ? 'border border-ink bg-raised' : 'border border-border',
                )}
              >
                <span className={cx('text-xs', first ? 'text-accent' : 'text-muted')}>{s.label}</span>
                <span
                  className={cx(
                    'whitespace-nowrap tabular-nums',
                    s.mono ? 'font-mono text-[13px]' : 'font-medium',
                    first && 'font-semibold text-accent',
                    last && 'font-semibold',
                  )}
                >
                  {s.value}
                </span>
              </div>
              {!last && (
                <span aria-hidden="true" className="px-1.5 text-muted">
                  →
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
