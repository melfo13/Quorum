/**
 * Builds the Mapping screen's view model from the mapping JSON, the workbook and the pipeline
 * result. Plain data only.
 */
import { ACCOUNT } from '@/lib/engine/catalog';
import type { Dataset, PipelineResult } from '@/lib/engine/pipeline';
import type { Fact, SourceMapping } from '@/lib/engine/types';
import type { CellValue, Sheet } from '@/lib/engine/workbook';
import { parsePeriod } from '@/lib/engine/map';
import { monthName } from '@/lib/format';

export type ColumnRow = {
  label: string;
  example: string;
  field: string;
  review: string | null; // reason, when the proposal needs a person
};

export type AccountRow = {
  local: string;
  localName: string;
  group: string | null;
  groupName: string | null;
  rows: number;
};

export type ControlSummary = {
  checked: number;
  matching: number;
  firstMismatch: { row: number; sheet: string; label: string; expected: string; actual: string } | null;
  revenueRead: number; // local, natural sign
  revenueStated: number | null; // local, as typed
  revenueControls: number;
};

const text = (v: CellValue | undefined) =>
  v === null || v === undefined
    ? ''
    : typeof v === 'number'
      ? String(Math.round(v * 10000) / 10000)
      : String(v);

function headerOf(sheet: Sheet, row: number) {
  return [...(sheet.rows.get(row) ?? new Map<number, CellValue>()).entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([col, v]) => ({ col, label: String(v).trim() }));
}

export function columnRows(m: SourceMapping, ds: Dataset, fiscalYear: number): ColumnRow[] {
  const sm = m.sheets[0];
  const wb = ds.workbooks.get(m.file);
  const sheet = wb?.sheets.find((s) => s.name === sm.sheet);
  if (!sheet) return [];
  const header = headerOf(sheet, sm.headerRow);
  const accountCol = header.find((h) => h.label === sm.columns.account)?.col;
  const dataRows = [...sheet.rows.entries()]
    .filter(
      ([r, cells]) => r > sm.headerRow && accountCol !== undefined && cells.get(accountCol) !== undefined,
    )
    .sort((a, b) => a[0] - b[0])
    .map(([, cells]) => cells);
  // The first value the column holds, so a sparse column (a counterparty) still shows an example.
  const example = (col: number) => text(dataRows.find((cells) => text(cells.get(col)) !== '')?.get(col));

  // Counterparty labels written in the file that the mapping does not know.
  const unknownCp = new Set<string>();
  if (sm.columns.counterparty)
    for (const s of m.sheets) {
      const sh = wb!.sheets.find((x) => x.name === s.sheet);
      const col = sh
        ? headerOf(sh, s.headerRow).find((h) => h.label === s.columns.counterparty)?.col
        : undefined;
      if (!sh || col === undefined) continue;
      for (const [r, cells] of sh.rows) {
        const v = cells.get(col);
        if (r > s.headerRow && v !== undefined && v !== null && !m.counterpartyMap[String(v).trim()])
          unknownCp.add(String(v).trim());
      }
    }

  const roles: Record<string, string> = {};
  const c = sm.columns;
  if (c.account) roles[c.account] = 'Cuenta local';
  if (c.description) roles[c.description] = 'Descripción';
  if (c.period) roles[c.period] = 'Periodo';
  if (c.amount) roles[c.amount] = 'Monto';
  if (c.counterparty) roles[c.counterparty] = 'Contraparte';
  if (c.currency) roles[c.currency] = 'Moneda';
  if (sm.rowTotalColumn) roles[sm.rowTotalColumn] = 'Total de control';
  const periodLabels = Object.keys(sm.periodColumns ?? {});

  const out: ColumnRow[] = [];
  let periodsDone = false;
  for (const h of header) {
    if (periodLabels.includes(h.label)) {
      if (periodsDone) continue;
      periodsDone = true;
      const present = periodLabels.filter((p) => header.some((x) => x.label === p));
      out.push({
        label: `${present[0]} … ${present[present.length - 1]} (${present.length})`,
        example: example(h.col),
        field: 'Monto por mes',
        review: present.length === periodLabels.length ? null : 'Faltan meses',
      });
      continue;
    }
    const field = roles[h.label] ?? 'Sin destino';
    let ex = example(h.col);
    // Show how a period is read when the file writes it in another form (an Excel date, a month name).
    if (field === 'Periodo' && ex) {
      const p = parsePeriod(Number.isNaN(Number(ex)) ? ex : Number(ex), fiscalYear);
      if (p && p !== ex) ex = `${ex} → ${monthName(p)} ${p.slice(0, 4)}`;
    }
    let review: string | null = null;
    if (field === 'Contraparte' && unknownCp.size)
      review = `Desconocida: ${[...unknownCp].slice(0, 3).join(', ')}`;
    if (field === 'Sin destino' && ex !== '' && !Number.isNaN(Number(ex.replace(',', '.'))))
      review = 'Tiene números';
    out.push({ label: h.label, example: ex, field, review });
  }
  return out;
}

export function accountRows(facts: Fact[]): AccountRow[] {
  const by = new Map<string, AccountRow & { keys: Set<string> }>();
  for (const f of facts) {
    const row = by.get(f.localAccount) ?? {
      local: f.localAccount,
      localName: f.localName,
      group: f.groupAccount,
      groupName: f.groupAccount ? (ACCOUNT.get(f.groupAccount)?.name ?? null) : null,
      rows: 0,
      keys: new Set<string>(),
    };
    row.keys.add(f.rowKey);
    row.rows = row.keys.size;
    by.set(f.localAccount, row);
  }
  // Unmapped first: they are what a person has to look at.
  return [...by.values()]
    .map((r) => ({
      local: r.local,
      localName: r.localName,
      group: r.group,
      groupName: r.groupName,
      rows: r.rows,
    }))
    .sort((a, b) => Number(!!a.group) - Number(!!b.group));
}

export function controlSummary(r: PipelineResult, companyId: string, facts: Fact[]): ControlSummary {
  const controls = r.mapResults[companyId]?.controls ?? [];
  const mismatches = r.findings.filter(
    (f) => f.ruleId === 'SUBTOTAL_MISMATCH' && f.companyIds[0] === companyId,
  );
  const byRow = new Map<string, Fact[]>();
  for (const f of facts) byRow.set(f.rowKey, [...(byRow.get(f.rowKey) ?? []), f]);
  const isRevenue = (f: Fact) => !!f.groupAccount && ACCOUNT.get(f.groupAccount)?.kind === 'revenue';

  // Controls whose covered rows are all revenue rows carry a revenue total.
  const revenueControls = controls.filter((c) => {
    const fs = c.coveredRowKeys.flatMap((k) => byRow.get(k) ?? []);
    return fs.length > 0 && fs.every(isRevenue);
  });
  const coveredKeys = new Set(revenueControls.flatMap((c) => c.coveredRowKeys));
  const revenueFacts = facts.filter(isRevenue);
  const read = (
    revenueControls.length ? revenueFacts.filter((f) => coveredKeys.has(f.rowKey)) : revenueFacts
  ).reduce((a, f) => a + f.amountLocal, 0);
  const first = mismatches[0];
  return {
    checked: controls.length,
    matching: controls.length - mismatches.length,
    firstMismatch: first
      ? {
          row: first.places[0].row,
          sheet: first.places[0].sheet,
          label: first.expected.split(':')[0],
          expected: first.expected,
          actual: first.actual,
        }
      : null,
    revenueRead: Math.round(read * 100) / 100,
    revenueStated: revenueControls.length
      ? Math.round(revenueControls.reduce((a, c) => a + c.stated, 0) * 100) / 100
      : null,
    revenueControls: revenueControls.length,
  };
}
