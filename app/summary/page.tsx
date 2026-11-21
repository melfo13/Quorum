/**
 * Resumen del grupo: what a director reads in ten seconds. The number (three figures), what needs
 * attention (at most four items, each with the screen that resolves it), and why the number is not
 * the sum of the files. Technical evidence lives in Carga, Empresas and Consolidado.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BridgePanel } from '@/components/summary/BridgePanel';
import { SummaryMotion } from '@/components/summary/Motion';
import { attentionItems, type AttentionTone } from '@/components/summary/attention';
import { Pill, TitleRow, cx } from '@/components/ui/primitives';
import { money, pct } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { getPrevious, getResult, getSource } from '@/lib/server/state';

export const metadata = { title: 'Resumen · PulseGroup' };

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
      <div className="absolute left-0 top-7 z-20 w-64 rounded-[6px] border border-border bg-surface p-3 text-[13px] font-normal leading-snug text-ink shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
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
        className="self-start text-[34px] font-semibold leading-tight tracking-[-0.02em] tabular-nums no-underline decoration-control decoration-1 underline-offset-[6px] hover:underline"
      >
        {value}
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
  const items = attentionItems(r, prev);

  return (
    <>
      <SummaryMotion />

      <TitleRow
        title="Resumen del grupo"
        sub={`Presupuesto ${r.fiscalYear} consolidado en ${r.assumptions.groupCurrency}.`}
        actions={
          open ? (
            <Link href="/load" className="no-underline">
              <Pill tone="warning" className="px-3 py-1 text-[13px]">
                {open} {open === 1 ? 'decisión pendiente' : 'decisiones pendientes'}
              </Pill>
            </Link>
          ) : (
            <Pill tone="positive" className="px-3 py-1 text-[13px]">
              Listo para el directorio
            </Pill>
          )
        }
      />

      <section
        aria-label="El número del grupo"
        className="grid grid-cols-1 divide-y divide-border rounded-[8px] border border-border bg-surface md:grid-cols-3 md:divide-x md:divide-y-0"
      >
        <Figure
          label="Ingresos"
          value={money(revenue)}
          href="/consolidated?line=revenue"
          note={
            gap > 0 ? (
              <a href="#puente" className="underline decoration-control underline-offset-2 hover:decoration-ink">
                {money(gap)} menos que sumar los archivos
              </a>
            ) : (
              'Igual que sumar los archivos'
            )
          }
        />
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
          note={`${creates ? 'Crea valor' : 'Destruye valor'}: rinde ${pct(kpis.roic)}, el capital cuesta ${pct(wacc)}`}
        />
      </section>

      <section aria-labelledby="atencion" className="flex flex-col gap-3 rounded-[8px] border border-border bg-surface p-5 sm:px-6">
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

      <div id="puente" className="scroll-mt-6">
        <BridgePanel bridges={r.bridges} sentences={r.sentences} />
      </div>
    </>
  );
}
