/**
 * From the simple sum to the consolidated figure.
 *
 *   simple sum (every row, at the rate each file brought, no eliminations)
 *   + intercompany eliminations
 *   + exchange-rate correction (file rate → group rate)
 *   + rows in quarantine and sign corrections
 *   = consolidated
 *
 * Revenue and EBIT are sums of cents and close exactly. EVA is linear in EBIT and capital, so each
 * step's EVA delta is ΔEBIT × (1 − t) − Δcapital × WACC.
 */
import { ACCOUNT, isOperating } from './catalog';
import type { Adjustment, Fact } from './types';

export type BridgeMetric = 'revenue' | 'ebit' | 'eva';
export type BridgePart = { label: string; cents: number; href: string; kind: 'company' | 'finding' | 'pair' };
export type BridgeStep = { id: 'ic' | 'fx' | 'quarantine'; label: string; cents: number; parts: BridgePart[] };
export type Bridge = { metric: BridgeMetric; simple: number; steps: BridgeStep[]; consolidated: number; closes: boolean };

export type BridgeInput = {
  facts: Fact[];
  adjustments: Adjustment[];
  /** cents at the rate the file brought (or the group's, or 1:1 when nobody has one) */
  fileCents: (f: Fact, original: boolean) => number;
  groupCents: (f: Fact, original: boolean) => number;
  companyName: (id: string) => string;
  pairLabel: (icMatchId: string) => string;
  findingLabel: (id: string) => string;
  closingPeriod: string;
  taxRate: number;
  wacc: number;
  consolidated: { revenue: number; ebit: number; eva: number };
};

type Delta = { ebit: number; revenue: number; capital: number };
const zero = (): Delta => ({ ebit: 0, revenue: 0, capital: 0 });

function deltaOf(account: string | null, period: string, cents: number, closing: string): Delta {
  const d = zero();
  const acc = account ? ACCOUNT.get(account) : undefined;
  if (!acc) return d;
  if (acc.kind === 'revenue') d.revenue = cents;
  if (isOperating(acc)) d.ebit = cents;
  if (period === closing && (acc.debt || acc.kind === 'equity')) d.capital = cents;
  return d;
}

export function buildBridges(input: BridgeInput): Record<BridgeMetric, Bridge> {
  const { facts, closingPeriod: closing } = input;
  const add = (a: Delta, b: Delta) => ({ ebit: a.ebit + b.ebit, revenue: a.revenue + b.revenue, capital: a.capital + b.capital });

  let simple = zero();
  const steps: Record<BridgeStep['id'], { total: Delta; parts: Map<string, { label: string; d: Delta; href: string; kind: BridgePart['kind'] }> }> = {
    ic: { total: zero(), parts: new Map() },
    fx: { total: zero(), parts: new Map() },
    quarantine: { total: zero(), parts: new Map() },
  };
  const part = (step: BridgeStep['id'], key: string, label: string, href: string, kind: BridgePart['kind'], d: Delta) => {
    const s = steps[step];
    s.total = add(s.total, d);
    const p = s.parts.get(key) ?? { label, d: zero(), href, kind };
    p.d = add(p.d, d);
    s.parts.set(key, p);
  };

  for (const f of facts) {
    if (!f.groupAccount) continue; // no line to put it on, in the simple sum or anywhere else
    const original = !!f.signFixed;
    const file = input.fileCents(f, original);
    const groupOrig = input.groupCents(f, original);
    simple = add(simple, deltaOf(f.groupAccount, f.period, file, closing));
    if (file !== groupOrig)
      part('fx', f.companyId, input.companyName(f.companyId), `/consolidated?company=${f.companyId}`, 'company', deltaOf(f.groupAccount, f.period, groupOrig - file, closing));
    if (f.status === 'quarantined') {
      const by = f.heldBy[0];
      part('quarantine', by, input.findingLabel(by), `/load#${encodeURIComponent(by)}`, 'finding', deltaOf(f.groupAccount, f.period, -groupOrig, closing));
    } else if (original) {
      const fixedCents = input.groupCents(f, false);
      part('quarantine', `SIGN_INVERTED:${f.id}`, input.findingLabel(`SIGN_INVERTED:${f.id}`), `/load#${encodeURIComponent(`SIGN_INVERTED:${f.id}`)}`, 'finding', deltaOf(f.groupAccount, f.period, fixedCents - groupOrig, closing));
    }
  }
  for (const a of input.adjustments) {
    const pair = a.icMatchId.split(':')[1];
    part('ic', pair, input.pairLabel(a.icMatchId), `/consolidated?line=4100`, 'pair', deltaOf(a.groupAccount, a.period, a.cents, closing));
  }

  const eva = (d: Delta) => d.ebit * (1 - input.taxRate) - d.capital * input.wacc;
  const labels: Record<BridgeStep['id'], string> = {
    ic: 'Ventas entre empresas',
    fx: 'Tasa de cambio corregida',
    quarantine: 'Filas con error o bloqueadas',
  };
  const make = (metric: BridgeMetric, pick: (d: Delta) => number): Bridge => {
    const list: BridgeStep[] = (['ic', 'fx', 'quarantine'] as const).map((id) => ({
      id,
      label: labels[id],
      cents: pick(steps[id].total),
      parts: [...steps[id].parts.values()]
        .map((p) => ({ label: p.label, cents: pick(p.d), href: p.href, kind: p.kind }))
        .filter((p) => Math.abs(p.cents) >= 1)
        .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents)),
    }));
    const s = pick(simple);
    const end = s + list.reduce((a, x) => a + x.cents, 0);
    const target = input.consolidated[metric];
    return { metric, simple: s, steps: list, consolidated: target, closes: Math.abs(end - target) < 1 };
  };
  return {
    revenue: make('revenue', (d) => d.revenue),
    ebit: make('ebit', (d) => d.ebit),
    eva: make('eva', eva),
  };
}
