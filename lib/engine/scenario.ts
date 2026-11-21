/**
 * What-if scenarios. A scenario changes only the group's assumptions (rates, WACC, tax rate) and
 * runs the same deterministic pipeline again; nothing is estimated.
 */
import type { Dataset } from './pipeline';

export type Scenario = {
  /** currency → relative change of the rate (GTQ per unit). USD: 0.05 = the quetzal weakens 5 % against the dollar. */
  shocks: Record<string, number>;
  wacc?: number;
  taxRate?: number;
};

export const isBase = (s: Scenario) =>
  Object.values(s.shocks).every((v) => v === 0) && s.wacc === undefined && s.taxRate === undefined;

/** A shallow copy of the dataset with shocked rates and overridden assumptions. The cached dataset is never mutated. */
export function withScenario(ds: Dataset, s: Scenario): Dataset {
  const a = ds.assumptions;
  return {
    ...ds,
    assumptions: {
      ...a,
      wacc: s.wacc ?? a.wacc,
      taxRate: s.taxRate ?? a.taxRate,
      rates: a.rates.map((r) => {
        const shock = s.shocks[r.currency] ?? 0;
        return shock ? { ...r, rate: r.rate * (1 + shock) } : r;
      }),
    },
  };
}
