import Link from 'next/link';
import { Controls } from '@/components/simulator/Controls';
import { MetricValue, Pill, TitleRow, cx } from '@/components/ui/primitives';
import { lineAccounts } from '@/lib/engine/catalog';
import { runPipeline, type PipelineResult } from '@/lib/engine/pipeline';
import { isBase, withScenario, type Scenario } from '@/lib/engine/scenario';
import { currencyName, money, pct } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { getDataset, getResolutions, getResult, getSource } from '@/lib/server/state';

export const dynamic = 'force-dynamic';

type Params = Promise<Record<string, string | string[] | undefined>>;

const num = (v: string | string[] | undefined, lo: number, hi: number, fallback: number) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

const EBIT_ACCOUNTS = new Set(lineAccounts('ebit'));

/** EBIT per company from clean contributions, plus the eliminations as their own row, so the parts sum to the line. */
function ebitParts(r: PipelineResult) {
  const per = new Map<string, number>();
  let elim = 0;
  const adj = new Map(r.adjustments.map((a) => [a.id, a.cents]));
  for (const c of r.cells) {
    if (!EBIT_ACCOUNTS.has(c.groupAccount)) continue;
    for (const x of c.contributions) per.set(x.companyId, (per.get(x.companyId) ?? 0) + x.cents);
    for (const id of c.adjustmentIds) elim += adj.get(id) ?? 0;
  }
  return { per, elim };
}

const PCT_SIGNED = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1)} %`;

function Delta({ base, now, kind = 'money' }: { base: number; now: number; kind?: 'money' | 'ratio' }) {
  const d = now - base;
  const zero = kind === 'money' ? Math.abs(d) < 50 : Math.abs(d) < 0.00005;
  const tone = zero ? 'text-muted' : d > 0 ? 'text-positive' : 'text-negative';
  const rel = base !== 0 ? d / Math.abs(base) : 0;
  return (
    <div className={cx('text-sm tabular-nums', tone)}>
      {zero
        ? 'Sin cambio'
        : kind === 'money'
          ? `${money(d, { sign: true })} · ${PCT_SIGNED(rel)}`
          : `${d > 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(Math.abs(d) < 0.001 ? 2 : 1)} pts`}
    </div>
  );
}

function Figure({
  label,
  now,
  base,
  kind = 'money',
  lead,
}: {
  label: string;
  now: number;
  base: number;
  kind?: 'money' | 'ratio';
  lead?: boolean;
}) {
  const show = (v: number) => (kind === 'money' ? money(v) : pct(v));
  return (
    <div className="flex min-w-0 flex-col gap-1 p-5">
      <div className="text-muted">{label}</div>
      <div className={cx('leading-tight', lead ? 'text-[38px] font-semibold' : 'text-[32px] font-medium')}>
        <MetricValue text={show(now)} />
      </div>
      <div className="text-xs text-muted tabular-nums">Base {show(base)}</div>
      <Delta base={base} now={now} kind={kind} />
    </div>
  );
}

/** Bar colours by position: the group currency in ink, the others in two greys. */
const SWATCHES = ['var(--bar-muted)', 'var(--bar-step)', 'var(--control)'];
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function SimulatorPage({ searchParams }: { searchParams: Params }) {
  if ((await getSource()).kind === 'none') return <EmptyState title="Simulador" question="¿Qué pasa con el número del grupo si cambian la tasa o el WACC?" />;

  const sp = await searchParams;
  const base = await getResult();
  const baseWacc = Math.round(base.assumptions.wacc * 1000) / 10;
  const group = base.assumptions.groupCurrency;
  // One exchange-rate control per currency the companies report in, besides the group's.
  const currencies = [...new Set(base.companies.map((c) => c.currency))].filter((c) => c !== group).sort();
  const fx = Object.fromEntries(currencies.map((c) => [c, num(sp[c.toLowerCase()], -15, 15, 0)]));
  const wacc = num(sp.wacc, 6, 16, baseWacc);
  const swatch = (ccy: string) => (ccy === group ? 'var(--text)' : SWATCHES[currencies.indexOf(ccy) % SWATCHES.length]);

  const scenario: Scenario = {
    shocks: Object.fromEntries(currencies.map((c) => [c, fx[c] / 100])),
    wacc: wacc === baseWacc ? undefined : wacc / 100,
  };
  const r = isBase(scenario)
    ? base
    : runPipeline(withScenario(getDataset(), scenario), await getResolutions());

  const name = (id: string) => base.companies.find((c) => c.id === id)?.name ?? id;
  const line = (p: PipelineResult, id: string) => p.pl.find((l) => l.id === id)!.consolidated;

  // Where the EBIT change comes from.
  const b = ebitParts(base);
  const s = ebitParts(r);
  const drivers = base.companies
    .map((c) => ({
      id: c.id,
      label: name(c.id),
      currency: c.currency,
      delta: (s.per.get(c.id) ?? 0) - (b.per.get(c.id) ?? 0),
    }))
    .concat([{ id: 'elim', label: 'Eliminaciones entre empresas', currency: '', delta: s.elim - b.elim }])
    .filter((d) => Math.abs(d.delta) >= 50)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const ebitDelta = line(r, 'ebit') - line(base, 'ebit');
  const maxAbs = Math.max(1, ...drivers.map((d) => Math.abs(d.delta)));

  // Sentence describing the scenario.
  const moves: string[] = [];
  const fxMove = (v: number, who: string) =>
    v === 0 ? null : `el ${currencyName(group)} se ${v > 0 ? 'debilita' : 'fortalece'} ${Math.abs(v)} % frente al ${who}`;
  for (const c of currencies) {
    const m = fxMove(fx[c], currencyName(c));
    if (m) moves.push(m);
  }
  if (wacc !== baseWacc) moves.push(`el WACC ${wacc > baseWacc ? 'sube' : 'baja'} a ${wacc.toFixed(1)} %`);
  const scenarioText = moves.length ? moves.join(' y ') : null;
  const top = drivers[0];
  let answer: string;
  if (!scenarioText)
    answer =
      'Mueve los supuestos para ver cómo cambia el número del grupo. Todo se recalcula con el mismo motor.';
  else if (Math.abs(ebitDelta) >= 50) {
    const share = top ? Math.abs(top.delta) / drivers.reduce((a, d) => a + Math.abs(d.delta), 0) : 0;
    answer = `Si ${scenarioText}, el EBIT del grupo ${ebitDelta > 0 ? 'sube' : 'baja'} ${money(Math.abs(ebitDelta))}${top ? `; ${top.label} explica el ${pct(share, 0)}` : ''}.`;
  } else {
    const evaDelta = r.kpis.eva - base.kpis.eva;
    const destroy = r.companies.filter((c) => (r.companyKpis[c.id]?.roic ?? 0) < r.assumptions.wacc).length;
    answer = `Si ${scenarioText}, el EBIT no cambia, el EVA ${evaDelta >= 0 ? 'sube' : 'baja'} ${money(Math.abs(evaDelta))} y ${destroy} ${destroy === 1 ? 'empresa destruye' : 'empresas destruyen'} valor.`;
  }

  // Currency exposure of the base EBIT (before eliminations).
  const byCcy = new Map<string, number>();
  for (const c of base.companies)
    byCcy.set(c.currency, (byCcy.get(c.currency) ?? 0) + (b.per.get(c.id) ?? 0));
  const exposure = [...byCcy].map(([ccy, cents]) => ({ ccy, cents })).filter((x) => x.cents > 0);
  const expTotal = exposure.reduce((a, x) => a + x.cents, 0) || 1;

  // Who creates value under the scenario WACC.
  const value = r.companies
    .map((c) => ({ id: c.id, label: c.name, roic: r.companyKpis[c.id]?.roic ?? 0, held: c.rowsClean === 0 }))
    .sort((x, y) => Number(x.held) - Number(y.held) || y.roic - x.roic);
  const w = r.assumptions.wacc;
  const destroyers = value.filter((v) => !v.held && v.roic < w);
  const heldOut = value.filter((v) => v.held);

  const open = r.openBlocks.length;
  const blocked = [...new Set(r.openBlocks.flatMap((f) => f.companyIds))].map(name);
  const sub = scenarioText
    ? `Escenario: ${scenarioText}. Base: tasas del grupo y WACC de ${baseWacc.toFixed(1)} %.`
    : `Escenario base: tasas del grupo y WACC de ${baseWacc.toFixed(1)} %.`;

  return (
    <>
      {open > 0 && (
        <p className="m-0 rounded-[10px] bg-warn-bg px-3 py-2 text-xs text-warn-ink ring-1 ring-inset ring-warn-border">
          {open} {open === 1 ? 'bloqueo está abierto' : 'bloqueos están abiertos'}: las filas de{' '}
          {blocked.join(', ')} no están en estas cifras.{' '}
          <Link href="/load" className="font-medium underline underline-offset-2">
            Resuélvelos en Configuración
          </Link>
          .
        </p>
      )}

      <TitleRow title="Simulador" sub={sub} />

      <Controls
        initial={{ fx, wacc }}
        baseWacc={baseWacc}
        currencies={currencies.map((c) => ({ code: c, name: currencyName(c) }))}
        groupName={currencyName(group)}
      />

      <section
        aria-label="Resultado del escenario"
        className="flex flex-col gap-4 card"
      >
        <div className="flex flex-col gap-1 px-5 pt-5">
          <h2 className="m-0 text-base font-semibold">¿Qué pasa con el número del grupo?</h2>
          <p className="m-0 max-w-[860px] text-xl leading-snug">{answer}</p>
        </div>
        <div className="grid grid-cols-2 border-t border-border @4xl/main:grid-cols-4 [&>*]:border-border [&>*:nth-child(even)]:border-l @4xl/main:[&>*:not(:first-child)]:border-l @max-4xl/main:[&>*:nth-child(n+3)]:border-t">
          <Figure label="Ingresos" now={line(r, 'revenue')} base={line(base, 'revenue')} />
          <Figure label="EBIT" now={line(r, 'ebit')} base={line(base, 'ebit')} />
          <Figure label="EVA" now={r.kpis.eva} base={base.kpis.eva} lead />
          <Figure label="ROIC" now={r.kpis.roic} base={base.kpis.roic} kind="ratio" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 @4xl/main:grid-cols-2">
        <section
          aria-label="De dónde sale el cambio"
          className="flex min-w-0 flex-col gap-3 card p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="m-0 text-base font-semibold">¿De dónde sale el cambio?</h2>
          </div>
          {drivers.length === 0 ? (
            <p className="m-0 rounded-[10px] border border-dashed border-control px-3 py-2.5 text-muted">
              {scenarioText
                ? 'La tasa de cambio no movió el EBIT de ninguna empresa en este escenario.'
                : 'En el escenario base no hay cambio que repartir. Mueve una tasa para verlo por empresa.'}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0" aria-label="Cambio del EBIT por empresa">
              {drivers.map((d, i) => {
                const w2 = (Math.abs(d.delta) / maxAbs) * 50;
                return (
                  <li
                    key={d.id}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-3 border-b border-rule py-2 last:border-b-0"
                  >
                    <span className="min-w-0 truncate">
                      {d.label}
                      {d.currency && <span className="text-muted"> · {d.currency}</span>}
                    </span>
                    <span className="relative h-2" aria-hidden="true">
                      <span className="absolute inset-y-[-3px] left-1/2 w-px bg-border" />
                      <span
                        className="absolute inset-y-0 rounded-[1px]"
                        style={{
                          left: d.delta >= 0 ? '50%' : `${50 - w2}%`,
                          width: `${Math.max(w2, 0.6)}%`,
                          background: i === 0 ? 'var(--accent)' : 'var(--bar-muted)',
                        }}
                      />
                    </span>
                    <span className="text-right tabular-nums">{money(d.delta, { sign: true })}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="m-0 text-xs text-muted">
            Cambio en GTQ del EBIT de cada empresa entre el escenario y la base. Las partes suman el cambio
            del grupo.
          </p>
          <div className="mt-auto flex items-baseline justify-between gap-3 border-t border-border pt-3 font-semibold">
            <span>Cambio del EBIT del grupo</span>
            <span className="tabular-nums">{money(ebitDelta, { sign: true })}</span>
          </div>
        </section>

        <section
          aria-label="Exposición cambiaria"
          className="flex min-w-0 flex-col gap-3 card p-5"
        >
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-base font-semibold">¿Cuánto del EBIT depende de cada moneda?</h2>
            <p className="m-0 text-muted">
              EBIT base de las empresas antes de eliminaciones, por moneda de origen.
            </p>
          </div>
          <div
            className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[2px]"
            role="img"
            aria-label={exposure.map((x) => `${x.ccy} ${pct(x.cents / expTotal, 0)}`).join(', ')}
          >
            {exposure.map((x) => (
              <span
                key={x.ccy}
                style={{
                  width: `${(x.cents / expTotal) * 100}%`,
                  background: swatch(x.ccy),
                }}
              />
            ))}
          </div>
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Moneda</th>
                <th scope="col" className="num">
                  EBIT base
                </th>
                <th scope="col" className="num">
                  Parte
                </th>
              </tr>
            </thead>
            <tbody>
              {exposure.map((x) => (
                <tr key={x.ccy}>
                  <th scope="row" className="font-normal">
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ background: swatch(x.ccy) }}
                    />
                    {capitalize(currencyName(x.ccy))} <span className="text-muted">{x.ccy}</span>
                  </th>
                  <td className="num">{money(x.cents)}</td>
                  <td className="num">{pct(x.cents / expTotal, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section
        aria-label="Quién crea valor"
        className="flex flex-col card"
      >
        <div className="flex flex-col gap-1 p-5">
          <h2 className="m-0 text-base font-semibold">¿Quién crea valor en este escenario?</h2>
          <p className="m-0 text-muted">
            {destroyers.length
              ? `Con un WACC de ${pct(w)}, ${destroyers.map((d) => d.label).join(', ')} ${destroyers.length === 1 ? 'destruye' : 'destruyen'} valor.`
              : `Con un WACC de ${pct(w)}, todas las empresas con datos crean valor.`}
            {heldOut.length > 0 &&
              ` ${heldOut.map((d) => d.label).join(', ')} ${heldOut.length === 1 ? 'queda' : 'quedan'} sin evaluar mientras su bloqueo siga abierto.`}
          </p>
        </div>
        <ul
          className="m-0 grid list-none grid-cols-1 border-t border-border p-0 sm:grid-cols-2 @4xl/main:grid-cols-3"
          aria-label="ROIC de cada empresa contra el WACC del escenario"
        >
          {value.map((v) => {
            const gap = v.roic - w;
            return (
              <li
                key={v.id}
                className="flex items-start justify-between gap-3 border-b border-rule px-5 py-4"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{v.label}</span>
                  {v.held ? (
                    <span className="text-muted">— · bloqueo abierto</span>
                  ) : (
                    <span className="tabular-nums">
                      ROIC {pct(v.roic)}{' '}
                      <span className={gap < 0 ? 'text-negative' : 'text-muted'}>
                        ({gap >= 0 ? '+' : '−'}
                        {Math.abs(gap * 100).toFixed(1)} pts)
                      </span>
                    </span>
                  )}
                </div>
                {v.held ? (
                  <Pill tone="neutral">Sin datos</Pill>
                ) : (
                  <Pill tone={gap >= 0 ? 'positive' : 'negative'}>
                    {gap >= 0 ? 'Crea valor' : 'Destruye valor'}
                  </Pill>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
