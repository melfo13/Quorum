/** Clean facts + adjustments → Cell[]. Every cell keeps the list of facts it was summed from. */
import { ACCOUNT, PL_LINES, lineAccounts } from './catalog';
import type { Adjustment, Cell, Contribution, Fact, Kpi } from './types';
import { money, pct } from '@/lib/format';

export function consolidate(facts: Fact[], adjustments: Adjustment[], contribution: (f: Fact) => Contribution): Cell[] {
  const cells = new Map<string, Cell>();
  const cell = (account: string, period: string) => {
    const k = `${account}|${period}`;
    if (!cells.has(k)) cells.set(k, { groupAccount: account, period, cents: 0, contributions: [], adjustmentIds: [] });
    return cells.get(k)!;
  };
  for (const f of facts) {
    if (f.status !== 'clean' || !f.groupAccount) continue;
    const c = contribution(f);
    const target = cell(f.groupAccount, f.period);
    target.contributions.push(c);
    target.cents += c.cents;
  }
  for (const a of adjustments) {
    const target = cell(a.groupAccount, a.period);
    target.adjustmentIds.push(a.id);
    target.cents += a.cents;
  }
  return [...cells.values()];
}

export type LineFigure = { id: string; companies: number; eliminations: number; consolidated: number };

/** Income statement for the year: per line, the sum of companies, the eliminations and the result. */
export function incomeStatement(cells: Cell[], adjustments: Map<string, Adjustment>, periods: (p: string) => boolean) {
  const out = new Map<string, LineFigure>();
  for (const line of PL_LINES) {
    const accounts = new Set(lineAccounts(line.id));
    let companies = 0;
    let eliminations = 0;
    for (const c of cells) {
      if (!accounts.has(c.groupAccount) || !periods(c.period)) continue;
      companies += c.contributions.reduce((a, x) => a + x.cents, 0);
      eliminations += c.adjustmentIds.reduce((a, id) => a + (adjustments.get(id)?.cents ?? 0), 0);
    }
    out.set(line.id, { id: line.id, companies, eliminations, consolidated: companies + eliminations });
  }
  return out;
}

export type BalanceFigures = {
  assets: number;
  currentLiabilities: number;
  liabilities: number;
  equity: number;
  debt: number;
  byAccount: Map<string, number>;
};

export function balanceAt(cells: Cell[], period: string): BalanceFigures {
  const byAccount = new Map<string, number>();
  for (const c of cells) if (c.period === period && ACCOUNT.get(c.groupAccount)?.statement === 'BS')
    byAccount.set(c.groupAccount, (byAccount.get(c.groupAccount) ?? 0) + c.cents);
  const sum = (pred: (code: string) => boolean) => [...byAccount].filter(([k]) => pred(k)).reduce((a, [, v]) => a + v, 0);
  const acc = (k: string) => ACCOUNT.get(k);
  return {
    assets: sum((k) => acc(k)?.kind === 'asset'),
    currentLiabilities: sum((k) => acc(k)?.kind === 'liability' && !!acc(k)?.current),
    liabilities: sum((k) => acc(k)?.kind === 'liability'),
    equity: sum((k) => acc(k)?.kind === 'equity'),
    debt: sum((k) => !!acc(k)?.debt),
    byAccount,
  };
}

export type KpiSet = { ebit: number; nopat: number; capital: number; employed: number; roic: number; roce: number; eva: number; list: Kpi[] };

/** NOPAT = EBIT × (1 − t). Invested capital = financial debt + equity. ROCE on assets − current liabilities. */
export function computeKpis(ebit: number, bs: BalanceFigures, taxRate: number, wacc: number, currency = 'GTQ'): KpiSet {
  const nopat = ebit * (1 - taxRate);
  const capital = bs.debt + bs.equity;
  const employed = bs.assets - bs.currentLiabilities;
  const roic = capital ? nopat / capital : 0;
  const roce = employed ? ebit / employed : 0;
  const eva = nopat - capital * wacc;
  const m = (c: number) => money(c, { currency });
  return {
    ebit,
    nopat,
    capital,
    employed,
    roic,
    roce,
    eva,
    list: [
      {
        name: 'EVA',
        value: eva,
        formula: `NOPAT ${m(nopat)} − (capital ${m(capital)} × WACC ${pct(wacc)})`,
        inputs: [
          { label: 'EBIT', cents: ebit, ref: 'ebit' },
          { label: 'Tasa impositiva', ratio: taxRate },
          { label: 'NOPAT', cents: nopat },
          { label: 'Deuda financiera', cents: bs.debt },
          { label: 'Patrimonio', cents: bs.equity },
          { label: 'Capital invertido', cents: capital },
          { label: 'WACC', ratio: wacc },
        ],
      },
      {
        name: 'ROIC',
        value: roic,
        formula: `NOPAT ${m(nopat)} ÷ capital invertido ${m(capital)}`,
        inputs: [
          { label: 'NOPAT', cents: nopat },
          { label: 'Capital invertido', cents: capital },
        ],
      },
      {
        name: 'ROCE',
        value: roce,
        formula: `EBIT ${m(ebit)} ÷ capital empleado ${m(employed)}`,
        inputs: [
          { label: 'EBIT', cents: ebit, ref: 'ebit' },
          { label: 'Activos totales', cents: bs.assets },
          { label: 'Pasivos corrientes', cents: bs.currentLiabilities },
          { label: 'Capital empleado', cents: employed },
        ],
      },
    ],
  };
}
