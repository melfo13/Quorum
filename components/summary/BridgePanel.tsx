'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Bridge, BridgeMetric } from '@/lib/engine/bridge';
import type { Segment } from '@/lib/engine/explain';
import { cx } from '@/components/ui/primitives';
import { money } from '@/lib/format';
import { Question } from './Question';

const METRICS: { id: BridgeMetric; label: string; end: string; closes: string }[] = [
  { id: 'revenue', label: 'Ingresos', end: 'Ingresos consolidados', closes: 'los ingresos consolidados' },
  { id: 'ebit', label: 'EBIT', end: 'EBIT consolidado', closes: 'el EBIT consolidado' },
  { id: 'eva', label: 'EVA', end: 'EVA consolidado', closes: 'el EVA consolidado' },
];

type Row = {
  key: string;
  label: string;
  parts: { label: string; cents: number; href: string }[];
  from: number;
  to: number;
  cents: number;
  kind: 'start' | 'step' | 'end';
};

function rowsOf(b: Bridge, endLabel: string): Row[] {
  const rows: Row[] = [{ key: 'simple', label: 'Suma simple de 6 empresas', parts: [], from: 0, to: b.simple, cents: b.simple, kind: 'start' }];
  let run = b.simple;
  for (const s of b.steps) {
    rows.push({
      key: s.id,
      label: s.label,
      parts: [],
      from: run,
      to: run + s.cents,
      cents: s.cents,
      kind: 'step',
    });
    run += s.cents;
  }
  rows.push({ key: 'end', label: endLabel, parts: [], from: 0, to: b.consolidated, cents: b.consolidated, kind: 'end' });
  return rows;
}

function Sentence({ segments }: { segments: Segment[] }) {
  return (
    <p className="m-0">
      {segments.map((s, i) =>
        s.href ? (
          <Link key={i} href={s.href} className="underline decoration-control underline-offset-[3px] hover:decoration-ink">
            {s.text}
          </Link>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}

export function BridgePanel({
  bridges,
  sentences,
}: {
  bridges: Record<BridgeMetric, Bridge>;
  sentences: Record<BridgeMetric, Segment[]>;
}) {
  const [metric, setMetric] = useState<BridgeMetric>('revenue');
  const b = bridges[metric];
  const m = METRICS.find((x) => x.id === metric)!;
  const rows = rowsOf(b, m.end);
  const values = rows.flatMap((r) => [r.from, r.to]);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const at = (v: number) => ((v - lo) / span) * 100;

  return (
    <Question
      id="q-puente"
      question="¿Por qué el número no es la suma de los archivos?"
      answer={<Sentence segments={sentences[metric]} />}
      aside={
        <div role="group" aria-label="Cifra del puente" className="flex">
          {METRICS.map((x, i) => {
            const on = x.id === metric;
            return (
              <button
                key={x.id}
                type="button"
                aria-pressed={on}
                onClick={() => setMetric(x.id)}
                className={cx(
                  'h-8 cursor-pointer border px-3 font-medium transition-colors',
                  i === 0 && 'rounded-l-[6px]',
                  i === METRICS.length - 1 && 'rounded-r-[6px]',
                  i > 0 && '-ml-px',
                  on ? 'relative z-10 border-primary bg-primary text-white' : 'border-control bg-surface text-ink hover:bg-raised',
                )}
              >
                {x.label}
              </button>
            );
          })}
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-5 pb-5 pt-5 sm:px-6">

      {/* Keyed on the metric so the bars grow again from the running total on every switch. CSS only:
          without script, or with reduced motion, the bars sit at their final size. */}
      <div key={metric} className="flex flex-col gap-3 sm:gap-2.5" role="table" aria-label={`Puente de ${m.label}`}>
        {rows.map((r, i) => {
          const left = at(Math.min(r.from, r.to));
          const width = Math.abs(at(r.to) - at(r.from));
          const end = r.kind === 'end';
          // A step that lowers the total grows leftwards from where the previous one stopped.
          const origin = r.kind === 'step' && r.to < r.from ? 'right' : 'left';
          const delay = `${i * 95}ms`;
          return (
            <div
              key={r.key}
              role="row"
              className={cx(
                'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1.5 sm:grid-cols-[240px_minmax(0,1fr)_112px] sm:items-center',
                end && 'border-t border-border pt-3',
              )}
            >
              <div role="rowheader" className="min-w-0">
                <div className={cx(end && 'font-semibold')}>{r.label}</div>
                {r.parts.length > 0 && (
                  <div className="flex min-w-0 flex-wrap gap-x-3 text-xs text-muted">
                    {r.parts.map((p) => (
                      <Link
                        key={p.label}
                        href={p.href}
                        className="truncate underline decoration-rule underline-offset-2 hover:text-ink hover:decoration-ink"
                      >
                        {p.label} <span className="tabular-nums">{money(p.cents, { sign: true })}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <div role="cell" className="col-span-2 row-start-2 h-5 sm:col-span-1 sm:col-start-2 sm:row-start-1" aria-hidden="true">
                <div
                  className={cx('pg-grow', end ? 'h-6 -mt-0.5' : 'h-5')}
                  style={{
                    marginLeft: `${left}%`,
                    width: `${width}%`,
                    minWidth: 3,
                    transformOrigin: origin,
                    animationDelay: delay,
                    background: end ? 'var(--accent)' : r.kind === 'start' ? 'var(--bar-muted)' : 'var(--bar-step)',
                  }}
                />
              </div>
              <div
                role="cell"
                className={cx('pg-fade text-right tabular-nums whitespace-nowrap sm:col-start-3', end && 'font-semibold')}
                style={{ animationDelay: delay }}
              >
                {r.kind === 'step' ? money(r.cents, { sign: true }) : money(r.cents)}
              </div>
            </div>
          );
        })}
      </div>
      {b.closes && <p className="m-0 text-xs text-muted">Cierra exacto: la suma simple más los tres pasos da {m.closes}.</p>}
      </div>
    </Question>
  );
}
