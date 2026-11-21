/**
 * Resumen del grupo: what a director reads in ten seconds. The number (three figures), what needs
 * attention (at most four items, each with the screen that resolves it), and why the number is not
 * the sum of the files. Technical evidence lives in Carga, Empresas and Consolidado.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BridgePanel } from '@/components/summary/BridgePanel';
import { attentionItems, valueDestroyers, type AttentionTone } from '@/components/summary/attention';
import { MetricValue, Pill, TitleRow, cx } from '@/components/ui/primitives';
import { QuickRead } from '@/components/agent/QuickRead';
import { MonthlyChart } from '@/components/summary/MonthlyChart';
import { monthly } from '@/components/summary/monthly';
import { money, monthName, pct } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { getPrevious, getResolutions, getResult, getSource } from '@/lib/server/state';

export const metadata = { title: 'Resumen · Quórum' };

const COUNTRY_NAME: Record<string, string> = { GTQ: 'Guatemala', CRC: 'Costa Rica', USD: 'Estados Unidos', MXN: 'México', HNL: 'Honduras' };

const listEs = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;

/** A small "?" that opens a one-sentence definition. No script: a native disclosure. */
function Help({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group relative inline-block align-middle">
      <summary
        aria-label={`Qué es ${label}`}
        className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full border border-control text-[11px] font-semibold text-muted hover:border-ink hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        ?
      </summary>
      <div className="absolute left-0 top-7 z-20 w-64 rounded-[10px] border border-border bg-surface p-3 text-[13px] font-normal leading-snug text-ink shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        {children}
      </div>
    </details>
  );
}

function Figure({
  label,
  help,
  value,
  href,
  note,
  noteTone,
}: {
  label: string;
  help?: ReactNode;
  value: string;
  href: string;
  note: ReactNode;
  noteTone?: 'negative';
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2 text-muted">
        <span>{label}</span>
        {help && <Help label={label}>{help}</Help>}
      </div>
      <Link
        href={href}
        className="self-start text-[44px] font-semibold leading-tight no-underline decoration-control decoration-1 underline-offset-[6px] hover:underline"
      >
        <MetricValue text={value} />
      </Link>
      <p className={cx('m-0 text-[13px]', noteTone === 'negative' ? 'text-negative' : 'text-muted')}>{note}</p>
    </div>
  );
}

const DOT: Record<AttentionTone, string> = {
  negative: 'bg-negative',
  warning: 'bg-[#d97706]',
  neutral: 'bg-[#9aa0a6]',
};

export default async function SummaryPage() {
  if ((await getSource()).kind === 'none') return <EmptyState title="Resumen del grupo" question="¿Cuánto gana el grupo y qué necesita tu atención?" />;

  const [r, prev] = await Promise.all([getResult(), getPrevious()]);
  const line = (id: string) => r.pl.find((l) => l.id === id)!.consolidated;
  const revenue = line('revenue');
  const ebit = line('ebit');
  const { kpis } = r;
  const wacc = r.assumptions.wacc;
  const creates = kpis.roic >= wacc;
  const gap = r.bridges.revenue.simple - r.bridges.revenue.consolidated;
  const open = r.openBlocks.length;
  // The year by month: the strongest month and the country that carries the year.
  const byMonth = monthly(r, 'revenue');
  const peak = byMonth.points.reduce((a, p) => (p.total > a.total ? p : a), byMonth.points[0]);
  const lead = byMonth.countries[0];
  const leadShare = revenue ? byMonth.points.reduce((a, p) => a + (p.parts[lead] ?? 0), 0) / revenue : 0;
  const yearAnswer = `${monthName(peak.period).replace(/^./, (c) => c.toUpperCase())} es el mes más fuerte, con ${money(peak.total)}; ${COUNTRY_NAME[lead] ?? lead} aporta el ${pct(leadShare, 0)} de los ingresos del año.`;
  const source = await getSource();
  // The agent's quick reading is asked again when the data or the decisions change.
  const readingVersion = JSON.stringify([source.kind === 'upload' ? source.id : source.kind, await getResolutions()]);
  const items = attentionItems(r, prev);
  const destroyers = valueDestroyers(r);
  const shown = destroyers.slice(0, 3).map((d) => `${d.name} (${pct(d.roic)})`);
  if (destroyers.length > 3) shown.push(`${destroyers.length - 3} más`);

  return (
    <>

      <TitleRow
        title="Resumen del grupo"
        sub={`Presupuesto ${r.fiscalYear} consolidado en ${r.assumptions.groupCurrency}.`}
      />

      {/* One hero: the group's number and whether it can be presented. EBIT and EVA beside it, smaller.
          The blocks enter in sequence (pg-fade, 90ms apart); reduced motion shows them at rest. */}
      <section aria-label="El número del grupo" className="grid grid-cols-1 gap-6 @4xl/main:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="pg-fade card flex min-w-0 flex-col justify-between gap-6 p-7 sm:p-8" style={{ animationDelay: '0ms' }}>
          <div className="flex flex-col gap-2">
            <span className="text-muted">Ingresos consolidados del grupo</span>
            <Link
              href="/consolidated?line=revenue"
              className="self-start text-[64px] font-semibold leading-none no-underline decoration-control decoration-2 underline-offset-[10px] hover:underline sm:text-[76px]"
            >
              <MetricValue text={money(revenue)} />
            </Link>
            <p className="m-0 text-[15px] text-muted">
              {gap > 0 ? (
                <a href="#puente" className="underline decoration-control underline-offset-2 hover:decoration-ink">
                  {money(gap)} menos que sumar los seis archivos
                </a>
              ) : (
                'Igual que sumar los seis archivos'
              )}
              {' · '}presupuesto {r.fiscalYear} en {r.assumptions.groupCurrency}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {open ? (
              <Link href="/load" className="no-underline">
                <Pill tone="warning" className="px-3 py-1 text-[13px]">
                  {open} {open === 1 ? 'bloqueo pendiente' : 'bloqueos pendientes'}: aún no se puede presentar
                </Pill>
              </Link>
            ) : (
              <span title="No hay bloqueos ni decisiones pendientes: el número del grupo se puede presentar a la junta directiva.">
                <Pill tone="positive" className="px-3 py-1 text-[13px]">
                  Listo para la junta directiva
                </Pill>
              </span>
            )}
            <Link href="/consolidated?line=revenue" className="font-medium underline decoration-control underline-offset-[3px] hover:decoration-ink">
              Ver de dónde sale, hasta la celda →
            </Link>
          </div>
        </div>
        <div className="pg-fade grid grid-cols-1 divide-y divide-border card" style={{ animationDelay: '90ms' }}>
        <Figure
          label="EBIT"
          help="Lo que gana la operación antes de intereses e impuestos."
          value={money(ebit)}
          href="/consolidated?line=ebit"
          note={`${pct(revenue ? ebit / revenue : 0)} de margen sobre ingresos`}
        />
        <Figure
          label="EVA"
          help={
            <>
              La ganancia que queda después de pagar el costo de todo el capital invertido. Crea valor cuando el
              rendimiento (ROIC) supera lo que cuesta el capital (WACC).
            </>
          }
          value={money(kpis.eva)}
          href="/consolidated?kpi=EVA"
          noteTone={creates ? undefined : 'negative'}
          note={
            <>
              <span className="block">
                El grupo {creates ? 'crea' : 'destruye'} valor: su capital rinde {pct(kpis.roic)} y cuesta {pct(wacc)}.
              </span>
              <span className="mt-1 block text-muted">
                {destroyers.length ? (
                  <>
                    {destroyers.length === 1 ? 'Destruye valor' : 'Destruyen valor'}: {listEs(shown)}.{' '}
                    <Link href="/companies" className="underline decoration-control underline-offset-2 hover:decoration-ink">
                      Ver empresas
                    </Link>
                  </>
                ) : (
                  `Cada empresa rinde más de ${pct(wacc)}.`
                )}
              </span>
            </>
          }
        />
        </div>
      </section>

      <div className="pg-fade" style={{ animationDelay: '180ms' }}>
        <QuickRead version={readingVersion} />
      </div>

      <section aria-labelledby="atencion" className="pg-fade flex flex-col gap-3 card p-5 sm:px-6" style={{ animationDelay: '270ms' }}>
        <h2 id="atencion" className="m-0 text-base font-semibold">
          Lo que necesita tu atención
        </h2>
        {items.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {items.map((it) => (
              <li
                key={it.id}
                className="grid grid-cols-[12px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-b border-rule py-3 last:border-b-0 sm:grid-cols-[12px_minmax(0,1fr)_minmax(0,auto)_auto] sm:gap-x-4"
              >
                <span aria-hidden="true" className={cx('h-2 w-2 translate-y-[-1px] rounded-full', DOT[it.tone])} />
                <span className="font-medium">{it.title}</span>
                <span className="col-start-2 text-muted sm:col-start-3 sm:text-right">{it.detail}</span>
                <Link
                  href={it.href}
                  className="col-start-2 whitespace-nowrap font-medium underline decoration-control underline-offset-[3px] hover:decoration-ink sm:col-start-4 sm:text-right"
                >
                  {it.action} →
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-muted">Nada pendiente. El número está listo para presentarse.</p>
        )}
      </section>

      <section aria-labelledby="ano" className="pg-fade flex flex-col gap-4 card p-5 sm:px-6" style={{ animationDelay: '320ms' }}>
        <div className="flex flex-col gap-1">
          <h2 id="ano" className="m-0 text-base font-semibold">
            ¿Cómo se reparte el año?
          </h2>
          <p className="m-0 text-xl leading-snug">{yearAnswer}</p>
        </div>
        <MonthlyChart series={{ revenue: byMonth, ebit: monthly(r, 'ebit') }} names={COUNTRY_NAME} />
      </section>

      <div id="puente" className="pg-fade scroll-mt-6" style={{ animationDelay: '360ms' }}>
        <BridgePanel bridges={r.bridges} sentences={r.sentences} />
      </div>
    </>
  );
}
