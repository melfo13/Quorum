/**
 * SourceCell[] + SourceMapping → Fact[]. Nothing is dropped: rows that cannot become facts
 * (subtotals, blank account codes) are kept as control rows for the validator.
 */
import { ACCOUNT, isExpense } from './catalog';
import type { Fact, SheetMapping, SourceCell, SourceMapping, SourceRow } from './types';
import { columnLetter, type CellValue, type Sheet, type Workbook } from './workbook';

const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, jan: 1, january: 1,
  feb: 2, febrero: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6, june: 6,
  jul: 7, julio: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septiembre: 9, setiembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, november: 11,
  dic: 12, diciembre: 12, dec: 12, december: 12,
};

/** Accepts 2027-03, 2027/03, an Excel serial date, a month name or a month number. */
export function parsePeriod(v: CellValue, fiscalYear: number): string | null {
  if (v === null || v === undefined) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (typeof v === 'number') {
    if (v >= 1 && v <= 12 && Number.isInteger(v)) return `${fiscalYear}-${pad(v)}`;
    if (v > 20000 && v < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    }
    return null;
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}`;
  const m = MONTHS[s.toLowerCase().replace(/\.$/, '')];
  if (m) return `${fiscalYear}-${pad(m)}`;
  if (/^\d{1,2}$/.test(s)) return `${fiscalYear}-${pad(Number(s))}`;
  return null;
}

export function parseAmount(v: CellValue, decimal: '.' | ','): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return null;
  let s = String(v).trim().replace(/\s/g, '');
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '');
  if (decimal === ',') s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export const cellId = (file: string, sheet: string, col: number, row: number) =>
  `${file}!${sheet}!${columnLetter(col)}${row}`;

export function toSourceCells(file: string, wb: Workbook): SourceCell[] {
  const out: SourceCell[] = [];
  for (const s of wb.sheets)
    for (const [row, cells] of s.rows)
      for (const [col, raw] of cells)
        out.push({ id: cellId(file, s.name, col, row), file, sheet: s.name, row, column: columnLetter(col), raw });
  return out;
}

function headerIndex(sheet: Sheet, headerRow: number): Map<string, number> {
  const h = new Map<string, number>();
  for (const [col, v] of sheet.rows.get(headerRow) ?? []) h.set(String(v).trim(), col);
  return h;
}

export type ControlRow = {
  kind: 'subtotal' | 'row-total';
  companyId: string;
  file: string;
  sheet: string;
  row: number;
  column: string;
  label: string;
  stated: number; // as typed, scaled, file sign convention
  coveredRowKeys: string[];
  period?: string;
};

export type MapResult = {
  facts: Fact[];
  rows: SourceRow[];
  controls: ControlRow[];
  /** period → rate the company brought, GTQ per unit */
  fileRates: Map<string, { rate: number; cellId: string; row: number }>;
  reportedKpis: { name: string; value: number; cellId: string; row: number; sheet: string }[];
  unreadSheets: string[];
};

export function mapWorkbook(
  mapping: SourceMapping,
  wb: Workbook,
  fiscalYear: number,
  accountOverrides: Record<string, string> = {},
): MapResult {
  const decimal = mapping.decimalSeparator ?? '.';
  const facts: Fact[] = [];
  const rows: SourceRow[] = [];
  const controls: ControlRow[] = [];
  const unreadSheets: string[] = [];
  const accountMap = { ...mapping.accountMap, ...accountOverrides };

  const emit = (
    sm: SheetMapping,
    row: number,
    col: number,
    local: string,
    localName: string,
    period: string,
    raw: CellValue,
    counterpartyRaw: CellValue,
    currency: string,
  ): Fact | null => {
    const n = parseAmount(raw, decimal);
    if (n === null) return null;
    const group = accountMap[local] ?? null;
    const acc = group ? ACCOUNT.get(group) : undefined;
    const scaled = n * mapping.scale;
    const flip = acc && isExpense(acc) && mapping.expenseSign === 'positive';
    const cp = counterpartyRaw === null || counterpartyRaw === undefined ? null : String(counterpartyRaw).trim();
    const id = cellId(mapping.file, sm.sheet, col, row);
    return {
      id: `${mapping.companyId}:${id}`,
      sourceCellId: id,
      rowKey: `${mapping.file}!${sm.sheet}!${row}`,
      companyId: mapping.companyId,
      period,
      statement: acc ? acc.statement : null,
      localAccount: local,
      localName,
      groupAccount: acc ? group : null,
      counterpartyId: cp ? (mapping.counterpartyMap[cp] ?? null) : null,
      ...(cp ? { counterpartyRaw: cp } : {}),
      currency,
      amountLocal: Math.round((flip ? -scaled : scaled) * 100) / 100,
      amountAsTyped: Math.round(scaled * 100) / 100,
      status: 'clean',
      heldBy: [],
    };
  };

  for (const sm of mapping.sheets) {
    const sheet = wb.sheets.find((s) => s.name === sm.sheet);
    if (!sheet) {
      unreadSheets.push(sm.sheet);
      continue;
    }
    const h = headerIndex(sheet, sm.headerRow);
    const col = (label?: string) => (label ? h.get(label) : undefined);
    const cAcc = col(sm.columns.account);
    const cDesc = col(sm.columns.description);
    const cCp = col(sm.columns.counterparty);
    const cCur = col(sm.columns.currency);
    const cAmt = col(sm.columns.amount);
    const cPer = col(sm.columns.period);
    const subtotal = sm.subtotalPattern ? new RegExp(sm.subtotalPattern, 'i') : null;
    const periodCols = Object.entries(sm.periodColumns ?? {})
      .map(([label, period]) => ({ col: h.get(label), period }))
      .filter((x): x is { col: number; period: string } => x.col !== undefined);
    const cTotal = col(sm.rowTotalColumn);
    let sinceSubtotal: string[] = [];

    const sorted = [...sheet.rows.entries()].filter(([r]) => r > sm.headerRow).sort((a, b) => a[0] - b[0]);
    for (const [r, cells] of sorted) {
      const get = (c?: number) => (c === undefined ? null : (cells.get(c) ?? null));
      const accountRaw = get(cAcc);
      const desc = String(get(cDesc) ?? '').trim();
      const key = `${mapping.file}!${sm.sheet}!${r}`;

      if (accountRaw === null) {
        if (subtotal && subtotal.test(desc) && cAmt !== undefined) {
          const stated = parseAmount(get(cAmt), decimal);
          if (stated !== null)
            controls.push({
              kind: 'subtotal',
              companyId: mapping.companyId,
              file: mapping.file,
              sheet: sm.sheet,
              row: r,
              column: columnLetter(cAmt),
              label: desc,
              stated: stated * mapping.scale,
              coveredRowKeys: sinceSubtotal,
              period: parsePeriod(get(cPer), fiscalYear) ?? undefined,
            });
          sinceSubtotal = [];
        }
        continue;
      }
      const local = String(accountRaw).trim();
      const currency = cCur !== undefined && get(cCur) ? String(get(cCur)).trim() : mapping.currency;
      const made: Fact[] = [];
      if (sm.shape === 'long') {
        const period = parsePeriod(get(cPer), fiscalYear);
        if (period && cAmt !== undefined) {
          const f = emit(sm, r, cAmt, local, desc, period, get(cAmt), get(cCp), currency);
          if (f) made.push(f);
        }
      } else {
        for (const pc of periodCols) {
          const f = emit(sm, r, pc.col, local, desc, pc.period, get(pc.col), get(cCp), currency);
          if (f) made.push(f);
        }
        if (cTotal !== undefined) {
          const stated = parseAmount(get(cTotal), decimal);
          if (stated !== null)
            controls.push({
              kind: 'row-total',
              companyId: mapping.companyId,
              file: mapping.file,
              sheet: sm.sheet,
              row: r,
              column: columnLetter(cTotal),
              label: `${local} ${desc}`.trim(),
              stated: stated * mapping.scale,
              coveredRowKeys: [key],
            });
        }
      }
      facts.push(...made);
      const signature = [...cells.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => String(v))
        .join('|');
      rows.push({
        key,
        companyId: mapping.companyId,
        file: mapping.file,
        sheet: sm.sheet,
        row: r,
        signature: `${sm.sheet}|${signature}`,
        factIds: made.map((f) => f.id),
      });
      sinceSubtotal.push(key);
    }
  }

  const fileRates = new Map<string, { rate: number; cellId: string; row: number }>();
  if (mapping.fileRates) {
    const fr = mapping.fileRates;
    const sheet = wb.sheets.find((s) => s.name === fr.sheet);
    if (sheet) {
      const h = headerIndex(sheet, fr.headerRow);
      const cP = h.get(fr.period);
      const cR = h.get(fr.rate);
      for (const [r, cells] of sheet.rows) {
        if (r <= fr.headerRow || cP === undefined || cR === undefined) continue;
        const period = parsePeriod(cells.get(cP) ?? null, fiscalYear);
        const rate = parseAmount(cells.get(cR) ?? null, '.');
        if (period && rate !== null) fileRates.set(period, { rate, cellId: cellId(mapping.file, fr.sheet, cR, r), row: r });
      }
    } else unreadSheets.push(fr.sheet);
  }

  const reportedKpis: MapResult['reportedKpis'] = [];
  if (mapping.reportedKpis) {
    const rk = mapping.reportedKpis;
    const sheet = wb.sheets.find((s) => s.name === rk.sheet);
    if (sheet) {
      const h = headerIndex(sheet, rk.headerRow);
      const cL = h.get(rk.label);
      const cV = h.get(rk.value);
      for (const [r, cells] of sheet.rows) {
        if (r <= rk.headerRow || cL === undefined || cV === undefined) continue;
        const name = rk.names[String(cells.get(cL) ?? '').trim()];
        const value = parseAmount(cells.get(cV) ?? null, '.');
        if (name && value !== null)
          reportedKpis.push({ name, value, cellId: cellId(mapping.file, rk.sheet, cV, r), row: r, sheet: rk.sheet });
      }
    } else unreadSheets.push(rk.sheet);
  }

  return { facts, rows, controls, fileRates, reportedKpis, unreadSheets };
}
