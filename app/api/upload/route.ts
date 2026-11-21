/**
 * POST /api/upload — the visitor's own budget files.
 *
 * Files are recognised by name against the mappings (e1_presupuesto.xlsx → Empresa 1) plus
 * supuestos.xlsx. Recognised files are written to data/uploads/<id>/ under their canonical name,
 * the pg_dataset cookie selects that folder, and the decisions cookie is cleared: a new upload
 * starts with no decisions.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { readWorkbook } from '@/lib/engine/workbook';
import { COOKIE, DATASET_COOKIE, UPLOADS_DIR, getPracticeDataset } from '@/lib/server/state';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_FILES = 12;
const MAX_BYTES = 10 * 1024 * 1024;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,100}\.(xlsx|csv)$/i;
const SUPUESTOS = 'supuestos.xlsx';

export type UploadStatus = 'reconocido' | 'supuestos' | 'sin mapeo' | 'no se pudo leer';
export type UploadResult = {
  id: string;
  files: { name: string; status: UploadStatus; company?: string }[];
  missing: { file: string; company: string }[];
  recognised: number;
};

const fail = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail('No llegó ningún archivo. Envía el formulario con uno o más archivos .xlsx o .csv.');
  }
  const files = form.getAll('files').filter((f): f is File => typeof f !== 'string');
  if (!files.length) return fail('No llegó ningún archivo. Elige uno o más archivos .xlsx o .csv.');
  if (files.length > MAX_FILES) return fail(`Son ${files.length} archivos; el máximo es ${MAX_FILES} por envío.`);
  for (const f of files) {
    const name = path.basename(f.name);
    if (!NAME.test(name)) return fail(`"${name}" no es un archivo .xlsx o .csv con un nombre válido.`);
    if (f.size > MAX_BYTES) return fail(`"${name}" pesa más de 10 MB.`);
    if (f.size === 0) return fail(`"${name}" está vacío.`);
  }

  const mappings = getPracticeDataset().mappings;
  const byName = new Map(mappings.map((m) => [m.file.toLowerCase(), m]));
  const id = `${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;
  const dir = path.join(UPLOADS_DIR, id);
  mkdirSync(dir, { recursive: true });

  const result: UploadResult = { id, files: [], missing: [], recognised: 0 };
  const seen = new Set<string>();
  for (const f of files) {
    const name = path.basename(f.name);
    const lower = name.toLowerCase();
    const mapping = byName.get(lower);
    if (!mapping && lower !== SUPUESTOS) {
      result.files.push({ name, status: 'sin mapeo' });
      continue;
    }
    const canonical = mapping ? mapping.file : SUPUESTOS;
    const buf = Buffer.from(await f.arrayBuffer());
    try {
      readWorkbook(canonical, buf);
    } catch {
      result.files.push({ name, status: 'no se pudo leer', company: mapping?.companyName });
      continue;
    }
    writeFileSync(path.join(dir, canonical), buf);
    seen.add(canonical);
    if (mapping) {
      result.recognised++;
      result.files.push({ name, status: 'reconocido', company: mapping.companyName });
    } else result.files.push({ name, status: 'supuestos' });
  }
  result.missing = mappings.filter((m) => !seen.has(m.file)).map((m) => ({ file: m.file, company: m.companyName }));

  const res = NextResponse.json(result, { status: 200 });
  if (result.recognised > 0) {
    res.cookies.set(DATASET_COOKIE, id, { path: '/', sameSite: 'lax', httpOnly: true });
    res.cookies.delete(COOKIE);
  }
  return res;
}
