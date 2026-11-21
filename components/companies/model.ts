/**
 * Value by company, computed from one engine run. Every figure comes from the run: ROIC and EVA from
 * each company's own clean data in its own currency, EVA converted to GTQ at the group's December
 * closing rate, revenue and EBIT from the company's contributions to the group number.
 */
import { ACCOUNT, isOperating } from '@/lib/engine/catalog';
import type { PipelineResult } from '@/lib/engine/pipeline';
import type { Finding } from '@/lib/engine/types';
import { money, monthName } from '@/lib/format';

export type CompanyValue = {
  id: string;
  name: string;
  currency: string;
  file: string;
  held: boolean; // every row kept out by an open block
  roic: number;
  roce: number;
  spread: number; // ROIC − WACC
  evaLocal: number; // cents, local currency
  evaGtq: number; // cents, GTQ
  closingRate: number;
  revenue: number; // cents, GTQ, contribution to group revenue
  ebit: number; // cents, GTQ, contribution to group EBIT (before eliminations)
  revenueShare: number;
  rowsRead: number;
  rowsClean: number;
  openFindings: Finding[];
  resolvedFindings: Finding[];
  delivery: { tone: 'positive' | 'neutral' | 'negative'; text: string };
  creates: boolean;
};

export type GroupValue = {
  wacc: number;
  roic: number;
  eva: number;
  companies: CompanyValue[]; // sorted by EVA in GTQ, held companies last
  measurable: CompanyValue[];
  destroyers: CompanyValue[];
  weakest: CompanyValue | null;
};

export function valueByCompany(r: PipelineResult): GroupValue {
  const wacc = r.assumptions.wacc;
  const closingPeriod = r.closingPeriod;
  const closing = (ccy: string) =>
    ccy === r.assumptions.groupCurrency
      ? 1
      : (r.assumptions.rates.find((x) => x.currency === ccy && x.period === closingPeriod && x.rateType === 'closing')?.rate ?? 0);

  const revenue = new Map<string, number>();
  const ebit = new Map<string, number>();
  for (const c of r.cells) {
    const acc = ACCOUNT.get(c.groupAccount);
    if (!acc) continue;
    for (const x of c.contributions) {
      if (acc.kind === 'revenue') revenue.set(x.companyId, (revenue.get(x.companyId) ?? 0) + x.cents);
      if (isOperating(acc)) ebit.set(x.companyId, (ebit.get(x.companyId) ?? 0) + x.cents);
    }
  }
  const totalRevenue = [...revenue.values()].reduce((a, b) => a + b, 0);

  const held = new Set<string>();
  for (const s of r.companies) {
    const mine = r.facts.filter((f) => f.companyId === s.id);
    if (mine.length && mine.every((f) => f.status === 'quarantined')) held.add(s.id);
  }

  const companies: CompanyValue[] = r.companies.map((s) => {
    const k = r.companyKpis[s.id];
    const rate = closing(s.currency);
    const mine = r.findings.filter((f) => f.companyIds.includes(s.id));
    const open = mine.filter((f) => f.status === 'open');
    const blocked = open.some((f) => f.severity === 'block');
    const delivery: CompanyValue['delivery'] = blocked
      ? { tone: 'negative', text: 'Bloqueada' }
      : open.length
        ? { tone: 'neutral', text: 'Con observaciones' }
        : { tone: 'positive', text: 'Entrega limpia' };
    const roic = k?.roic ?? 0;
    return {
      id: s.id,
      name: s.name,
      currency: s.currency,
      file: s.file,
      held: held.has(s.id) || !k,
      roic,
      roce: k?.roce ?? 0,
      spread: roic - wacc,
      evaLocal: k?.eva ?? 0,
      evaGtq: Math.round((k?.eva ?? 0) * rate),
      closingRate: rate,
      revenue: revenue.get(s.id) ?? 0,
      ebit: ebit.get(s.id) ?? 0,
      revenueShare: totalRevenue ? (revenue.get(s.id) ?? 0) / totalRevenue : 0,
      rowsRead: s.rowsRead,
      rowsClean: s.rowsClean,
      openFindings: open,
      resolvedFindings: mine.filter((f) => f.status === 'resolved'),
      delivery,
      creates: roic >= wacc,
    };
  });

  companies.sort((a, b) => Number(a.held) - Number(b.held) || b.evaGtq - a.evaGtq);
  const measurable = companies.filter((c) => !c.held);
  const destroyers = measurable.filter((c) => !c.creates);
  const weakest = measurable.length ? [...measurable].sort((a, b) => a.evaGtq - b.evaGtq)[0] : null;
  return { wacc, roic: r.kpis.roic, eva: r.kpis.eva, companies, measurable, destroyers, weakest };
}

/** A finding as a task for the company's manager: what to do, and where. */
export function taskOf(f: Finding, c: CompanyValue, name: (id: string) => string): { title: string; detail: string } {
  const mine = f.places.find((p) => p.file === c.file);
  const where = mine ? `la fila ${mine.row} de ${mine.file}${mine.sheet && !mine.file.endsWith('.csv') ? ` (hoja ${mine.sheet})` : ''}` : null;
  const other = f.companyIds.find((id) => id !== c.id);
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  switch (f.ruleId) {
    case 'FX_INVERTED':
      return { title: `Corrige la tasa de ${where ?? c.file}`, detail: `Trae ${f.actual}; la del grupo es ${f.expected}.` };
    case 'FX_MISSING':
      return { title: `Convierte o justifica ${where ?? 'una fila'}`, detail: `${f.actual}. ${f.impactText}.` };
    case 'BS_UNBALANCED':
      return { title: `Cuadra el balance de ${c.file}`, detail: `${f.actual}. ${f.impactText}.` };
    case 'DUPLICATE_ROW':
      return { title: `Elimina ${where ?? 'la fila duplicada'}`, detail: `${f.actual}. ${f.impactText}.` };
    case 'SIGN_INVERTED':
      return { title: `Corrige el signo de ${where ?? 'un gasto'}`, detail: `${f.actual}. ${f.impactText}.` };
    case 'ACCOUNT_UNMAPPED':
      return { title: `Asigna una cuenta del grupo en ${where ?? c.file}`, detail: `${f.actual}. ${f.impactText}.` };
    case 'SUBTOTAL_MISMATCH':
      return { title: `Corrige el subtotal de ${where ?? c.file}`, detail: `${f.actual}; ${lower(f.expected)}.` };
    case 'IC_OUTSIDE':
      return { title: `Indica a qué empresa del grupo corresponden las operaciones entre empresas de ${c.file}`, detail: `${f.actual}. ${f.impactText}.` };
    case 'KPI_MISMATCH':
      return { title: `Actualiza el indicador de ${where ?? c.file}`, detail: `${f.actual}; ${lower(f.expected)}.` };
    case 'IC_ASYMMETRIC':
    case 'IC_MISSING': {
      const period = f.id.match(/(\d{4}-\d{2})$/)?.[1];
      const month = period ? ` de ${monthName(period)}` : '';
      return {
        title: `Concilia con ${other ? name(other) : 'la otra empresa'} la operación${month}`,
        detail: `${f.actual}. ${f.impactText}.`,
      };
    }
    default:
      return { title: f.ruleId, detail: f.actual };
  }
}

export type Task = {
  key: string;
  title: string;
  detail: string;
  severity: Finding['severity'];
  href: string;
  /** How many findings this task covers (a sign error in twelve months is one task). */
  count: number;
};

const ORDER: Finding['severity'][] = ['block', 'quarantine', 'warning'];

/**
 * The company's open findings as tasks for its manager, most urgent first. A sign error repeated in
 * the months of one account is one task: one thing to fix in the file, not twelve.
 */
export function tasksOf(c: CompanyValue, name: (id: string) => string = (id) => id): Task[] {
  const sorted = [...c.openFindings].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  const out: Task[] = [];
  const signs = new Map<string, { task: Task; account: string; cents: number; words: string }>();
  for (const f of sorted) {
    const task: Task = { key: f.id, ...taskOf(f, c, name), severity: f.severity, href: `/load#${encodeURIComponent(f.id)}`, count: 1 };
    if (f.ruleId !== 'SIGN_INVERTED') {
      out.push(task);
      continue;
    }
    // f.actual reads "<account>, <month>: <amount>".
    const account = f.actual.split(',')[0];
    const cents = Math.abs(f.groupImpact?.cents ?? 0);
    const seen = signs.get(account);
    if (seen) {
      seen.task.count++;
      seen.cents += cents;
      continue;
    }
    signs.set(account, { task, account, cents, words: f.impactText.split(' en ')[0] });
    out.push(task);
  }
  for (const g of signs.values()) {
    const n = g.task.count;
    if (n < 2) continue;
    g.task.title = `Corrige el signo de ${g.account} en ${n} filas de ${c.file}`;
    g.task.detail = `Tiene el signo al revés en ${n === 12 ? 'los 12 meses' : `${n} meses`}. ${g.words} en ${money(g.cents)}.`;
  }
  return out;
}
