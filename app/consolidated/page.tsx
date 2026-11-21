import Link from 'next/link';
import { PL_LINES } from '@/lib/engine/catalog';
import type { KpiName } from '@/lib/engine/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { getDataset, getResult, getSource } from '@/lib/server/state';
import { getExcerpts } from '@/lib/server/excerpt';
import { money, pct } from '@/lib/format';
import { MetricValue, Panel, TitleRow, cx } from '@/components/ui/primitives';
import { StatementTable } from '@/components/consolidated/StatementTable';
import { KpiPanel, LinePanel } from '@/components/consolidated/AuditPanel';
import { lineAudit } from '@/components/consolidated/audit';
import { ExportButton } from '@/components/consolidated/ExportButton';

type Search = Promise<{ line?: string; kpi?: string; company?: string }>;

const KPIS: KpiName[] = ['EVA', 'ROIC', 'ROCE'];

export default async function ConsolidatedPage({ searchParams }: { searchParams: Search }) {
  if ((await getSource()).kind === 'none') return <EmptyState title="Estado de resultados consolidado" question="¿De dónde sale cada cifra del grupo?" />;

  const q = await searchParams;
  const r = await getResult();
  const kpi = KPIS.find((k) => k === q.kpi?.toUpperCase()) ?? null;
  const closed = q.line === 'none' && !kpi;
  const lineId = !kpi && !closed ? (PL_LINES.find((l) => l.id === q.line)?.id ?? 'revenue') : null;
  const audit = lineId ? lineAudit(r, lineId, q.company ?? null) : null;
  const traceCell = audit?.trace?.cellId ?? audit?.largestCellId ?? null;
  const excerpt = traceCell ? (getExcerpts(getDataset(), [traceCell])[0] ?? null) : null;
  const kpiData = kpi ? r.kpis.list.find((k) => k.name === kpi)! : null;

  const heldCompanies = [...new Set(r.openBlocks.flatMap((f) => f.companyIds))].map(
    (id) => r.companies.find((c) => c.id === id)?.name ?? id,
  );

  const kpiCell = (name: KpiName, value: string, lead: boolean) => (
    <div className="flex min-w-0 flex-col items-start gap-1 p-5">
      <div className="text-muted">{name}</div>
      <Link
        href={`/consolidated?kpi=${name}`}
        scroll={false}
        aria-current={kpi === name ? 'true' : undefined}
        className={cx(
          'tabular-nums no-underline decoration-1 underline-offset-[6px] transition-colors hover:text-muted',
          lead ? 'text-[40px] font-semibold leading-[1.15]' : 'text-[32px] font-medium leading-[1.3]',
          kpi === name ? 'underline decoration-solid' : 'underline decoration-dotted',
        )}
      >
        <MetricValue text={value} />
      </Link>
    </div>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-6">
        <TitleRow
          title="Estado de resultados consolidado"
          sub={`En millones de ${r.assumptions.groupCurrency}. Cada cifra abre los registros que la forman.`}
          actions={<ExportButton />}
        />
        {heldCompanies.length > 0 && (
          <p className="m-0 rounded-[10px] bg-warn-bg px-3 py-2 text-xs text-warn-ink ring-1 ring-inset ring-warn-border">
            {r.openBlocks.length} {r.openBlocks.length === 1 ? 'bloqueo abierto deja' : 'bloqueos abiertos dejan'} filas de {heldCompanies.join(', ')} fuera
            de estas cifras.{' '}
            <Link href="/load" className="font-medium">
              Resolver en Configuración
            </Link>
          </p>
        )}
        <Panel label="Estado de resultados">
          <StatementTable pl={r.pl} selected={lineId} />
          <p className="m-0 text-xs text-muted">
            La suma de empresas ya está convertida a {r.assumptions.groupCurrency} con las tasas del grupo y no incluye las filas
            en cuarentena. Por eso puede diferir de lo que suman los archivos tal como llegan;{' '}
            <Link href="/summary#puente" className="font-medium text-ink">
              la conciliación en Resumen
            </Link>{' '}
            explica la diferencia paso a paso.
          </p>
        </Panel>
        <section
          aria-label="Rentabilidad calculada"
          className="grid grid-cols-1 divide-y divide-border card sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        >
          {kpiCell('EVA', money(r.kpis.eva), true)}
          {kpiCell('ROIC', pct(r.kpis.roic), false)}
          {kpiCell('ROCE', pct(r.kpis.roce), false)}
        </section>
      </div>

      {audit && <LinePanel a={audit} highlight={q.company ?? null} excerpt={excerpt} />}
      {kpiData && <KpiPanel kpi={kpiData} />}
      {closed && (
        <aside
          aria-label="Origen de la cifra"
          className="flex flex-col gap-2 rounded-[16px] border border-dashed border-control bg-surface p-5 text-muted @4xl/main:sticky @4xl/main:top-6"
        >
          <h2 className="m-0 text-sm font-semibold text-ink">Origen de una cifra</h2>
          <p className="m-0">Elige cualquier cifra consolidada o indicador para ver de dónde sale, hasta la celda.</p>
        </aside>
      )}
    </div>
  );
}
