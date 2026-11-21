/**
 * The group's single rate table and the group assumptions (WACC, tax rate), read from
 * supuestos.xlsx. Results convert at the monthly average, balances at the monthly closing.
 */
import { GROUP_CURRENCY } from './catalog';
import { parseAmount, parsePeriod } from './map';
import type { FxRate } from './types';
import type { Workbook } from './workbook';

export type Assumptions = {
  groupCurrency: string;
  fiscalYear: number;
  wacc: number;
  taxRate: number;
  rates: FxRate[];
  source: string;
};

export function readAssumptions(wb: Workbook, file = 'supuestos.xlsx'): Assumptions {
  const find = (re: RegExp) => wb.sheets.find((s) => re.test(s.name));
  const params = find(/param/i);
  const value = (label: RegExp) => {
    for (const [, cells] of params?.rows ?? []) {
      const k = String(cells.get(0) ?? '');
      if (label.test(k)) return cells.get(1) ?? null;
    }
    return null;
  };
  const fiscalYear = Number(value(/ejercicio|year/i) ?? new Date().getFullYear());
  const wacc = Number(value(/wacc/i));
  const taxRate = Number(value(/impositiva|tax/i));
  if (!Number.isFinite(wacc) || !Number.isFinite(taxRate)) throw new Error(`${file}: WACC or tax rate missing`);

  const rates: FxRate[] = [];
  const t = find(/tasa|rate/i);
  if (t) {
    const header = t.rows.get(1);
    const col = (re: RegExp) => [...(header ?? [])].find(([, v]) => re.test(String(v)))?.[0];
    const cC = col(/moneda|currency/i);
    const cM = col(/mes|period|month/i);
    const cT = col(/tipo|type/i);
    const cR = col(/gtq|rate|tasa/i);
    for (const [r, cells] of t.rows) {
      if (r === 1 || cC === undefined || cM === undefined || cT === undefined || cR === undefined) continue;
      const period = parsePeriod(cells.get(cM) ?? null, fiscalYear);
      const rate = parseAmount(cells.get(cR) ?? null, '.');
      if (!period || rate === null) continue;
      rates.push({
        currency: String(cells.get(cC)).trim().toUpperCase(),
        period,
        rateType: /cierre|clos/i.test(String(cells.get(cT))) ? 'closing' : 'avg',
        rate,
        source: `${file} · hoja ${t.name} · fila ${r}`,
      });
    }
  }
  return { groupCurrency: String(value(/moneda/i) ?? GROUP_CURRENCY), fiscalYear, wacc, taxRate, rates, source: file };
}

export class RateTable {
  private byKey = new Map<string, FxRate>();
  constructor(
    readonly groupCurrency: string,
    rates: FxRate[],
  ) {
    for (const r of rates) this.byKey.set(`${r.currency}|${r.period}|${r.rateType}`, r);
  }
  has(currency: string): boolean {
    if (currency === this.groupCurrency) return true;
    for (const k of this.byKey.keys()) if (k.startsWith(`${currency}|`)) return true;
    return false;
  }
  get(currency: string, period: string, type: 'avg' | 'closing'): FxRate | null {
    if (currency === this.groupCurrency)
      return { currency, period, rateType: type, rate: 1, source: 'moneda del grupo' };
    return this.byKey.get(`${currency}|${period}|${type}`) ?? null;
  }
}

/** Local amount → group cents. Rounded once, per fact. */
export const toCents = (amountLocal: number, rate: number) => Math.round(amountLocal * rate * 100);
