/**
 * Happy path for a demo: the team's budgets with the errors the engine finds taken out, so they load
 * with a clean group number.
 *
 *   pnpm happy-path [out]     writes <out>/<company name> - presupuesto <year>.xlsx and supuestos.xlsx
 *                             (default ~/Desktop/happy-path)
 *
 * The files are named after the company ("Agroexport Pacífico - presupuesto 2027.xlsx"), the way a
 * person would send them; the upload recognises a company by its name as well as by its code.
 *
 * It does not guess. It runs the engine on data/ and fixes exactly what the engine reports:
 *
 *   DUPLICATE_ROW   the repeated row is dropped
 *   FX_MISSING      the row in a currency with no group rate is dropped
 *   SIGN_INVERTED   the amount changes sign
 *   IC_OUTSIDE      intercompany rows whose counterparty is not a group company. The label that
 *                   appears on both sales and purchases ("Empresa 4" in today's files) is the one the
 *                   files mean as intercompany: it becomes real pairs inside each currency, in a ring
 *                   (CR_01 sells to CR_02, CR_02 to CR_03, CR_03 to CR_01; the same for GTQ). The
 *                   seller's amount is kept and the buyer's purchase takes the same amount and month,
 *                   so the pair eliminates. Every other label ("Empresa 3") is read as a related party
 *                   outside the group: it moves to the company's third-party account and loses the
 *                   counterparty.
 *
 * Any other finding stops the script: it would need a decision a script should not make. At the end
 * it loads the output with the engine and fails unless nothing is left to fix.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadDataset, runPipeline } from '../lib/engine/pipeline';
import { ACCOUNT, ACCOUNTS } from '../lib/engine/catalog';
import { columnIndex, readWorkbook, writeXlsx, type CellValue } from '../lib/engine/workbook';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const MAPPINGS = path.join(ROOT, 'mappings');
const OUT = path.resolve(process.argv[2] ?? path.join(os.homedir(), 'Desktop', 'happy-path'));

type Edits = {
  drop: Set<number>;
  flip: Map<number, number[]>;
  reclass: Set<number>;
  /** row → the counterparty to write and, for a purchase, the amount that mirrors its sale. */
  pair: Map<number, { counterparty: string; amount?: number }>;
};
const edits = new Map<string, Edits>(); // by file name
const editsOf = (file: string) => {
  if (!edits.has(file)) edits.set(file, { drop: new Set(), flip: new Map(), reclass: new Set(), pair: new Map() });
  return edits.get(file)!;
};

const ds = loadDataset(DATA, MAPPINGS);
if (ds.missingFiles.length) throw new Error(`Faltan archivos en data/: ${ds.missingFiles.join(', ')}`);
const before = runPipeline(ds);

const unknown = before.findings.filter((f) => !['DUPLICATE_ROW', 'FX_MISSING', 'SIGN_INVERTED', 'IC_OUTSIDE'].includes(f.ruleId));
if (unknown.length)
  throw new Error(`Hallazgos que este script no corrige: ${[...new Set(unknown.map((f) => f.ruleId))].join(', ')}`);

for (const f of before.findings) {
  if (f.ruleId === 'DUPLICATE_ROW') {
    // The id names the repeated row: DUPLICATE_ROW:<file>!<sheet>!<row>
    const [file, , row] = f.id.slice('DUPLICATE_ROW:'.length).split('!');
    editsOf(file).drop.add(Number(row));
  } else if (f.ruleId === 'FX_MISSING') {
    for (const p of f.places) editsOf(p.file).drop.add(p.row);
  } else if (f.ruleId === 'IC_OUTSIDE') {
    continue; // paired below, from the rows themselves
  } else {
    for (const p of f.places) {
      const e = editsOf(p.file);
      e.flip.set(p.row, [...(e.flip.get(p.row) ?? []), columnIndex(p.column!)]);
    }
  }
}

// Intercompany: turn the rows the files mean as intercompany into pairs that eliminate.
const mappingOf = new Map(ds.mappings.map((m) => [m.companyId, m]));
const outsideIds = new Set(before.findings.filter((f) => f.ruleId === 'IC_OUTSIDE').map((f) => f.id));
const icRows = before.facts
  .filter((f) => f.heldBy.some((id) => outsideIds.has(id)))
  .map((f) => {
    const [file, , ref] = f.sourceCellId.split('!');
    const m = mappingOf.get(f.companyId)!;
    return {
      file,
      row: Number(ref.replace(/^[A-Z]+/, '')),
      companyId: f.companyId,
      side: ACCOUNT.get(f.groupAccount!)!.kind === 'revenue' ? ('sale' as const) : ('purchase' as const),
      label: f.counterpartyRaw ?? '',
      period: f.period,
      typed: f.amountAsTyped / m.scale, // the number as written in the file
    };
  });
const saleLabels = new Set(icRows.filter((x) => x.side === 'sale').map((x) => x.label));
const shared = [...new Set(icRows.filter((x) => x.side === 'purchase').map((x) => x.label))].filter((l) => saleLabels.has(l));
const pairLabel = shared.length === 1 ? shared[0] : null;
// One ring per currency, in code order: each company sells to the next and buys from the previous.
const rings = new Map<string, string[]>();
for (const m of [...ds.mappings].sort((a, b) => a.companyId.localeCompare(b.companyId)))
  rings.set(m.currency, [...(rings.get(m.currency) ?? []), m.companyId]);
const step = (id: string, by: number) => {
  const ring = rings.get(mappingOf.get(id)!.currency)!;
  return ring.length < 2 ? null : ring[(ring.indexOf(id) + by + ring.length) % ring.length];
};
const sold = new Map<string, number>(); // `${buyer}|${period}` → the sale as typed
for (const x of icRows.filter((r) => r.side === 'sale')) {
  const buyer = x.label === pairLabel ? step(x.companyId, 1) : null;
  if (!buyer) {
    editsOf(x.file).reclass.add(x.row);
    continue;
  }
  editsOf(x.file).pair.set(x.row, { counterparty: mappingOf.get(buyer)!.companyName });
  sold.set(`${buyer}|${x.period}`, x.typed);
}
let pairs = 0;
for (const x of icRows.filter((r) => r.side === 'purchase')) {
  const seller = x.label === pairLabel ? step(x.companyId, -1) : null;
  const sale = sold.get(`${x.companyId}|${x.period}`);
  if (!seller || sale === undefined) {
    editsOf(x.file).reclass.add(x.row);
    continue;
  }
  // Same amount as the sale, with the purchase's own sign convention.
  editsOf(x.file).pair.set(x.row, { counterparty: mappingOf.get(seller)!.companyName, amount: Math.sign(x.typed || -1) * Math.abs(sale) });
  pairs++;
}

mkdirSync(OUT, { recursive: true });
// The engine reads canonical names; this copy is what the check at the end loads.
const CHECK = mkdtempSync(path.join(os.tmpdir(), 'happy-path-'));
const year = ds.assumptions.fiscalYear;
for (const m of ds.mappings) {
  const nested = path.join(DATA, m.companyId, m.file);
  const src = existsSync(nested) ? nested : path.join(DATA, m.file);
  const e = edits.get(m.file) ?? editsOf(m.file);
  // For IC_OUTSIDE: the local account that maps to the third-party twin of an intercompany account
  // (4100 Ventas entre empresas → 4000 Ventas), and the columns to rewrite.
  const sm = m.sheets[0];
  const thirdParty = (local: string) => {
    const acc = ACCOUNT.get(m.accountMap[local]);
    const twin = acc && ACCOUNTS.find((a) => !a.ic && a.statement === acc.statement && a.kind === acc.kind);
    const code = twin && Object.keys(m.accountMap).find((k) => m.accountMap[k] === twin.code);
    if (!code) throw new Error(`${m.file}: no hay una cuenta local de terceros para ${local}`);
    return code;
  };
  const wb = readWorkbook(m.file, readFileSync(src));
  const sheets = wb.sheets.map((s) => {
    const header = [...(s.rows.get(sm.headerRow)?.entries() ?? [])];
    const colOf = (label?: string) => header.find(([, v]) => String(v).trim() === label)?.[0];
    const cAccount = colOf(sm.columns.account);
    const cCounterparty = colOf(sm.columns.counterparty);
    const cAmount = colOf(sm.columns.amount);
    const last = Math.max(0, ...s.rows.keys());
    const width = Math.max(0, ...[...s.rows.values()].flatMap((r) => [...r.keys()])) + 1;
    const rows: CellValue[][] = [];
    for (let r = 1; r <= last; r++) {
      if (e.drop.has(r)) continue;
      const cells = s.rows.get(r);
      const row = Array.from({ length: width }, (_, c) => cells?.get(c) ?? null);
      for (const c of e.flip.get(r) ?? []) row[c] = -Number(row[c]);
      if (e.reclass.has(r) && s.name === sm.sheet && cAccount !== undefined) {
        row[cAccount] = thirdParty(String(row[cAccount]).trim());
        if (cCounterparty !== undefined) row[cCounterparty] = null;
      }
      const pair = s.name === sm.sheet ? e.pair.get(r) : undefined;
      if (pair) {
        if (cCounterparty !== undefined) row[cCounterparty] = pair.counterparty;
        if (pair.amount !== undefined && cAmount !== undefined) row[cAmount] = pair.amount;
      }
      rows.push(row);
    }
    return { name: s.name, rows };
  });
  const out = `${m.companyName} - presupuesto ${year}.xlsx`;
  const buf = writeXlsx(sheets);
  writeFileSync(path.join(OUT, out), buf);
  writeFileSync(path.join(CHECK, m.file), buf);
  const flips = [...e.flip.values()].reduce((a, cs) => a + cs.length, 0);
  console.log(
    `${out.padEnd(48)} quitadas: ${e.drop.size}, signos: ${flips}, entre empresas: ${e.pair.size}, a terceros: ${e.reclass.size}`,
  );
}
copyFileSync(path.join(DATA, 'supuestos.xlsx'), path.join(OUT, 'supuestos.xlsx'));
copyFileSync(path.join(DATA, 'supuestos.xlsx'), path.join(CHECK, 'supuestos.xlsx'));

const after = runPipeline(loadDataset(CHECK, MAPPINGS));
rmSync(CHECK, { recursive: true, force: true });
const revenue = (r: typeof after) => r.pl.find((l) => l.id === 'revenue')!.consolidated / 100;
console.log(`\nAntes: ${before.findings.length} hallazgos, ${before.openBlocks.length} bloqueos, ingresos Q ${revenue(before).toLocaleString('en-US')}`);
console.log(`Después: ${after.findings.length} hallazgos, ${after.openBlocks.length} bloqueos, ingresos Q ${revenue(after).toLocaleString('en-US')}`);
const elim = (id: string) => after.pl.find((l) => l.id === id)!.eliminations / 100;
const matched = after.matches.filter((x) => x.statement === 'PL' && x.status === 'matched').length;
console.log(
  `Entre empresas: ${pairs} compras emparejadas con su venta; ${matched} pares cuadran; eliminado de ingresos Q ${elim('revenue').toLocaleString('en-US')}, de costos Q ${elim('cogs').toLocaleString('en-US')}`,
);
if (!after.bridges.revenue.closes || Math.abs(after.bs.assets - after.bs.liabilities - after.bs.equity) >= 100) {
  console.error('El puente no cierra o el balance no cuadra.');
  process.exit(1);
}
if (after.findings.length) {
  for (const f of after.findings) console.error(`  queda ${f.ruleId} en ${f.companyIds.join('+')}: ${f.actual}`);
  process.exit(1);
}
console.log(`\nListo: ${OUT}`);
