/**
 * Runs the whole engine: read → map → validate → convert → eliminate → consolidate → KPIs → bridge.
 * Pure given its inputs; `loadDataset` is the only part that touches the disk.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ACCOUNT, PL_LINES, isOperating, lineAccounts } from './catalog';
import { buildBridges, type Bridge, type BridgeMetric } from './bridge';
import { balanceAt, computeKpis, consolidate, incomeStatement, type BalanceFigures, type KpiSet, type LineFigure } from './consolidate';
import { bridgeSentence, type Segment } from './explain';
import { RateTable, readAssumptions, toCents, type Assumptions } from './fx';
import { matchIntercompany } from './intercompany';
import { mapWorkbook, type MapResult } from './map';
import type { Adjustment, Cell, Contribution, Fact, Finding, IcMatch, Resolutions, SourceMapping, SourceRow } from './types';
import { NO_RESOLUTIONS } from './types';
import { groupCents as groupCentsAt, validateRows } from './validate';
import { readWorkbook, type Workbook } from './workbook';
import { money, monthName, pct } from '@/lib/format';

export type Dataset = {
  dir: string;
  isPractice: boolean;
  assumptions: Assumptions;
  mappings: SourceMapping[];
  workbooks: Map<string, Workbook>; // by file name
  missingFiles: string[];
};

// ---------------------------------------------------------------- disk

const cache = new Map<string, { stamp: string; ds: Dataset }>();

/** Dataset roots that are not a company's folder. Their files belong to another load. */
const NOT_A_COMPANY = new Set(['uploads', '_truth', 'anterior']);

/** Spreadsheets and mappings in a dataset: top-level files, plus one folder per company. */
function datasetFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || NOT_A_COMPANY.has(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      for (const child of readdirSync(p)) if (/\.(xlsx|csv|json)$/i.test(child)) out.push(path.join(p, child));
    } else if (/\.(xlsx|csv|json)$/i.test(name)) out.push(p);
  }
  return out;
}

function stampOf(dir: string, mappingsDir: string) {
  return [...datasetFiles(dir), ...datasetFiles(mappingsDir)].map((f) => `${f}:${statSync(f).mtimeMs}`).join('|');
}

/**
 * A company file lives in `<dir>/<companyId>/<file>`. A flat `<dir>/<file>` still loads, so an
 * upload that was saved under its canonical name keeps working.
 */
function companyFile(dir: string, companyId: string, file: string): string | null {
  const nested = path.join(dir, companyId, file);
  if (existsSync(nested)) return nested;
  const flat = path.join(dir, file);
  if (existsSync(flat)) return flat;
  return null;
}

export function loadDataset(dir: string, mappingsDir: string, supuestos = path.join(dir, 'supuestos.xlsx')): Dataset {
  const stamp = stampOf(dir, mappingsDir);
  const hit = cache.get(dir);
  if (hit && hit.stamp === stamp) return hit.ds;
  if (!existsSync(supuestos)) throw new Error(`Cannot find ${supuestos}`);
  const assumptions = readAssumptions(readWorkbook('supuestos.xlsx', readFileSync(supuestos)));
  const mappings = existsSync(mappingsDir)
    ? readdirSync(mappingsDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => JSON.parse(readFileSync(path.join(mappingsDir, f), 'utf8')) as SourceMapping)
    : [];
  const workbooks = new Map<string, Workbook>();
  const missingFiles: string[] = [];
  for (const m of mappings) {
    const p = companyFile(dir, m.companyId, m.file);
    if (!p) {
      missingFiles.push(m.file);
      continue;
    }
    workbooks.set(m.file, readWorkbook(m.file, readFileSync(p)));
  }
  const ds: Dataset = {
    dir,
    isPractice: existsSync(path.join(dir, '_truth')) || existsSync(path.join(dir, '..', '_truth')),
    assumptions,
    mappings,
    workbooks,
    missingFiles,
  };
  cache.set(dir, { stamp, ds });
  return ds;
}

// ---------------------------------------------------------------- run

export type CompanySummary = {
  id: string;
  name: string;
  file: string;
  currency: string;
  scale: number;
  expenseSign: 'negative' | 'positive';
  shape: string;
  sheets: string[];
  rowsRead: number;
  rowsClean: number;
  facts: number;
  mappingStatus: 'proposed' | 'approved';
  missing: boolean;
  state: { tone: 'negative' | 'positive' | 'neutral'; text: string };
  fileRate: { rate: number; groupRate: number; source: string } | null;
};

export type PipelineResult = {
  ok: true;
  isPractice: boolean;
  fiscalYear: number;
  assumptions: Assumptions;
  companies: CompanySummary[];
  facts: Fact[];
  rows: SourceRow[];
  findings: Finding[];
  matches: IcMatch[];
  adjustments: Adjustment[];
  cells: Cell[];
  pl: LineFigure[];
  plByCompany: Record<string, Record<string, number>>; // line → company → cents (clean)
  bs: BalanceFigures;
  kpis: KpiSet;
  companyKpis: Record<string, KpiSet>;
  bridges: Record<BridgeMetric, Bridge>;
  sentences: Record<BridgeMetric, Segment[]>;
  confidence: { rowsRead: number; rowsClean: number; pairs: number; pairsMatched: number; ratio: number };
  openBlocks: Finding[];
  closingPeriod: string;
  mapResults: Record<string, Pick<MapResult, 'controls' | 'unreadSheets'>>;
};

const TOLERANCE = { fxRelative: 0.05, icCents: 100_000, icRelative: 0.005, kpiRatio: 0.005, kpiEvaRelative: 0.02 };

function shapeLabel(m: SourceMapping): string {
  const wide = m.sheets.some((s) => s.shape === 'wide');
  const many = m.sheets.length > 1;
  const base = many ? 'Una hoja por área' : wide ? 'Ancho, un mes por columna' : 'Largo, una fila por cuenta y mes';
  return m.scale === 1000 ? `${base}, montos en miles` : base;
}

export function runPipeline(ds: Dataset, res: Resolutions = NO_RESOLUTIONS): PipelineResult {
  const { assumptions } = ds;
  const rates = new RateTable(assumptions.groupCurrency, assumptions.rates);
  const fy = assumptions.fiscalYear;
  const closingPeriod = `${fy}-12`;
  const name = (id: string) => ds.mappings.find((m) => m.companyId === id)?.companyName ?? id;

  // 1-3. Read, map, normalize.
  const companies = ds.mappings
    .filter((m) => ds.workbooks.has(m.file))
    .map((mapping) => ({
      mapping,
      result: mapWorkbook(mapping, ds.workbooks.get(mapping.file)!, fy, res.accountOverrides[mapping.companyId]),
    }));
  const facts = companies.flatMap((c) => c.result.facts);
  const rows = companies.flatMap((c) => c.result.rows);
  const factById = new Map(facts.map((f) => [f.id, f]));

  // 4-5. Validate. Held facts stay out of everything after this.
  const findings = validateRows(companies, rates, res, { fxRelative: TOLERANCE.fxRelative });

  // 6. Convert at the group's rates.
  const rateOf = (f: Fact) => rates.get(f.currency, f.period, f.statement === 'BS' ? 'closing' : 'avg')?.rate ?? null;
  const contribution = (f: Fact): Contribution => {
    const r = rateOf(f) ?? 0;
    return { factId: f.id, companyId: f.companyId, amountLocal: f.amountLocal, rate: r, cents: toCents(f.amountLocal, r) };
  };
  const clean = facts.filter((f) => f.status === 'clean' && f.groupAccount);

  // 7. Intercompany.
  const fullyHeld = new Set(
    companies.filter((c) => c.result.facts.length && c.result.facts.every((f) => f.status === 'quarantined')).map((c) => c.mapping.companyId),
  );
  const placeOf = (f: Fact) => {
    const [file, sheet, ref] = f.sourceCellId.split('!');
    const m = ref.match(/^([A-Z]+)(\d+)$/)!;
    return { file, sheet, row: Number(m[2]), column: m[1] };
  };
  const ic = matchIntercompany({
    facts: clean,
    centsOf: (f) => contribution(f).cents,
    activeCompanies: new Set(ds.mappings.map((m) => m.companyId).filter((id) => !fullyHeld.has(id))),
    companyName: name,
    placeOf,
    toleranceCents: TOLERANCE.icCents,
    toleranceRelative: TOLERANCE.icRelative,
  });
  findings.push(...ic.findings);

  // 8. Consolidate.
  const cells = consolidate(facts, ic.adjustments, contribution);
  const adjById = new Map(ic.adjustments.map((a) => [a.id, a]));
  const plMap = incomeStatement(cells, adjById, () => true);
  const pl = PL_LINES.map((l) => plMap.get(l.id)!);
  const plByCompany: PipelineResult['plByCompany'] = {};
  for (const line of PL_LINES) {
    const accounts = new Set(lineAccounts(line.id));
    const per: Record<string, number> = {};
    for (const c of cells) {
      if (!accounts.has(c.groupAccount)) continue;
      for (const x of c.contributions) per[x.companyId] = (per[x.companyId] ?? 0) + x.cents;
    }
    plByCompany[line.id] = per;
  }
  const bs = balanceAt(cells, closingPeriod);
  const ebit = plMap.get('ebit')!.consolidated;
  const kpis = computeKpis(ebit, bs, assumptions.taxRate, assumptions.wacc);

  // KPI_MISMATCH: recompute each company's KPIs from its own clean data, in its own currency.
  const companyKpis: Record<string, KpiSet> = {};
  for (const { mapping, result } of companies) {
    const mine = result.facts.filter((f) => f.status === 'clean' && f.groupAccount);
    const localCents = (pred: (f: Fact) => boolean) => mine.filter(pred).reduce((a, f) => a + Math.round(f.amountLocal * 100), 0);
    const e = localCents((f) => isOperating(ACCOUNT.get(f.groupAccount!)!));
    const localCells = mine
      .filter((f) => f.statement === 'BS')
      .map((f) => ({ groupAccount: f.groupAccount!, period: f.period, cents: Math.round(f.amountLocal * 100), contributions: [], adjustmentIds: [] }));
    const k = computeKpis(e, balanceAt(localCells, closingPeriod), assumptions.taxRate, assumptions.wacc, mapping.currency);
    companyKpis[mapping.companyId] = k;
    for (const r of result.reportedKpis) {
      const ours = r.name === 'ROIC' ? k.roic : r.name === 'ROCE' ? k.roce : k.eva / 100;
      const off =
        r.name === 'EVA' ? Math.abs(ours - r.value) > Math.abs(ours) * TOLERANCE.kpiEvaRelative : Math.abs(ours - r.value) > TOLERANCE.kpiRatio;
      if (!off) continue;
      const show = (v: number) => (r.name === 'EVA' ? money(v * 100, { currency: mapping.currency }) : pct(v));
      const [file, sheet, ref] = r.cellId.split('!');
      findings.push({
        id: `KPI_MISMATCH:${r.cellId}`,
        ruleId: 'KPI_MISMATCH',
        severity: 'warning',
        companyIds: [mapping.companyId],
        places: [{ file, sheet, row: r.row, column: ref.replace(/\d+/g, '') }],
        sourceCellIds: [r.cellId],
        factIds: [],
        expected: `${r.name} recalculado ${show(ours)}`,
        actual: `${r.name} escrito ${show(r.value)}`,
        groupImpact: { metric: 'none', cents: 0 },
        impactText: 'Se usa el recalculado',
        action: { kind: 'none', label: 'Ver cálculo' },
        status: 'open',
      });
    }
  }

  // 10. Bridge.
  const fileRateOf = (f: Fact) => {
    const fr = companies.find((c) => c.mapping.companyId === f.companyId)?.result.fileRates.get(f.period);
    if (fr && f.statement === 'PL' && f.currency === ds.mappings.find((m) => m.companyId === f.companyId)?.currency) return fr.rate;
    return rateOf(f) ?? 1;
  };
  const sign = (f: Fact, original: boolean) => (original && f.signFixed ? -f.amountLocal : f.amountLocal);
  const findingLabel = (id: string) => {
    const f = findings.find((x) => x.id === id);
    if (!f) return 'Otras filas';
    const co = name(f.companyIds[0]);
    const map: Record<string, string> = {
      FX_MISSING: `Una fila sin tasa en ${co}`,
      FX_INVERTED: `Filas de ${co} retenidas por su tasa`,
      BS_UNBALANCED: `El balance descuadrado de ${co}`,
      DUPLICATE_ROW: `Una fila duplicada en ${co}`,
      SIGN_INVERTED: `Un signo invertido en ${co}`,
      ACCOUNT_UNMAPPED: `Una cuenta sin mapeo en ${co}`,
      IC_OUTSIDE: `Ventas entre empresas de ${co} con contraparte fuera del grupo`,
    };
    return map[f.ruleId] ?? f.ruleId;
  };
  const evaCents = kpis.eva;
  const bridges = buildBridges({
    facts,
    adjustments: ic.adjustments,
    fileCents: (f, o) => toCents(sign(f, o), fileRateOf(f)),
    groupCents: (f, o) => toCents(sign(f, o), rateOf(f) ?? fileRateOf(f)),
    companyName: (id) => `La tasa propia de ${name(id)}`,
    pairLabel: (mid) => {
      const m = ic.matches.find((x) => x.id === mid);
      return m ? `${name(m.sellerId)} → ${name(m.buyerId)}` : mid;
    },
    findingLabel,
    closingPeriod,
    taxRate: assumptions.taxRate,
    wacc: assumptions.wacc,
    consolidated: { revenue: plMap.get('revenue')!.consolidated, ebit, eva: evaCents },
  });
  for (const [k, b] of Object.entries(bridges))
    if (!b.closes) throw new Error(`The ${k} bridge does not close: ${b.simple} + steps ≠ ${b.consolidated}`);
  const sentences = {
    revenue: bridgeSentence(bridges.revenue),
    ebit: bridgeSentence(bridges.ebit),
    eva: bridgeSentence(bridges.eva),
  };

  // Confidence: rows that went in clean, and intercompany pairs that agree.
  const dataRows = rows.filter((r) => r.factIds.length);
  const rowsClean = dataRows.filter((r) => r.factIds.every((id) => factById.get(id)?.status === 'clean')).length;
  const plPairs = new Map<string, boolean>();
  for (const m of ic.matches)
    if (m.statement === 'PL' && m.status !== 'pending')
      plPairs.set(m.pairId, (plPairs.get(m.pairId) ?? true) && m.status === 'matched');
  const pairsMatched = [...plPairs.values()].filter(Boolean).length;

  // Company summaries.
  const summaries: CompanySummary[] = ds.mappings.map((m) => {
    const c = companies.find((x) => x.mapping.companyId === m.companyId);
    const mine = findings.filter((f) => f.companyIds[0] === m.companyId || (f.ruleId.startsWith('IC_') && f.companyIds.includes(m.companyId)));
    const cRows = c ? c.result.rows.filter((r) => r.factIds.length) : [];
    const cClean = cRows.filter((r) => r.factIds.every((id) => factById.get(id)?.status === 'clean')).length;
    const openBlock = mine.find((f) => f.severity === 'block' && f.status === 'open');
    const resolvedBlock = mine.find((f) => f.severity === 'block' && f.status === 'resolved');
    const quarantined = cRows.length - cClean;
    const warnings = mine.filter((f) => f.severity === 'warning').length;
    const state: CompanySummary['state'] = !c
      ? { tone: 'negative', text: 'Falta el archivo' }
      : openBlock
        ? { tone: 'negative', text: 'Bloqueado' }
        : quarantined
          ? { tone: 'negative', text: `${quarantined} en cuarentena` }
          : resolvedBlock
            ? { tone: 'positive', text: 'Bloqueo resuelto' }
            : warnings
              ? { tone: 'neutral', text: `${warnings} ${warnings === 1 ? 'aviso' : 'avisos'}` }
              : { tone: 'positive', text: 'Limpio' };
    const fr = c?.result.fileRates.get(`${fy}-01`);
    const gr = rates.get(m.currency, `${fy}-01`, 'avg');
    return {
      id: m.companyId,
      name: m.companyName,
      file: m.file,
      currency: m.currency,
      scale: m.scale,
      expenseSign: m.expenseSign,
      shape: shapeLabel(m),
      sheets: m.sheets.map((s) => s.sheet),
      rowsRead: cRows.length,
      rowsClean: cClean,
      facts: c?.result.facts.length ?? 0,
      mappingStatus: res.approved.includes(m.companyId) ? 'approved' : m.status,
      missing: !c,
      state,
      fileRate: fr && gr ? { rate: fr.rate, groupRate: gr.rate, source: `${m.file} · hoja ${m.fileRates!.sheet}` } : null,
    };
  });

  const order = { block: 0, quarantine: 1, warning: 2 } as const;
  findings.sort((a, b) => {
    const open = (f: Finding) => (f.status === 'open' ? 0 : 1);
    return open(a) - open(b) || order[a.severity] - order[b.severity] || Math.abs(b.groupImpact?.cents ?? 0) - Math.abs(a.groupImpact?.cents ?? 0);
  });

  return {
    ok: true,
    isPractice: ds.isPractice,
    fiscalYear: fy,
    assumptions,
    companies: summaries,
    facts,
    rows,
    findings,
    matches: ic.matches,
    adjustments: ic.adjustments,
    cells,
    pl,
    plByCompany,
    bs,
    kpis,
    companyKpis,
    bridges,
    sentences,
    confidence: {
      rowsRead: dataRows.length,
      rowsClean,
      pairs: plPairs.size,
      pairsMatched,
      ratio: dataRows.length ? rowsClean / dataRows.length : 0,
    },
    openBlocks: findings.filter((f) => f.severity === 'block' && f.status === 'open'),
    closingPeriod,
    mapResults: Object.fromEntries(companies.map((c) => [c.mapping.companyId, { controls: c.result.controls, unreadSheets: c.result.unreadSheets }])),
  };
}

export const describeMonth = monthName;
export { groupCentsAt };
