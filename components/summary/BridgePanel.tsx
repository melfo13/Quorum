'use client';

/**
 * "¿Por qué el consolidado no es la suma de los archivos?" as an accountant's reconciliation: what the
 * six files add up to, each adjustment with what it is, how much it weighs and where it comes from,
 * and the consolidated figure. The adjustments get their own bar scale (against the largest
 * adjustment, not the total, which would flatten them); adjustments of zero are not listed.
 */
import Link from 'next/link';
import { useState } from 'react';
import type { Bridge, BridgeMetric, BridgeStep } from '@/lib/engine/bridge';
import type { Segment } from '@/lib/engine/explain';
import { cx } from '@/components/ui/primitives';
import { money, pct } from '@/lib/format';
import { Question } from './Question';

const METRICS: { id: BridgeMetric; label: string; end: string }[] = [
  { id: 'revenue', label: 'Ingresos', end: 'Ingresos consolidados' },
  { id: 'ebit', label: 'EBIT', end: 'EBIT consolidado' },
  { id: 'eva', label: 'EVA', end: 'EVA consolidado' },
];

/** What each adjustment is, in the words an accountant would use with the board. */
const WHY: Record<BridgeStep['id'], { title: string; why: string; action?: { label: string; href: string } }> = {
  ic: {
    title: 'Eliminaciones entre empresas',
    why: 'Ventas y compras dentro del grupo: se eliminan porque el grupo no puede venderse a sí mismo.',
    action: { label: 'Ver las eliminaciones en Consolidado', href: '/consolidated?line=4100' },
  },
  fx: {
    title: 'Tipo de cambio del grupo',
    why: 'Algunos archivos traían su propia tasa; el consolidado convierte todo con la tasa del grupo.',
    action: { label: 'Ver la conversión en Consolidado', href: '/consolidated?line=revenue' },
  },
  quarantine: {
    title: 'Filas fuera del número',
    why: 'Filas con error que no entran al consolidado hasta que alguien las corrija.',
    action: { label: 'Resolver en Configuración', href: '/load' },
  },
};

const MAX_PARTS = 3;

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

function Step({ s, largest, base, compare }: { s: BridgeStep; largest: number; base: number; compare: boolean }) {
  const w = WHY[s.id];
  const share = base ? Math.abs(s.cents) / Math.abs(base) : 0;
  const more = s.parts.length - MAX_PARTS;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 border-b border-rule py-4 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="font-medium">{w.title}</div>
        <p className="m-0 text-[13px] text-muted">{w.why}</p>
      </div>
      <div className="flex flex-col items-end gap-1 text-right">
        <span className="whitespace-nowrap font-semibold tabular-nums">{money(s.cents, { sign: true })}</span>
        <span className="whitespace-nowrap text-xs text-muted tabular-nums">{pct(share)} de la suma</span>
      </div>
      {/* The adjustment's size against the largest one; only worth drawing when there are several. */}
      {compare && (
        <div className="col-span-2 h-1 w-full rounded-full bg-[var(--track)]" aria-hidden="true">
          <div
            className="h-1 rounded-full bg-[var(--bar-muted)]"
            style={{ width: `${Math.max(2, (Math.abs(s.cents) / largest) * 100)}%` }}
          />
        </div>
      )}
      {s.parts.length > 0 && (
        <ul className="col-span-2 m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
          {s.parts.slice(0, MAX_PARTS).map((p) => (
            <li key={p.label} className="flex items-baseline justify-between gap-4">
              <Link href={p.href} className="min-w-0 truncate underline decoration-rule underline-offset-2 hover:decoration-ink">
                {p.label}
              </Link>
              <span className="whitespace-nowrap text-muted tabular-nums">{money(p.cents, { sign: true })}</span>
            </li>
          ))}
          {more > 0 && <li className="text-muted">y {more} más</li>}
        </ul>
      )}
      {w.action && (
        <Link
          href={w.action.href}
          className="col-span-2 justify-self-start text-[13px] font-medium underline decoration-control underline-offset-[3px] hover:decoration-ink"
        >
          {w.action.label} →
        </Link>
      )}
    </li>
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
  const steps = b.steps.filter((s) => Math.abs(s.cents) >= 100); // less than Q 1 is not an adjustment
  const largest = Math.max(1, ...steps.map((s) => Math.abs(s.cents)));

  return (
    <Question
      id="q-puente"
      question="¿Por qué el consolidado no es la suma de los archivos?"
      answer={<Sentence segments={sentences[metric]} />}
      aside={
        <div role="group" aria-label="Cifra de la conciliación" className="flex">
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
                  on ? 'relative z-10 border-brand-tint bg-brand-tint text-[var(--accent)]' : 'border-control bg-surface text-ink hover:bg-raised',
                )}
              >
                {x.label}
              </button>
            );
          })}
        </div>
      }
    >
      <div className="flex flex-col px-5 pb-5 pt-4 sm:px-6" role="group" aria-label={`Conciliación de ${m.label}`}>
        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
          <span className="flex flex-col">
            <span>Lo que suman los seis archivos tal como llegan</span>
            <span className="text-xs text-muted">Con la tasa que traía cada archivo y antes de quitar errores</span>
          </span>
          <span className="font-semibold tabular-nums">{money(b.simple)}</span>
        </div>
        {steps.length ? (
          <ul className="m-0 list-none p-0">
            {steps.map((s) => (
              <Step key={s.id} s={s} largest={largest} base={b.simple} compare={steps.length > 1} />
            ))}
          </ul>
        ) : (
          <p className="m-0 py-4 text-muted">Sin ajustes: el consolidado es exactamente la suma de los archivos.</p>
        )}
        <div className="flex items-baseline justify-between gap-4 border-t border-ink pt-3">
          <span className="font-semibold">{m.end}</span>
          <span className="text-lg font-semibold tabular-nums">{money(b.consolidated)}</span>
        </div>
        {b.closes && <p className="m-0 pt-2 text-xs text-muted">Cuadra al centavo con el estado de resultados consolidado.</p>}
      </div>
    </Question>
  );
}
