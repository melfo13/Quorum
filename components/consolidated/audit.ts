/**
 * Server-side audit data for one income-statement line: by company, eliminations, rows held out
 * and records of origin. Everything returned is plain JSON.
 */
import { PL_LINES, lineAccounts } from '@/lib/engine/catalog';
import { RateTable } from '@/lib/engine/fx';
import type { PipelineResult } from '@/lib/engine/pipeline';
import { groupCentsAt } from '@/lib/engine/pipeline';
import type { Contribution, Fact } from '@/lib/engine/types';

export type CompanyRow = {
  id: string;
  name: string;
  currency: string;
  local: number;
  cents: number;
  rate: number | null; // effective: group ÷ local
  fileRate: { rate: number; groupRate: number } | null; // the company's own rate, when it differed
};

export type HeldRow = { findingId: string; label: string; count: number; cents: number };
export type OriginRow = { companyId: string; file: string; sheet: string; from: number; to: number; columns: string[] };

/** One contribution, followed from the group figure down to its source cell. */
export type TraceData = {
  companyId: string;
  companyName: string;
  companyCents: number;
  cents: number;
  amountLocal: number;
  currency: string;
  rate: number;
  period: string;
  localAccount: string;
  localName: string;
  cellId: string;
  file: string;
  sheet: string;
  row: number;
  column: string;
};

export type LineAudit = {
  id: string;
  label: string;
  companies: number;
  eliminations: number;
  consolidated: number;
  byCompany: CompanyRow[];
  elim: { count: number; total: number; unreconciled: number; pairs: string[] };
  held: HeldRow[];
  origins: OriginRow[];
  largestCellId: string | null;
  trace: TraceData | null;
};

const RULE_LABEL: Record<string, string> = {
  FX_MISSING: 'Sin tasa del grupo',
  FX_INVERTED: 'Tasa invertida',
  BS_UNBALANCED: 'Balance descuadrado',
  DUPLICATE_ROW: 'Fila duplicada',
  SIGN_INVERTED: 'Signo invertido',
  ACCOUNT_UNMAPPED: 'Cuenta sin mapeo',
};

export function lineAudit(r: PipelineResult, lineId: string, companyId: string | null = null): LineAudit {
  const line = PL_LINES.find((l) => l.id === lineId) ?? PL_LINES.find((l) => l.id === 'revenue')!;
  const fig = r.pl.find((l) => l.id === line.id)!;
  const accounts = new Set(lineAccounts(line.id));
  const factById = new Map(r.facts.map((f) => [f.id, f]));
  const name = (id: string) => r.companies.find((c) => c.id === id)?.name ?? id;

  // By company, from the contributions the cells were summed from.
  const per = new Map<string, { local: number; cents: number }>();
  let largest: { cents: number; factId: string } | null = null;
  let traced: Contribution | null = null;
  const used: Fact[] = [];
  for (const c of r.cells) {
    if (!accounts.has(c.groupAccount)) continue;
    for (const x of c.contributions) {
      const p = per.get(x.companyId) ?? { local: 0, cents: 0 };
      p.local += x.amountLocal;
      p.cents += x.cents;
      per.set(x.companyId, p);
      if (!largest || Math.abs(x.cents) > Math.abs(largest.cents)) largest = { cents: x.cents, factId: x.factId };
      if ((!companyId || x.companyId === companyId) && (!traced || Math.abs(x.cents) > Math.abs(traced.cents))) traced = x;
      const f = factById.get(x.factId);
      if (f) used.push(f);
    }
  }
  const byCompany: CompanyRow[] = r.companies
    .filter((c) => per.has(c.id))
    .map((c) => {
      const p = per.get(c.id)!;
      const fr = c.fileRate && Math.abs(c.fileRate.rate - c.fileRate.groupRate) / c.fileRate.groupRate > 0.05 ? c.fileRate : null;
      return {
        id: c.id,
        name: c.name,
        currency: c.currency,
        local: Math.round(p.local * 100) / 100,
        cents: p.cents,
        rate: p.local ? p.cents / 100 / p.local : null,
        fileRate: fr ? { rate: fr.rate, groupRate: fr.groupRate } : null,
      };
    });

  // Eliminations on the line's accounts.
  const adj = r.adjustments.filter((a) => accounts.has(a.groupAccount));
  const pairs = [
    ...new Set(
      adj.map((a) => {
        const m = r.matches.find((x) => x.id === a.icMatchId);
        return m ? `${name(m.sellerId)} → ${name(m.buyerId)}` : a.icMatchId;
      }),
    ),
  ];
  const elim = {
    count: adj.length,
    total: adj.reduce((s, a) => s + a.cents, 0),
    unreconciled: adj.filter((a) => a.type === 'IC_HOLD').reduce((s, a) => s + a.cents, 0),
    pairs,
  };

  // Rows held out of this line, grouped by the finding that holds them.
  const rates = new RateTable(r.assumptions.groupCurrency, r.assumptions.rates);
  const heldMap = new Map<string, HeldRow>();
  for (const f of r.facts) {
    if (f.status !== 'quarantined' || !f.groupAccount || !accounts.has(f.groupAccount)) continue;
    const id = f.heldBy[0];
    const finding = r.findings.find((x) => x.id === id);
    const h = heldMap.get(id) ?? {
      findingId: id,
      label: `${RULE_LABEL[finding?.ruleId ?? ''] ?? 'Detenido'} · ${name(f.companyId)}`,
      count: 0,
      cents: 0,
    };
    h.count += 1;
    h.cents += groupCentsAt(f, rates) ?? 0;
    heldMap.set(id, h);
  }
  const held = [...heldMap.values()].sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));

  // Records of origin: per company and sheet, the row range and the columns read.
  const origin = new Map<string, OriginRow>();
  for (const f of used) {
    const [file, sheet, ref] = f.sourceCellId.split('!');
    const m = ref.match(/^([A-Z]+)(\d+)$/)!;
    const k = `${f.companyId}|${file}|${sheet}`;
    const o = origin.get(k) ?? { companyId: f.companyId, file, sheet, from: Infinity, to: 0, columns: [] };
    const row = Number(m[2]);
    o.from = Math.min(o.from, row);
    o.to = Math.max(o.to, row);
    if (!o.columns.includes(m[1])) o.columns.push(m[1]);
    origin.set(k, o);
  }
  const origins = [...origin.values()].sort(
    (a, b) => Math.abs(per.get(b.companyId)?.cents ?? 0) - Math.abs(per.get(a.companyId)?.cents ?? 0),
  );

  // The trail: the largest contribution (of the selected company, when one is selected).
  let trace: TraceData | null = null;
  const tf = traced ? factById.get(traced.factId) : undefined;
  if (traced && tf) {
    const [file, sheet, ref] = tf.sourceCellId.split('!');
    const m = ref.match(/^([A-Z]+)(\d+)$/)!;
    trace = {
      companyId: tf.companyId,
      companyName: name(tf.companyId),
      companyCents: per.get(tf.companyId)?.cents ?? 0,
      cents: traced.cents,
      amountLocal: traced.amountLocal,
      currency: tf.currency,
      rate: traced.rate,
      period: tf.period,
      localAccount: tf.localAccount,
      localName: tf.localName,
      cellId: tf.sourceCellId,
      file,
      sheet,
      row: Number(m[2]),
      column: m[1],
    };
  }

  return {
    trace,
    id: line.id,
    label: line.label,
    companies: fig.companies,
    eliminations: fig.eliminations,
    consolidated: fig.consolidated,
    byCompany,
    elim,
    held,
    origins,
    largestCellId: largest ? (factById.get(largest.factId)?.sourceCellId ?? null) : null,
  };
}
