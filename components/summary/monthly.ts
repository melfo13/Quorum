/**
 * The year month by month, split by country, from the engine's cells. Each country's part is what its
 * companies contribute plus the eliminations of the pairs where it sells, so the parts of a month add
 * up to the consolidated figure of that month, and the twelve months to the year's.
 */
import { lineAccounts } from '@/lib/engine/catalog';
import type { PipelineResult } from '@/lib/engine/pipeline';

export type MonthlyMetric = 'revenue' | 'ebit';
export type MonthPoint = { period: string; parts: Record<string, number>; total: number };
export type MonthlySeries = { countries: string[]; points: MonthPoint[] };

export function monthly(r: PipelineResult, metric: MonthlyMetric): MonthlySeries {
  const accounts = new Set(lineAccounts(metric));
  const currencyOf = new Map(r.companies.map((c) => [c.id, c.currency]));
  const sellerCountry = new Map(r.matches.map((m) => [m.id, currencyOf.get(m.sellerId) ?? '']));
  const adjustment = new Map(
    r.adjustments.map((a) => [a.id, { cents: a.cents, country: sellerCountry.get(a.icMatchId) ?? '' }]),
  );
  const periods = Array.from({ length: 12 }, (_, i) => `${r.fiscalYear}-${String(i + 1).padStart(2, '0')}`);
  const points: MonthPoint[] = periods.map((period) => ({ period, parts: {}, total: 0 }));
  const at = new Map(points.map((p) => [p.period, p]));
  const add = (p: MonthPoint, country: string, cents: number) => {
    p.parts[country] = (p.parts[country] ?? 0) + cents;
    p.total += cents;
  };
  for (const c of r.cells) {
    const p = at.get(c.period);
    if (!p || !accounts.has(c.groupAccount)) continue;
    for (const x of c.contributions) add(p, currencyOf.get(x.companyId) ?? '', x.cents);
    for (const id of c.adjustmentIds) {
      const a = adjustment.get(id);
      if (a) add(p, a.country, a.cents);
    }
  }
  // Countries by their weight in the year, largest first: the stack reads bottom-up from the biggest.
  const yearly = new Map<string, number>();
  for (const p of points)
    for (const [k, v] of Object.entries(p.parts)) yearly.set(k, (yearly.get(k) ?? 0) + v);
  const countries = [...yearly.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([k]) => k);
  return { countries, points };
}
