import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { approveMapping } from '@/app/actions';
import { accountRows, columnRows, controlSummary, type AccountRow } from '@/components/mapping/model';
import { Chain } from '@/components/consolidated/Trail';
import { SourceExcerpt } from '@/components/ui/SourceExcerpt';
import { Button, Panel, Pill, Ref, Strip, TitleRow } from '@/components/ui/primitives';
import { ACCOUNT } from '@/lib/engine/catalog';
import { getExcerpts } from '@/lib/server/excerpt';
import { EmptyState } from '@/components/ui/EmptyState';
import { getDataset, getResult, getSource } from '@/lib/server/state';
import { int, local, money, monthName } from '@/lib/format';

export const dynamic = 'force-dynamic';

function StructureCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-5 py-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function AccountTable({ rows }: { rows: AccountRow[] }) {
  return (
    <table className="ledger table-fixed">
      <colgroup>
        <col className="w-[50%]" />
        <col />
        <col className="w-14" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className="sticky top-0 z-10 bg-surface !px-2">
            Cuenta local
          </th>
          <th scope="col" className="sticky top-0 z-10 bg-surface !px-2">
            Cuenta del grupo
          </th>
          <th scope="col" className="num sticky top-0 z-10 bg-surface !px-2">
            Filas
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.local}>
            <th scope="row" className="!px-2 font-normal">
              <span className="block truncate">
                {a.local} <span className="text-muted">{a.localName}</span>
              </span>
            </th>
            <td className="!px-2">
              {a.group ? (
                <span className="block truncate">{a.groupName}</span>
              ) : (
                <Pill tone="negative">Sin destino</Pill>
              )}
            </td>
            <td className="num !px-2">{int(a.rows)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function MappingPage({ params }: { params: Promise<{ company: string }> }) {
  if ((await getSource()).kind === 'none') return <EmptyState title="Mapeo" question="¿Se leyó bien cada archivo?" />;

  const { company: id } = await params;
  const [r, ds] = [await getResult(), getDataset()];
  const mapping = ds.mappings.find((m) => m.companyId === id);
  const company = r.companies.find((c) => c.id === id);
  if (!mapping || !company) notFound();

  const facts = r.facts.filter((f) => f.companyId === id);
  const columns = columnRows(mapping, ds, r.fiscalYear);
  const accounts = accountRows(facts);
  const withDestination = accounts.filter((a) => a.group).length;
  const control = controlSummary(r, id, facts);
  const approved = company.mappingStatus === 'approved';

  // How a cell lands: the largest sales cell of this company.
  const sales = facts.filter((f) => f.groupAccount === '4000');
  const pool = sales.length
    ? sales
    : facts.filter((f) => f.groupAccount && ACCOUNT.get(f.groupAccount)?.kind === 'revenue');
  const sample = pool.reduce<(typeof pool)[number] | null>(
    (best, f) => (!best || f.amountLocal > best.amountLocal ? f : best),
    null,
  );
  const excerpt = sample ? getExcerpts(ds, [sample.sourceCellId], { max: 1 })[0] : undefined;
  const contribution = sample
    ? r.cells.flatMap((c) => c.contributions).find((c) => c.factId === sample.id)
    : undefined;
  const groupRate = sample
    ? (r.assumptions.rates.find(
        (x) => x.currency === mapping.currency && x.period === sample.period && x.rateType === 'avg',
      )?.rate ?? (mapping.currency === r.assumptions.groupCurrency ? 1 : null))
    : null;
  const heldBy = sample?.heldBy[0] ? r.findings.find((f) => f.id === sample.heldBy[0]) : undefined;
  const origin = excerpt ? excerpt.origin.replace(`${mapping.file} · `, '') : '';
  const factPairs: [string, string][] = sample
    ? [
        ['Empresa', company.name],
        ['Mes', monthName(sample.period)],
        ['Cuenta del grupo', ACCOUNT.get(sample.groupAccount!)?.name ?? ''],
        ['Monto', local(sample.amountLocal, mapping.currency)],
      ]
    : [];
  const HELD: Record<string, string> = {
    FX_INVERTED: 'la tasa propia del archivo parece invertida',
    FX_MISSING: 'su moneda no tiene tasa del grupo',
    BS_UNBALANCED: 'el balance no cuadra',
    DUPLICATE_ROW: 'la fila está duplicada',
    SIGN_INVERTED: 'el signo está invertido',
    ACCOUNT_UNMAPPED: 'la cuenta no tiene destino',
  };
  const rawValue =
    excerpt?.rows.find((x) => x.isTarget)?.cells[excerpt.rows.find((x) => x.isTarget)!.marked[0]] ?? '';

  const unit = mapping.scale === 1000 ? `Miles de ${mapping.currency}` : mapping.currency;
  const sheetNames = mapping.sheets.map((s) => s.sheet);
  const controlOk = control.checked > 0 ? control.matching === control.checked : null;
  const revenueDiff =
    control.revenueStated === null
      ? null
      : Math.round((control.revenueStated - control.revenueRead) * 100) / 100;

  const sentence = [
    `${withDestination} de ${accounts.length} cuentas locales tienen destino.`,
    control.checked
      ? controlOk
        ? `Los ${int(control.checked)} totales que trae el archivo coinciden.`
        : `${int(control.checked - control.matching)} de ${int(control.checked)} totales que trae el archivo no coinciden.`
      : 'El archivo no trae totales para verificar.',
    `${int(company.rowsClean)} de ${int(company.rowsRead)} filas entraron limpias.`,
  ].join(' ');

  async function approve() {
    'use server';
    await approveMapping(id);
    redirect('/load');
  }

  return (
    <>
      <TitleRow
        crumb={
          <>
            <Link href="/load" className="text-muted hover:text-ink">
              Carga
            </Link>{' '}
            / {company.name}
          </>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span>
              Mapeo de <span className="inline-block max-w-full truncate align-bottom">{mapping.file}</span>
            </span>
            {approved ? (
              <Pill tone="positive">Aprobado</Pill>
            ) : (
              <Pill tone="neutral">Propuesto, falta aprobar</Pill>
            )}
          </span>
        }
        sub={sentence}
        actions={
          approved ? undefined : (
            <form action={approve}>
              <Button type="submit" variant="primary">
                Aprobar mapeo
              </Button>
            </form>
          )
        }
      />

      <Strip label="Estructura detectada">
        <StructureCell
          label={sheetNames.length > 1 ? `Hojas (${sheetNames.length})` : 'Hoja'}
          value={sheetNames.join(', ')}
        />
        <StructureCell label="Encabezado" value={`Fila ${mapping.sheets[0].headerRow}`} />
        <StructureCell label="Forma" value={company.shape} />
        <StructureCell label="Unidad" value={unit} />
        <StructureCell
          label="Signo de los gastos"
          value={mapping.expenseSign === 'negative' ? 'Negativo' : 'Positivo'}
        />
      </Strip>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            title="Columnas del archivo"
            aside={
              sheetNames.length > 1 ? `Mismas columnas en ${sheetNames.length} hojas` : `Hoja ${sheetNames[0]}`
            }
          >
            <div className="overflow-x-auto">
              <table className="ledger min-w-[520px]">
                <thead>
                  <tr>
                    <th scope="col">Columna</th>
                    <th scope="col">Ejemplo</th>
                    <th scope="col">Campo del grupo</th>
                    <th scope="col">Propuesta</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((c) => (
                    <tr key={c.label}>
                      <th scope="row" className="font-normal">
                        <Ref>{c.label}</Ref>
                      </th>
                      <td className="max-w-[200px] truncate">
                        {c.example || <span className="text-faint">—</span>}
                      </td>
                      <td className={c.field === 'Sin destino' ? 'text-muted' : undefined}>{c.field}</td>
                      <td>
                        {c.review ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <Pill tone="negative">Revisar</Pill>
                            <span className="text-xs text-muted">{c.review}</span>
                          </span>
                        ) : (
                          <span className="text-muted">Segura</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="m-0 text-xs text-muted">
              Leído según <Ref>mappings/{id.toLowerCase()}.json</Ref>. Para cambiar la lectura, cambia ese archivo.
            </p>
          </Panel>

          <Panel title="Así queda una celda">
            {sample && excerpt ? (
              <>
                <SourceExcerpt excerpt={excerpt} maxColumns={3} />
                {/* The normalized fact: a one-row table on wider screens, label and value pairs on a phone. */}
                <div className="hidden min-w-0 overflow-x-auto sm:block">
                  <table className="ledger">
                    <thead>
                      <tr>
                        <th scope="col">Empresa</th>
                        <th scope="col">Mes</th>
                        <th scope="col">Cuenta del grupo</th>
                        <th scope="col" className="num">
                          Monto
                        </th>
                        <th scope="col">Origen</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row" className="whitespace-nowrap font-medium">
                          {company.name}
                        </th>
                        <td>{monthName(sample.period)}</td>
                        <td>{ACCOUNT.get(sample.groupAccount!)?.name}</td>
                        <td className="num">{local(sample.amountLocal, mapping.currency)}</td>
                        <td>
                          <Ref className="text-muted">{origin}</Ref>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 sm:hidden">
                  {factPairs.map(([k, v]) => (
                    <div key={k} className="flex min-w-0 flex-col gap-0.5">
                      <dt className="text-xs text-muted">{k}</dt>
                      <dd className="m-0 truncate font-medium tabular-nums">{v}</dd>
                    </div>
                  ))}
                  <div className="col-span-2 flex flex-col gap-0.5">
                    <dt className="text-xs text-muted">Origen</dt>
                    <dd className="m-0">
                      <Ref className="text-muted">{origin}</Ref>
                    </dd>
                  </div>
                </dl>
                <Chain
                  label={`Una celda de ${mapping.file} hasta el número del grupo`}
                  steps={[
                    { label: `Celda ${sample.sourceCellId.split('!')[2]}`, value: rawValue || '—', mono: true },
                    {
                      label: mapping.scale === 1000 ? 'Leído, × 1,000' : 'Leído',
                      value: local(sample.amountAsTyped, mapping.currency),
                    },
                    { label: 'Cuenta del grupo', value: `${sample.groupAccount} ${ACCOUNT.get(sample.groupAccount!)?.name ?? ''}` },
                    {
                      label: `Tasa promedio de ${monthName(sample.period)}`,
                      value: groupRate === null ? 'Sin tasa' : `× ${groupRate}`,
                    },
                    {
                      label: contribution ? 'En el número del grupo' : 'Fuera del número',
                      value: contribution
                        ? money(contribution.cents, { currency: r.assumptions.groupCurrency, compact: false })
                        : heldBy
                          ? (HELD[heldBy.ruleId] ?? heldBy.ruleId)
                          : 'No se cuenta',
                    },
                  ]}
                />
              </>
            ) : (
              <p className="m-0 rounded-[8px] border border-dashed border-control px-3 py-2.5 text-muted">
                No se leyó ninguna celda de ventas de este archivo.
              </p>
            )}
          </Panel>
        </div>

        {/* On desktop the right column takes the left column's height; the account list scrolls inside its card. */}
        <div className="relative min-w-0">
          <div className="flex min-h-0 flex-col gap-6 lg:absolute lg:inset-0">
            <Panel
              title="Cuentas"
              aside={`${withDestination} de ${accounts.length} con destino`}
              className="min-h-0 lg:flex-1"
            >
              <div
                className="max-h-[420px] min-h-0 overflow-y-auto lg:max-h-none lg:flex-1"
                tabIndex={0}
                aria-label={`Las ${accounts.length} cuentas`}
              >
                <AccountTable rows={accounts} />
              </div>
            </Panel>

            <Panel
              className="flex-none"
              title="Total de control"
              aside={
                controlOk === null ? (
                  <Pill tone="neutral">El archivo no trae totales</Pill>
                ) : controlOk ? (
                  <Pill tone="positive">Coincide</Pill>
                ) : (
                  <Pill tone="negative">No coincide</Pill>
                )
              }
            >
              <p className="m-0 text-muted">
                {control.checked
                  ? `Se verificaron ${int(control.checked)} totales que trae el archivo; ${int(control.matching)} coinciden.`
                  : 'Este archivo no trae subtotales ni columna de total; los ingresos se verifican solo fila por fila.'}
              </p>
              {control.firstMismatch && (
                <div className="flex flex-col gap-1 rounded-[6px] bg-neg-bg px-3 py-2.5 text-neg-ink">
                  <Ref>
                    {mapping.file} · fila {control.firstMismatch.row}
                  </Ref>
                  <span>{control.firstMismatch.expected}</span>
                  <span>{control.firstMismatch.actual}</span>
                </div>
              )}
              <dl className="m-0 flex flex-col">
                <div className="flex justify-between gap-3 border-b border-rule py-2">
                  <dt>Ingresos leídos fila por fila</dt>
                  <dd className="m-0 tabular-nums">{local(control.revenueRead, mapping.currency)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-rule py-2">
                  <dt>
                    {control.revenueStated === null
                      ? 'Total de ingresos en el archivo'
                      : `Total de ingresos en el archivo (${int(control.revenueControls)} ${control.revenueControls === 1 ? 'fila' : 'filas'})`}
                  </dt>
                  <dd className="m-0 tabular-nums">
                    {control.revenueStated === null ? (
                      <span className="text-muted">No lo trae</span>
                    ) : (
                      local(control.revenueStated, mapping.currency)
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 py-2 font-semibold">
                  <dt>Diferencia</dt>
                  <dd className="m-0 tabular-nums">
                    {revenueDiff === null ? (
                      <span className="font-normal text-muted">—</span>
                    ) : (
                      local(revenueDiff, mapping.currency)
                    )}
                  </dd>
                </div>
              </dl>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
