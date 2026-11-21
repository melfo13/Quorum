import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Kpi } from '@/lib/engine/types';
import type { Excerpt } from '@/lib/server/excerpt';
import { int, local, millions, money, monthName, pct, rate } from '@/lib/format';
import { SourceExcerpt } from '@/components/ui/SourceExcerpt';
import { ButtonLink, MetricValue, Ref, cx } from '@/components/ui/primitives';
import type { LineAudit } from './audit';
import { Trail, type TrailStep } from './Trail';

function traceSteps(a: LineAudit, excerpt: Excerpt | null): TrailStep[] | null {
  const t = a.trace;
  if (!t) return null;
  const target = excerpt?.rows.find((r) => r.isTarget);
  const col = target?.marked[0];
  const raw = target && col !== undefined ? target.cells[col] : '';
  const header = excerpt && col !== undefined ? excerpt.columns[col]?.label : '';
  const base = t.file.replace(/\.[^.]+$/, '');
  const converted = t.currency !== 'GTQ';
  return [
    { label: 'Cifra del grupo', value: `${a.label} · ${money(a.consolidated)}` },
    { label: 'Empresa', value: t.companyName, detail: `${money(t.companyCents)} de esta línea` },
    {
      label: 'Registro más grande',
      value: money(t.cents, { compact: false }),
      detail: converted
        ? `${local(t.amountLocal, t.currency)} × ${rate(t.rate)}, tasa promedio de ${monthName(t.period)}`
        : `${monthName(t.period)}, ya en ${t.currency}`,
    },
    { label: 'Archivo', value: t.sheet !== base ? `${t.file} · hoja ${t.sheet}` : t.file, mono: true },
    { label: 'Fila', value: `fila ${t.row}`, mono: true, detail: `${t.localAccount} ${t.localName}`.trim() },
    {
      label: 'Celda',
      value: `${t.column}${t.row} = ${raw || '—'}`,
      mono: true,
      detail: header ? `Columna “${header}”` : undefined,
    },
  ];
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Shell({ caption, figure, children }: { caption: string; figure: string; children: ReactNode }) {
  return (
    <aside
      aria-label="Origen de la cifra"
      className="box-border flex min-w-0 flex-col gap-5 card p-5 lg:sticky lg:top-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 text-sm font-normal text-muted">{caption}</h2>
          <div className="text-[30px] font-semibold leading-tight">{typeof figure === 'string' ? <MetricValue text={figure} /> : figure}</div>
        </div>
        <ButtonLink href="/consolidated?line=none" scroll={false} size="sm" aria-label="Cerrar origen de la cifra">
          Cerrar
        </ButtonLink>
      </div>
      {children}
    </aside>
  );
}

export function LinePanel({ a, highlight, excerpt }: { a: LineAudit; highlight: string | null; excerpt: Excerpt | null }) {
  const eliminated = a.eliminations !== 0;
  const fileRateNotes = a.byCompany.filter((c) => c.fileRate);
  const sumCents = a.byCompany.reduce((s, c) => s + c.cents, 0);
  const steps = traceSteps(a, excerpt);
  return (
    <Shell caption={`${a.label}, consolidado`} figure={money(a.consolidated)}>
      {steps && (
        <Block title="Rastro hasta el origen">
          <Trail
            key={`${a.id}-${a.trace?.cellId}`}
            steps={steps}
            label={`De ${a.label} hasta la celda ${a.trace?.column}${a.trace?.row} de ${a.trace?.file}`}
            after={
              <>
                {excerpt && <SourceExcerpt excerpt={excerpt} maxColumns={2} className="mt-1" />}
                {a.held[0] && (
                  <p className="m-0 text-xs text-muted">
                    Fuera de esta línea:{' '}
                    <Link href={`/load#${encodeURIComponent(a.held[0].findingId)}`} className="font-medium text-ink hover:text-muted">
                      {a.held[0].label}
                    </Link>
                    , {int(a.held[0].count)} {a.held[0].count === 1 ? 'fila' : 'filas'}, {money(a.held[0].cents)}
                    {a.held.length > 1 ? `, y ${a.held.length - 1} más abajo.` : '.'}
                  </p>
                )}
              </>
            }
          />
        </Block>
      )}
      <Block title="Fórmula">
        <p className="m-0">
          {a.label} de las empresas en GTQ con las tasas del grupo
          {eliminated ? ', menos las eliminaciones entre empresas.' : '. Ninguna eliminación entre empresas toca esta línea.'}
        </p>
        <p className="m-0 font-medium tabular-nums">
          {money(a.companies)} {a.eliminations < 0 ? '−' : '+'} {money(Math.abs(a.eliminations))} = {money(a.consolidated)}
        </p>
      </Block>

      <Block title="Por empresa">
        {a.byCompany.length ? (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="ledger min-w-[300px] text-[13px] [&_td]:!px-1.5 [&_th]:!px-1.5">
              <thead>
                <tr>
                  <th scope="col">Empresa</th>
                  <th scope="col" className="num">
                    Moneda local
                  </th>
                  <th scope="col" className="num">
                    Tasa promedio
                  </th>
                  <th scope="col" className="num">
                    En GTQ
                  </th>
                </tr>
              </thead>
              <tbody>
                {a.byCompany.map((c) => (
                  <tr key={c.id} className={cx(highlight === c.id && 'bg-raised')}>
                    <th scope="row" className={cx(highlight === c.id ? 'font-semibold' : 'font-normal')}>
                      {c.name}
                    </th>
                    <td className="num">{local(c.local, c.currency, { compact: true })}</td>
                    <td className={cx('num', c.fileRate && 'font-semibold text-accent')}>{c.rate === null ? '—' : rate(c.rate)}</td>
                    <td className="num">{millions(c.cents)}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" colSpan={3} className="font-semibold">
                    Suma
                  </th>
                  <td className="num font-semibold">{millions(sumCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="m-0 rounded-[10px] border border-dashed border-control px-3 py-2 text-muted">
            Ninguna empresa aporta a esta línea.
          </p>
        )}
        {fileRateNotes.map((c) => (
          <p key={c.id} className="m-0 text-xs text-muted">
            {c.name} traía {rate(c.fileRate!.rate)}; se aplicó la tasa del grupo, {rate(c.fileRate!.groupRate)}.
          </p>
        ))}
      </Block>

      <Block title="Eliminaciones entre empresas">
        {a.elim.count ? (
          <>
            <p className="m-0">
              {int(a.elim.count)} {a.elim.count === 1 ? 'asiento' : 'asientos'}, {money(a.elim.total, { sign: true })}.
              {a.elim.unreconciled !== 0 && (
                <> {money(Math.abs(a.elim.unreconciled), { compact: false })} está sin conciliar y queda fuera.</>
              )}
            </p>
            <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-muted">
              {a.elim.pairs.map((p) => (
                <li key={p} className="whitespace-nowrap">
                  {p}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="m-0 text-muted">Ninguna en esta línea.</p>
        )}
      </Block>

      {a.held.length > 0 && (
        <Block title="Fuera de esta línea">
          <ul className="m-0 flex list-none flex-col p-0">
            {a.held.map((h) => (
              <li key={h.findingId} className="flex items-baseline justify-between gap-3 border-b border-rule py-2 last:border-b-0">
                <Link href={`/load#${encodeURIComponent(h.findingId)}`} className="min-w-0 font-medium hover:text-muted">
                  {h.label}
                </Link>
                <span className="whitespace-nowrap text-right tabular-nums">
                  {int(h.count)} {h.count === 1 ? 'fila' : 'filas'} · {money(h.cents)}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="Registros de origen">
        {a.origins.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {a.origins.slice(0, 3).map((o) => (
              <li key={`${o.companyId}${o.file}${o.sheet}`} className="border-b border-rule py-2 last:border-b-0">
                <Ref>
                  {o.file}
                  {o.sheet !== o.file.replace(/\.[^.]+$/, '') && ` · hoja ${o.sheet}`} · {o.from === o.to ? `fila ${o.from}` : `filas ${o.from} a ${o.to}`}
                  {o.columns.length > 1 ? ` · columnas ${o.columns[0]} a ${o.columns[o.columns.length - 1]}` : ` · columna ${o.columns[0]}`}
                </Ref>
              </li>
            ))}
            {a.origins.length > 3 && (
              <li className="pt-2 text-muted">
                Y {a.origins.length - 3} {a.origins.length - 3 === 1 ? 'archivo más' : 'archivos más'}.
              </li>
            )}
          </ul>
        ) : (
          <p className="m-0 text-muted">Sin registros.</p>
        )}
      </Block>
    </Shell>
  );
}

export function KpiPanel({ kpi }: { kpi: Kpi }) {
  const figure = kpi.name === 'EVA' ? money(kpi.value) : pct(kpi.value);
  return (
    <Shell caption={`${kpi.name}, consolidado`} figure={figure}>
      <Block title="Fórmula">
        <p className="m-0 font-medium tabular-nums">{kpi.formula}</p>
      </Block>
      <Block title="Insumos">
        <dl className="m-0 flex flex-col">
          {kpi.inputs.map((i) => (
            <div key={i.label} className="flex items-baseline justify-between gap-3 border-b border-rule py-2 last:border-b-0">
              <dt className="text-muted">{i.label}</dt>
              <dd className="m-0 text-right tabular-nums">
                {i.ref ? (
                  <Link href={`/consolidated?line=${i.ref}`} scroll={false} className="underline decoration-dotted underline-offset-[3px] hover:text-muted">
                    {i.cents !== undefined ? money(i.cents) : pct(i.ratio ?? 0)}
                  </Link>
                ) : i.cents !== undefined ? (
                  money(i.cents)
                ) : (
                  pct(i.ratio ?? 0)
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className="m-0 text-xs text-muted">
          Las cifras del balance usan la tasa de cierre de diciembre; el EBIT es el año con tasas promedio mensuales.
        </p>
      </Block>
    </Shell>
  );
}
