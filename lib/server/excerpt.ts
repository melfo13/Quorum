/**
 * The source row behind a figure, as it sits in the file: the header row, the row itself and a
 * neighbour on each side, with the cells the figure came from marked. Plain JSON, safe to pass to
 * client components.
 */
import type { Dataset } from '@/lib/engine/pipeline';
import { columnIndex, columnLetter, type CellValue } from '@/lib/engine/workbook';

export type ExcerptRow = { row: number; cells: string[]; marked: number[]; isTarget: boolean };
export type Excerpt = {
  file: string;
  sheet: string;
  headerRow: number;
  columns: { letter: string; label: string }[];
  rows: ExcerptRow[];
  /** "e3_budget.csv · row 12 · column Jan" */
  origin: string;
};

const text = (v: CellValue | undefined) =>
  v === null || v === undefined ? '' : typeof v === 'number' ? String(Math.round(v * 10000) / 10000) : String(v);

/** cellIds look like `${file}!${sheet}!${col}${row}`. Cells of one row become one excerpt. */
export function getExcerpts(ds: Dataset, cellIds: string[], opts: { context?: number; max?: number } = {}): Excerpt[] {
  const { context = 1, max = 3 } = opts;
  const byRow = new Map<string, { file: string; sheet: string; row: number; cols: number[] }>();
  for (const id of cellIds) {
    const [file, sheet, ref] = id.split('!');
    const m = ref?.match(/^([A-Z]+)(\d+)$/);
    if (!m) continue;
    const key = `${file}!${sheet}!${m[2]}`;
    const entry = byRow.get(key) ?? { file, sheet, row: Number(m[2]), cols: [] };
    entry.cols.push(columnIndex(m[1]));
    byRow.set(key, entry);
  }
  const out: Excerpt[] = [];
  for (const { file, sheet, row, cols } of [...byRow.values()].slice(0, max)) {
    const wb = ds.workbooks.get(file);
    const s = wb?.sheets.find((x) => x.name === sheet);
    if (!s) continue;
    const mapping = ds.mappings.find((m) => m.file === file);
    const headerRow =
      mapping?.sheets.find((x) => x.sheet === sheet)?.headerRow ??
      (mapping?.fileRates?.sheet === sheet ? mapping.fileRates.headerRow : undefined) ??
      (mapping?.reportedKpis?.sheet === sheet ? mapping.reportedKpis.headerRow : undefined) ??
      1;
    const header = s.rows.get(headerRow) ?? new Map();
    let width = 0;
    for (const r of [headerRow, row - context, row, row + context])
      for (const c of s.rows.get(r)?.keys() ?? []) width = Math.max(width, c + 1);
    const columns = Array.from({ length: width }, (_, c) => ({ letter: columnLetter(c), label: text(header.get(c)) }));
    const rows: ExcerptRow[] = [];
    for (let r = Math.max(headerRow + 1, row - context); r <= row + context; r++) {
      const cells = s.rows.get(r);
      if (!cells && r !== row) continue;
      rows.push({
        row: r,
        cells: columns.map((_, c) => text(cells?.get(c))),
        marked: r === row ? cols : [],
        isTarget: r === row,
      });
    }
    const label = cols.map((c) => columns[c]?.label || columnLetter(c)).join(', ');
    out.push({
      file,
      sheet,
      headerRow,
      columns,
      rows,
      origin: `${file}${wb!.sheets.length > 1 ? ` · hoja ${sheet}` : ''} · fila ${row} · columna ${label}`,
    });
  }
  return out;
}
