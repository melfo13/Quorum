/**
 * "¿Quién crea valor?": one row per company. ROIC on a track with the WACC as a 1px tick, the spread
 * in points, EVA in GTQ as a diverging bar (the screen's main data element), and the company's share
 * of group revenue. The consolidated group closes the list, its EVA bar in the one accent.
 */
import Link from 'next/link';
import { cx } from '@/components/ui/primitives';
import { money, pct } from '@/lib/format';
import type { CompanyValue, GroupValue } from './model';

const pts = (r: number) => `${r >= 0 ? '+' : '−'}${Math.abs(r * 100).toFixed(1)}`;

function RoicTrack({ roic, wacc, scale, bad }: { roic: number; wacc: number; scale: number; bad?: boolean }) {
  return (
    <div className="relative h-2 w-full rounded-full bg-[var(--track)]" aria-hidden="true">
      <div
        className="qm-grow-x absolute inset-y-0 left-0 rounded-full"
        style={{ animationDelay: '200ms', width: `${Math.min(100, (Math.max(0, roic) / scale) * 100)}%`, background: bad ? 'var(--negative)' : 'var(--positive)' }}
      />
      <div className="absolute -top-1 -bottom-1 w-px bg-ink" style={{ left: `${(wacc / scale) * 100}%` }} />
    </div>
  );
}

function EvaBar({ cents, max, tone }: { cents: number; max: number; tone: 'ink' | 'negative' | 'accent' }) {
  const w = max ? (Math.abs(cents) / max) * 50 : 0;
  // Status colours, not the brand: a bar says whether the company creates or destroys value.
  const color = tone === 'negative' ? 'var(--negative)' : 'var(--positive)';
  return (
    <div className="relative h-3 w-full" aria-hidden="true">
      <div className="absolute inset-y-[-3px] left-1/2 w-px bg-control" />
      <div
        className={cx('absolute inset-y-0 rounded-[2px]', cents >= 0 ? 'qm-grow-x' : 'qm-grow-x-end')}
        style={{ animationDelay: '350ms', left: cents >= 0 ? '50%' : `${50 - w}%`, width: `max(2px, ${w}%)`, background: color }}
      />
    </div>
  );
}

const GRID =
  'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 @4xl/main:grid-cols-[minmax(150px,1.1fr)_minmax(160px,1.6fr)_72px_minmax(200px,2.2fr)_96px_80px] @4xl/main:items-center';

function Row({ c, g, scale, max, selected }: { c: CompanyValue; g: GroupValue; scale: number; max: number; selected: boolean }) {
  return (
    <li className={cx('border-b border-rule py-3 last:border-b-0', selected && 'bg-raised')}>
      <div className={cx(GRID, 'px-5 sm:px-6')}>
        <div className="min-w-0">
          <Link
            href={`/companies?empresa=${c.id}`}
            scroll={false}
            aria-current={selected ? 'true' : undefined}
            className="font-medium no-underline hover:underline"
          >
            {c.name}
          </Link>
          <div className="text-xs text-muted">{c.currency}</div>
        </div>
        {c.held ? (
          <div className="col-span-1 text-right text-muted @4xl/main:col-span-5 @4xl/main:text-left">
            Retenida por bloqueo: sus filas siguen fuera del número, así que no se mide.{' '}
            <Link href="/load" className="font-medium text-ink underline decoration-control underline-offset-[3px]">
              Resolver en Configuración
            </Link>
          </div>
        ) : (
          <>
            <div className="order-3 col-span-2 flex items-center gap-3 @4xl/main:order-none @4xl/main:col-span-1">
              <span className="w-14 flex-none text-right tabular-nums">{pct(c.roic)}</span>
              <RoicTrack roic={c.roic} wacc={g.wacc} scale={scale} bad={!c.creates} />
            </div>
            <div className={cx('order-2 text-right tabular-nums @4xl/main:order-none', !c.creates && 'font-semibold text-negative')}>
              {pts(c.spread)} pts
            </div>
            <div className="order-4 col-span-2 flex items-center gap-3 @4xl/main:order-none @4xl/main:col-span-1">
              <EvaBar cents={c.evaGtq} max={max} tone={c.creates ? 'ink' : 'negative'} />
            </div>
            <div className={cx('order-5 text-right tabular-nums @4xl/main:order-none', c.evaGtq < 0 && 'font-semibold text-negative')}>
              {money(c.evaGtq, { sign: true })}
            </div>
            <div className="order-6 text-right tabular-nums text-muted @4xl/main:order-none">{pct(c.revenueShare, 0)}</div>
          </>
        )}
      </div>
    </li>
  );
}

export function ValueTable({ g, selected }: { g: GroupValue; selected?: string }) {
  const scale = Math.max(2 * g.wacc, ...g.measurable.map((c) => c.roic * 1.1));
  const max = Math.max(1, Math.abs(g.eva), ...g.measurable.map((c) => Math.abs(c.evaGtq)));
  return (
    <section aria-labelledby="q-quien" className="flex min-w-0 flex-col card">
      <header className="flex flex-col gap-1.5 px-5 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h2 id="q-quien" className="m-0 text-base font-semibold">
            ¿Quién crea valor?
          </h2>
          <span className="text-xs text-muted">Ordenadas por EVA · la marca en cada barra es el WACC, {pct(g.wacc)}</span>
        </div>
      </header>
      <div className={cx(GRID, 'mt-4 hidden border-b border-border px-5 pb-2 text-xs text-muted sm:px-6 @4xl/main:grid')}>
        <span>Empresa</span>
        <span>ROIC contra WACC</span>
        <span className="text-right">Diferencia</span>
        <span className="text-center">EVA (crea · destruye)</span>
        <span className="text-right">EVA en GTQ</span>
        <span className="text-right">Ingresos</span>
      </div>
      <ol className="m-0 list-none p-0">
        {g.companies.map((c) => (
          <Row key={c.id} c={c} g={g} scale={scale} max={max} selected={c.id === selected} />
        ))}
      </ol>
      <div className={cx(GRID, 'border-t border-border px-5 py-3 font-semibold sm:px-6')}>
        <div>Grupo consolidado</div>
        <div className="order-3 col-span-2 flex items-center gap-3 font-normal @4xl/main:order-none @4xl/main:col-span-1">
          <span className="w-14 flex-none text-right font-semibold tabular-nums">{pct(g.roic)}</span>
          <RoicTrack roic={g.roic} wacc={g.wacc} scale={scale} bad={g.roic < g.wacc} />
        </div>
        <div className="order-2 text-right tabular-nums @4xl/main:order-none">{pts(g.roic - g.wacc)} pts</div>
        <div className="order-4 col-span-2 @4xl/main:order-none @4xl/main:col-span-1">
          {/* The group's bar follows its sign, like each company's: green only when it creates value. */}
          <EvaBar cents={g.eva} max={max} tone={g.eva < 0 ? 'negative' : 'accent'} />
        </div>
        <div className="order-5 text-right tabular-nums @4xl/main:order-none">{money(g.eva, { sign: true })}</div>
        <div className="order-6 text-right tabular-nums text-muted @4xl/main:order-none">100 %</div>
      </div>
      <p className="m-0 px-5 pb-5 text-xs text-muted sm:px-6">
        ROIC y EVA de cada empresa salen de sus propias filas limpias, en su moneda; el EVA se convierte a GTQ con la tasa de cierre de
        diciembre del grupo. El grupo no es la suma de las empresas: elimina las ventas entre ellas y usa su capital consolidado.
      </p>
    </section>
  );
}
