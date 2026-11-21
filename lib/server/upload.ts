/**
 * Which company an uploaded file belongs to. A file is accepted under any name:
 *
 *   1. its name is the mapping's file name (EMP_GT_01_presupuesto.xlsx), or contains the company id
 *      written any way ("emp gt 01 v2.xlsx") → that company;
 *   2. otherwise, if its content has the structure a mapping reads (sheet and header labels), the
 *      person picks the company;
 *   3. otherwise it is refused, saying which sheet or columns are missing.
 *
 * The structure check uses the engine's own rule (map.ts): the sheet by exact name, header labels
 * trimmed and exact. A csv has one sheet named after the file, so only its headers are compared.
 */
import path from 'node:path';
import type { NextResponse } from 'next/server';
import type { SourceMapping } from '@/lib/engine/types';
import type { Workbook } from '@/lib/engine/workbook';
import { COOKIE, DATASET_COOKIE } from './state';

export const SUPUESTOS = 'supuestos.xlsx';
/** A file name we accept: letters (accents too), digits, spaces and . _ ( ) -; no slashes, so it never leaves its folder. */
export const NAME = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}._ ()-]{0,100}\.(xlsx|csv)$/iu;

/**
 * A file name as we store and compare it. macOS sends "í" decomposed (i + combining accent); NFC
 * joins it back, so the same name always has the same bytes on disk and in the browser.
 */
export const fileName = (raw: string) => path.basename(raw).normalize('NFC');
/** Inside an upload folder: files with the right structure waiting for the person to pick the company. */
export const PENDING = '_pending';

export type UploadStatus =
  'reconocido' | 'supuestos' | 'elegir empresa' | 'formato distinto' | 'repetido' | 'no se pudo leer';
export type UploadResult = {
  id: string;
  files: { name: string; status: UploadStatus; company?: string; detail?: string }[];
  /** Files with the right structure waiting for the person to say which company they are. */
  pending: { name: string; companies: { id: string; name: string }[] }[];
  missing: { file: string; company: string }[];
  recognised: number;
};

export const missingOf = (mappings: SourceMapping[], present: Set<string>) =>
  mappings.filter((m) => !present.has(m.file)).map((m) => ({ file: m.file, company: m.companyName }));

/** Point the visitor at an upload folder; a new upload starts with no decisions. */
export function selectUpload(res: NextResponse, id: string) {
  res.cookies.set(DATASET_COOKIE, id, { path: '/', sameSite: 'lax', httpOnly: true });
  res.cookies.delete(COOKIE);
}

const ext = (name: string) => path.extname(name).toLowerCase();
/** Lowercase, no accents, letters and digits only: "Logística Maya" and "logistica-maya" compare equal. */
const squash = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * The company a file name points to: its exact mapped name, or a name that contains one company's id
 * ("emp gt 01 v2.xlsx") or its name ("Logistica Maya - presupuesto.xlsx"), written any way.
 */
export function companyFromName(name: string, mappings: SourceMapping[]): SourceMapping | undefined {
  const lower = name.toLowerCase();
  const exact = mappings.find((m) => m.file.toLowerCase() === lower);
  if (exact) return exact;
  const stem = squash(path.basename(name, path.extname(name)));
  const same = mappings.filter((m) => ext(m.file) === ext(name));
  return containedIn(stem, same, (m) => m.companyId) ?? containedIn(stem, same, (m) => m.companyName);
}

/** The one mapping whose key appears in the stem; the longest key wins ("EMP_GT_011" over "EMP_GT_01"). */
function containedIn(stem: string, mappings: SourceMapping[], key: (m: SourceMapping) => string) {
  const hits = mappings.filter((m) => squash(key(m)).length > 2 && stem.includes(squash(key(m))));
  if (!hits.length) return undefined;
  const longest = Math.max(...hits.map((m) => squash(key(m)).length));
  const best = hits.filter((m) => squash(key(m)).length === longest);
  return best.length === 1 ? best[0] : undefined;
}

export const isSupuestos = (name: string) => ext(name) === '.xlsx' && squash(name).startsWith('supuestos');

/** Why a workbook cannot be read with a mapping, or null when it can. */
export function structureProblem(wb: Workbook, fileName: string, m: SourceMapping): string | null {
  if (ext(fileName) !== ext(m.file)) return `se espera un archivo ${ext(m.file)}`;
  const problems: string[] = [];
  for (const sm of m.sheets) {
    const sheet = ext(fileName) === '.csv' ? wb.sheets[0] : wb.sheets.find((s) => s.name === sm.sheet);
    if (!sheet) {
      problems.push(`falta la hoja "${sm.sheet}"`);
      continue;
    }
    const headers = new Set([...(sheet.rows.get(sm.headerRow)?.values() ?? [])].map((v) => String(v).trim()));
    const needed = [...Object.values(sm.columns), ...Object.keys(sm.periodColumns ?? {})].filter(
      (h): h is string => !!h,
    );
    const missing = needed.filter((h) => !headers.has(h));
    if (missing.length)
      problems.push(
        `${missing.length === 1 ? 'falta la columna' : 'faltan las columnas'} ${missing.map((h) => `"${h}"`).join(', ')} en la fila ${sm.headerRow} de "${sheet.name}"`,
      );
  }
  return problems.length ? problems.join('; ') : null;
}

/** The mappings whose structure this workbook has; their companies are the ones it can belong to. */
export function compatibleMappings(wb: Workbook, fileName: string, mappings: SourceMapping[]) {
  return mappings.filter((m) => structureProblem(wb, fileName, m) === null);
}

/** The closest structure problem, for the message: the mapping with the fewest missing pieces. */
export function bestProblem(wb: Workbook, fileName: string, mappings: SourceMapping[]): string {
  const problems = mappings.map((m) => structureProblem(wb, fileName, m) ?? '').filter(Boolean);
  problems.sort((a, b) => a.length - b.length);
  return problems[0] ?? 'no coincide con ningún presupuesto del grupo';
}
