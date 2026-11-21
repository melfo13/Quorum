/**
 * The group as a network of cards: one panel per country, one card per company, and each
 * intercompany sale inside a country as an arrow from seller to buyer along the side of the column.
 *
 *   card          name, revenue to the group and its share, and ROIC against the WACC as a bar
 *                 with the WACC tick; a status stripe and a written verdict (never colour alone)
 *   arrow         the yearly amount sold, written on it; going down the column on the right, up on
 *                 the left, so a pair in both directions never overlaps; red when it does not
 *                 reconcile; one dot travels from seller to buyer (hidden with reduced motion)
 *
 * Each country is its own drawing, laid out by the content's width: side by side when there is
 * room, stacked when the agent narrows the page, so the cards never shrink into illegible text.
 * Sales between countries are listed under the drawings. Clicking a card opens that company below.
 */
import type { IcMatch } from '@/lib/engine/types';
import { cx } from '@/components/ui/primitives';
import { money, pct } from '@/lib/format';
import type { CompanyValue } from './model';

const COUNTRY: Record<string, string> = {
  GTQ: 'Guatemala',
  CRC: 'Costa Rica',
  HNL: 'Honduras',
  NIO: 'Nicaragua',
  PAB: 'Panamá',
  MXN: 'México',
  USD: 'Estados Unidos',
  DOP: 'República Dominicana',
};

const SIDE = 120; // room beside the cards for the arrows and their amounts
const CARD_W = 300;
const CARD_H = 104;
const GAP = 34;
const TOP = 46;
const W = CARD_W + 2 * SIDE;
const ROIC_MAX = 0.3; // bar scale: 0 to 30 %

type Card = CompanyValue & { x: number; y: number; row: number; order: number };
type Edge = { from: Card; to: Card; cents: number; ok: boolean };
type Country = { ccy: string; name: string; revenue: number; cards: Card[] };

function layout(companies: CompanyValue[]): Country[] {
  const byCountry = new Map<string, CompanyValue[]>();
  for (const c of companies) byCountry.set(c.currency, [...(byCountry.get(c.currency) ?? []), c]);
  // Countries by weight in the group, companies by revenue: the reader starts with what matters most.
  let order = 0;
  return [...byCountry.entries()]
    .map(([ccy, list]) => ({ ccy, list, revenue: list.reduce((s, c) => s + c.revenue, 0) }))
    .sort((a, b) => b.revenue - a.revenue)
    .map(({ ccy, list, revenue }) => ({
      ccy,
      name: COUNTRY[ccy] ?? ccy,
      revenue,
      cards: [...list]
        .sort((a, b) => b.revenue - a.revenue)
        .map((c, row) => ({ ...c, row, order: order++, x: SIDE, y: TOP + row * (CARD_H + GAP) })),
    }));
}

/** The arrow's path inside one column: it bows out beside the cards, right going down, left going up. */
function geometry(e: Edge) {
  const a = e.from;
  const b = e.to;
  const down = b.row > a.row;
  const side = down ? a.x + CARD_W : a.x;
  const bow = (down ? 1 : -1) * (26 + 22 * Math.abs(b.row - a.row));
  const y1 = a.y + CARD_H / 2 + (down ? 10 : -10);
  const y2 = b.y + CARD_H / 2 + (down ? -10 : 10);
  const end = side + (down ? 6 : -6);
  return {
    path: `M${side},${y1} C${side + bow},${y1} ${side + bow},${y2} ${end},${y2}`,
    lx: side + bow * 0.78 + (down ? 4 : -4),
    ly: (y1 + y2) / 2,
    anchor: (down ? 'start' : 'end') as 'start' | 'end',
  };
}

function Arrow({ e, id, largest }: { e: Edge; id: string; largest: number }) {
  const g = geometry(e);
  return (
    <g className="pg-fade" style={{ animationDelay: `${500 + 80 * e.from.row}ms` }}>
      <title>
        {e.from.name} vende a {e.to.name}: {money(e.cents)} en el año
        {e.ok ? '' : ' (no cuadra con lo que registra el comprador)'}
      </title>
      <path
        id={id}
        d={g.path}
        fill="none"
        stroke={e.ok ? 'var(--muted)' : 'var(--negative)'}
        strokeOpacity={0.75}
        strokeWidth={1.5 + 3 * (e.cents / largest)}
        strokeLinecap="round"
        markerEnd={`url(#${e.ok ? 'flecha' : 'flecha-mal'})`}
      />
      {/* One dot travels from the seller to the buyer: money moving inside the group. */}
      <circle className="qm-dot" r={3.5} fill="var(--accent)" aria-hidden="true">
        <animateMotion dur={`${3.2 - 1.4 * (e.cents / largest)}s`} repeatCount="indefinite">
          <mpath href={`#${id}`} />
        </animateMotion>
      </circle>
      <text
        x={g.lx}
        y={g.ly}
        textAnchor={g.anchor}
        dominantBaseline="middle"
        paintOrder="stroke"
        stroke="var(--surface)"
        strokeWidth={5}
        className="fill-[var(--text)] text-[12px] font-medium tabular-nums"
      >
        {money(e.cents)}
      </text>
    </g>
  );
}

function CompanyCard({ c, wacc, on }: { c: Card; wacc: number; on: boolean }) {
  const status = c.held ? 'var(--control)' : c.creates ? 'var(--positive)' : 'var(--negative)';
  const verdict = c.held ? 'Bloqueada' : c.creates ? 'Crea valor' : 'Destruye valor';
  const fill = Math.max(0, Math.min(1, c.roic / ROIC_MAX));
  const tick = Math.min(1, wacc / ROIC_MAX);
  const barW = CARD_W - 32;
  const delay = { animationDelay: `${120 + 90 * c.order}ms` };
  return (
    <a
      href={`/companies?empresa=${c.id}`}
      className="qm-card pg-fade"
      style={delay}
      aria-label={`${c.name}: ver detalle`}
    >
      <title>
        {c.name}: {money(c.revenue)} de ingresos al grupo ({pct(c.revenueShare)}), ROIC {pct(c.roic)} contra
        un WACC de {pct(wacc)}.
      </title>
      <rect
        className="qm-card-bg"
        x={c.x}
        y={c.y}
        width={CARD_W}
        height={CARD_H}
        rx={16}
        fill="var(--surface)"
        stroke={on ? 'var(--accent)' : 'var(--border)'}
        strokeWidth={on ? 2 : 1}
      />
      {/* Status stripe on the left edge. */}
      <rect x={c.x} y={c.y + 14} width={4} height={CARD_H - 28} rx={2} fill={status} />
      <text x={c.x + 18} y={c.y + 26} className="fill-[var(--text)] text-[14px] font-semibold">
        {c.name}
      </text>
      <text
        x={c.x + CARD_W - 14}
        y={c.y + 26}
        textAnchor="end"
        className="text-[12px] font-medium"
        fill={status}
      >
        {verdict}
      </text>
      <text x={c.x + 18} y={c.y + 47} className="fill-[var(--muted)] text-[12px] tabular-nums">
        {money(c.revenue)} · {pct(c.revenueShare, 0)} de los ingresos del grupo
      </text>
      {/* ROIC against the WACC: track, fill (grows in) and the WACC tick. */}
      <rect x={c.x + 18} y={c.y + 62} width={barW} height={6} rx={3} fill="var(--track)" />
      <rect
        className="qm-grow-x"
        style={{ animationDelay: `${300 + 90 * c.order}ms` }}
        x={c.x + 18}
        y={c.y + 62}
        width={Math.max(3, barW * fill)}
        height={6}
        rx={3}
        fill={status}
      />
      <rect x={c.x + 18 + barW * tick - 1} y={c.y + 58} width={2} height={14} rx={1} fill="var(--text)" />
      <text x={c.x + 18} y={c.y + 90} className="fill-[var(--muted)] text-[12px] tabular-nums">
        ROIC <tspan className="fill-[var(--text)] font-medium">{c.held ? 'sin cifras' : pct(c.roic)}</tspan> ·
        WACC {pct(wacc)}
      </text>
    </a>
  );
}

export function GroupGraph({
  companies,
  matches,
  wacc,
  selected,
}: {
  companies: CompanyValue[];
  matches: IcMatch[];
  wacc: number;
  selected?: string;
}) {
  const countries = layout(companies);
  const byId = new Map(countries.flatMap((k) => k.cards).map((c) => [c.id, c]));

  // Intercompany sales of the year, per seller → buyer, from the income statement pairs.
  const pairs = new Map<string, Edge>();
  for (const m of matches) {
    if (m.statement !== 'PL') continue;
    const from = byId.get(m.sellerId);
    const to = byId.get(m.buyerId);
    if (!from || !to) continue;
    const e = pairs.get(m.pairId) ?? { from, to, cents: 0, ok: true };
    e.cents += m.amountSeller;
    e.ok = e.ok && (m.status === 'matched' || m.status === 'pending');
    pairs.set(m.pairId, e);
  }
  const edges = [...pairs.values()].filter((e) => e.cents > 0);
  const largest = Math.max(1, ...edges.map((e) => e.cents));
  const across = edges.filter((e) => e.from.currency !== e.to.currency);
  const rows = Math.max(1, ...countries.map((k) => k.cards.length));
  const height = TOP + rows * (CARD_H + GAP) + 4;

  return (
    <figure className="m-0 flex flex-col gap-3">
      <style href="qm-graph" precedence="default">{`
        @media (prefers-reduced-motion: reduce) { .qm-dot { display: none; } }
        .qm-card:hover .qm-card-bg { stroke: var(--control); }
      `}</style>
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          {[
            ['flecha', 'var(--muted)'],
            ['flecha-mal', 'var(--negative)'],
          ].map(([id, color]) => (
            <marker
              key={id}
              id={id}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerUnits="userSpaceOnUse"
              markerWidth="9"
              markerHeight="9"
              orient="auto-start-reverse"
            >
              <path d="M0,1 L9,5 L0,9 z" fill={color} />
            </marker>
          ))}
        </defs>
      </svg>

      <div className={cx('grid grid-cols-1 gap-4', countries.length > 1 && '@5xl/main:grid-cols-2')}>
        {countries.map((k) => {
          const inside = edges.filter((e) => e.from.currency === k.ccy && e.to.currency === k.ccy);
          return (
            <svg
              key={k.ccy}
              viewBox={`0 0 ${W} ${height}`}
              className="mx-auto h-auto w-full max-w-[600px]"
              role="img"
              aria-label={`${k.name}: ${k.cards.length} empresas, ${money(k.revenue)} de ingresos. El detalle de cada cifra está en la tabla.`}
            >
              <text x={SIDE} y={TOP - 16} className="fill-[var(--muted)] text-[13px]">
                <tspan className="fill-[var(--text)] font-semibold">{k.name}</tspan> · {k.ccy} ·{' '}
                {money(k.revenue)} de ingresos
              </text>
              {inside.map((e) => (
                <Arrow
                  key={`${e.from.id}>${e.to.id}`}
                  e={e}
                  id={`arista-${e.from.id}-${e.to.id}`}
                  largest={largest}
                />
              ))}
              {k.cards.map((c) => (
                <CompanyCard key={c.id} c={c} wacc={wacc} on={c.id === selected} />
              ))}
            </svg>
          );
        })}
      </div>

      {across.length > 0 && (
        <p className="m-0 text-[13px]">
          <span className="text-muted">Ventas entre países: </span>
          {across.map((e, i) => (
            <span key={`${e.from.id}>${e.to.id}`} className={cx(!e.ok && 'text-negative')}>
              {i > 0 && ' · '}
              {e.from.name} → {e.to.name} {money(e.cents)}
            </span>
          ))}
        </p>
      )}

      <figcaption className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-1 rounded bg-positive" aria-hidden="true" /> Crea valor: su ROIC supera el
          WACC (la marca en la barra)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-1 rounded bg-negative" aria-hidden="true" /> Destruye valor
        </span>
        <span>
          {edges.length
            ? 'Flecha: ventas entre empresas en el año, del que vende al que compra; se eliminan al consolidar'
            : 'Sin ventas entre empresas en estos datos'}
        </span>
      </figcaption>
    </figure>
  );
}
