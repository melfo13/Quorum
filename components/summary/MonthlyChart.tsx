'use client';

/**
 * "¿Cómo se reparte el año?": revenue or EBIT by month, stacked by country. One measure at a time on
 * one axis; colour follows the country (by currency code), never its rank, so switching the measure
 * never repaints a country. Hover a month for its parts; the highest month is labelled; a table
 * carries every value for screen readers.
 */
import { useState } from 'react';
import { cx } from '@/components/ui/primitives';
import { money, monthName } from '@/lib/format';
import type { MonthlyMetric, MonthlySeries } from './monthly';

/** Categorical slots validated for this surface (blue, magenta); status colours are never used. */
const SLOTS = ['#2a78d6', '#e87ba4', '#1baf7a', '#eda100'];
const W = 960;
const H = 280;
const PAD = { left: 70, right: 12, top: 26, bottom: 30 };

const METRICS: { id: MonthlyMetric; label: string }[] = [
  { id: 'revenue', label: 'Ingresos' },
  { id: 'ebit', label: 'EBIT' },
];

/** Round ticks: 1, 2 or 5 times a power of ten, about four of them. */
function ticks(lo: number, hi: number) {
  const span = hi - lo || 1;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= 5) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step / 2; v += step) out.push(v);
  return out;
}

export function MonthlyChart({
  series,
  names,
}: {
  series: Record<MonthlyMetric, MonthlySeries>;
  names: Record<string, string>;
}) {
  const [metric, setMetric] = useState<MonthlyMetric>('revenue');
  const [hover, setHover] = useState<number | null>(null);
  const s = series[metric];
  const all = [...new Set([...series.revenue.countries, ...series.ebit.countries])].sort();
  const color = (ccy: string) => SLOTS[all.indexOf(ccy) % SLOTS.length];

  const up = s.points.map((p) =>
    Object.values(p.parts)
      .filter((v) => v > 0)
      .reduce((a, v) => a + v, 0),
  );
  const down = s.points.map((p) =>
    Object.values(p.parts)
      .filter((v) => v < 0)
      .reduce((a, v) => a + v, 0),
  );
  const t = ticks(Math.min(0, ...down), Math.max(1, ...up));
  const lo = t[0];
  const hi = t[t.length - 1];
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const slot = plotW / 12;
  const barW = slot * 0.42; // thin marks: the gaps carry as much as the bars
  const top = s.points.reduce((best, p, i) => (p.total > s.points[best].total ? i : best), 0);
  const yearly = s.countries.map((c) => ({ c, cents: s.points.reduce((a, p) => a + (p.parts[c] ?? 0), 0) }));
  const short = (period: string) => monthName(period).slice(0, 3);
  const h = hover === null ? null : s.points[hover];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
          {yearly.map(({ c, cents }) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ background: color(c) }}
                aria-hidden="true"
              />
              <span className="font-medium">{names[c] ?? c}</span>
              <span className="text-muted tabular-nums">{money(cents)} en el año</span>
            </span>
          ))}
        </div>
        <div role="group" aria-label="Cifra del gráfico" className="flex">
          {METRICS.map((m, i) => {
            const on = m.id === metric;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => setMetric(m.id)}
                className={cx(
                  'h-8 cursor-pointer border px-3 font-medium transition-colors',
                  i === 0 ? 'rounded-l-[10px]' : '-ml-px rounded-r-[10px]',
                  on
                    ? 'relative z-10 border-brand-tint bg-brand-tint text-[var(--accent)]'
                    : 'border-control bg-surface text-ink hover:bg-raised',
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative" onMouseLeave={() => setHover(null)}>
        <svg
          key={metric /* a new measure grows in again */}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`${METRICS.find((m) => m.id === metric)!.label} por mes y país`}
        >
          {t.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke={v === 0 ? 'var(--control)' : 'var(--border)'}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 10}
                y={y(v)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-[var(--muted)] text-[11px] tabular-nums"
              >
                {money(v)}
              </text>
            </g>
          ))}
          {s.points.map((p, i) => {
            const x = PAD.left + i * slot + (slot - barW) / 2;
            let pos = 0;
            let neg = 0;
            return (
              <g key={p.period} opacity={hover === null || hover === i ? 1 : 0.45}>
                {s.countries.map((c) => {
                  const v = p.parts[c] ?? 0;
                  if (!v) return null;
                  const from = v > 0 ? pos : neg;
                  const to = from + v;
                  if (v > 0) pos = to;
                  else neg = to;
                  // A 2px surface gap between stacked segments.
                  const hgt = Math.max(1, Math.abs(y(from) - y(to)) - 2);
                  return (
                    <rect
                      key={c}
                      className={v > 0 ? 'qm-grow-up' : 'qm-grow-down'}
                      style={{ animationDelay: `${i * 45}ms` }}
                      x={x}
                      y={v > 0 ? y(to) : y(from) + 2}
                      width={barW}
                      height={hgt}
                      rx={3}
                      fill={color(c)}
                    />
                  );
                })}
                {i === top && (
                  <text
                    className="pg-fade text-[11px] font-medium tabular-nums"
                    style={{ animationDelay: '700ms' }}
                    x={x + barW / 2}
                    y={y(up[i]) - 8}
                    textAnchor="middle"
                    fill="var(--text)"
                  >
                    {money(p.total)}
                  </text>
                )}
                <text
                  x={x + barW / 2}
                  y={H - 10}
                  textAnchor="middle"
                  className="fill-[var(--muted)] text-[11px] capitalize"
                >
                  {short(p.period)}
                </text>
                {/* The whole month's column answers the hover, not just the thin bar. */}
                <rect
                  x={PAD.left + i * slot}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  tabIndex={0}
                  aria-label={`${monthName(p.period)}: ${money(p.total)}`}
                />
              </g>
            );
          })}
        </svg>
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 flex min-w-[180px] -translate-x-1/2 flex-col gap-1 rounded-[12px] border border-border bg-surface px-3 py-2 text-[12px] shadow-[var(--card-shadow)]"
            style={{ left: `${((PAD.left + hover * slot + slot / 2) / W) * 100}%` }}
          >
            <span className="font-semibold capitalize">{monthName(h.period)}</span>
            {s.countries.map((c) => (
              <span key={c} className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-[2px]"
                    style={{ background: color(c) }}
                    aria-hidden="true"
                  />
                  {names[c] ?? c}
                </span>
                <span className="tabular-nums">{money(h.parts[c] ?? 0)}</span>
              </span>
            ))}
            <span className="flex justify-between gap-4 border-t border-border pt-1 font-medium">
              Grupo <span className="tabular-nums">{money(h.total)}</span>
            </span>
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>{METRICS.find((m) => m.id === metric)!.label} por mes y país</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            {s.countries.map((c) => (
              <th key={c} scope="col">
                {names[c] ?? c}
              </th>
            ))}
            <th scope="col">Grupo</th>
          </tr>
        </thead>
        <tbody>
          {s.points.map((p) => (
            <tr key={p.period}>
              <th scope="row">{monthName(p.period)}</th>
              {s.countries.map((c) => (
                <td key={c}>{money(p.parts[c] ?? 0)}</td>
              ))}
              <td>{money(p.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
