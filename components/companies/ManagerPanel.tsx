/**
 * "¿Cómo le va a Empresa X?": what the company brings to the group first (revenue, EBIT, ROIC against
 * the WACC, EVA), in one sentence and four figures. How clean its file arrived is a quiet footnote;
 * the open fixes, if any, stay folded under it for whoever has to chase them.
 */
import Link from 'next/link';
import { MetricValue, Pill, cx } from '@/components/ui/primitives';
import { int, money, pct } from '@/lib/format';
import type { CompanyValue, GroupValue } from './model';
import { tasksOf } from './model';

const SEVERITY: Record<string, string> = { block: 'Bloqueo', quarantine: 'Cuarentena', warning: 'Aviso' };

export function Switcher({ g, selected }: { g: GroupValue; selected: string }) {
  return (
    <nav aria-label="Empresa" className="flex flex-wrap gap-1.5">
      {g.companies.map((c) => {
        const on = c.id === selected;
        return (
          <Link
            key={c.id}
            href={`/companies?empresa=${c.id}`}
            scroll={false}
            aria-current={on ? 'page' : undefined}
            className={cx(
              'inline-flex h-8 items-center gap-1.5 rounded-[10px] border px-2.5 font-medium no-underline transition-colors',
              on ? 'border-ink bg-ink !text-white' : 'border-control bg-surface text-ink hover:bg-raised',
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                'h-2 w-2 rounded-full',
                c.held ? 'bg-control' : c.creates ? 'bg-positive' : 'bg-negative',
              )}
            />
            {c.name}
          </Link>
        );
      })}
    </nav>
  );
}

function Figure({
  label,
  value,
  note,
  children,
}: {
  label: string;
  value: string;
  note?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[14px] border border-border bg-surface px-4 py-3">
      <span className="text-xs text-muted">{label}</span>
      <MetricValue text={value} className="text-[28px] leading-tight" />
      {children}
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

export function ManagerPanel({
  c,
  g,
  name,
}: {
  c: CompanyValue;
  g: GroupValue;
  name: (id: string) => string;
}) {
  const tasks = tasksOf(c, name);
  const cleanShare = c.rowsRead ? c.rowsClean / c.rowsRead : 0;
  const gap = `${Math.abs(c.spread * 100).toFixed(1)} puntos ${c.spread >= 0 ? 'sobre' : 'bajo'} el WACC`;
  const answer = c.held
    ? 'Retenida por un bloqueo en su archivo: todavía no aporta al número del grupo.'
    : c.creates
      ? `Rinde ${pct(c.roic)} sobre su capital, ${gap}: suma ${money(c.evaGtq)} de EVA al grupo.`
      : `Rinde ${pct(c.roic)} sobre su capital, ${gap}: resta ${money(Math.abs(c.evaGtq))} de EVA al grupo.`;
  const scale = Math.max(2 * g.wacc, c.roic * 1.1, 0.01);

  return (
    <section aria-labelledby="q-empresa" className="flex min-w-0 flex-col gap-5 card p-5 sm:px-6">
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h2 id="q-empresa" className="m-0 text-base font-semibold">
            ¿Cómo le va a {c.name}?
          </h2>
          <Pill tone={c.held ? 'neutral' : c.creates ? 'positive' : 'negative'}>
            {c.held ? 'Retenida' : c.creates ? 'Crea valor' : 'Destruye valor'}
          </Pill>
        </div>
        <p className="m-0 max-w-[920px] text-xl leading-snug">{answer}</p>
      </header>

      {!c.held && (
        <div key={c.id} className="grid grid-cols-2 gap-3 @4xl/main:grid-cols-4">
          <Figure
            label="Ingresos al grupo"
            value={money(c.revenue)}
            note={`${pct(c.revenueShare, 0)} de los ingresos del grupo`}
          />
          <Figure label="EBIT antes de eliminaciones" value={money(c.ebit)} note={`ROCE ${pct(c.roce)}`} />
          <Figure label="ROIC" value={pct(c.roic)} note={`WACC ${pct(g.wacc)} (la marca)`}>
            <div className="relative mt-1 h-1.5 w-full rounded-full bg-[var(--track)]" aria-hidden="true">
              <div
                className="qm-grow-x absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.min(100, (Math.max(0, c.roic) / scale) * 100)}%`,
                  background: c.creates ? 'var(--positive)' : 'var(--negative)',
                  animationDelay: '250ms',
                }}
              />
              <div
                className="absolute -bottom-1 -top-1 w-px bg-ink"
                style={{ left: `${(g.wacc / scale) * 100}%` }}
              />
            </div>
          </Figure>
          <Figure
            label="EVA, en GTQ"
            value={money(c.evaGtq)}
            note={c.evaGtq < 0 ? 'Destruye valor' : 'Crea valor'}
          />
        </div>
      )}

      {/* The file's state: a footnote, with the fixes folded away for whoever has to chase them. */}
      <div className="flex flex-col gap-2 border-t border-rule pt-3 text-[13px] text-muted">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <span>
            Su archivo: {int(c.rowsClean)} de {int(c.rowsRead)} filas limpias ({pct(cleanShare, 0)})
            {tasks.length ? '' : ' · sin pendientes'}
          </span>
          <span className="flex flex-wrap gap-x-4">
            <Link
              href={`/consolidated?line=revenue&company=${c.id}`}
              className="text-muted underline decoration-control underline-offset-[3px] hover:text-ink"
            >
              Ver su rastro
            </Link>
            <Link
              href={`/load/${c.id}/mapping`}
              className="text-muted underline decoration-control underline-offset-[3px] hover:text-ink"
            >
              Ver su mapeo
            </Link>
          </span>
        </div>
        {tasks.length > 0 && (
          <details className="group">
            <summary className="w-fit cursor-pointer list-none underline decoration-dotted underline-offset-[3px] hover:text-ink">
              {tasks.length} {tasks.length === 1 ? 'ajuste pendiente' : 'ajustes pendientes'} en su archivo
              <span
                className="ml-1 inline-block transition-transform group-open:rotate-90"
                aria-hidden="true"
              >
                ›
              </span>
            </summary>
            <ol className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
              {tasks.map((t) => (
                <li key={t.key} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xs">{SEVERITY[t.severity] ?? t.severity}:</span>
                  <Link
                    href={t.href}
                    className="text-ink underline decoration-control underline-offset-[3px]"
                  >
                    {t.title}
                  </Link>
                  <span>{t.detail}</span>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </section>
  );
}
