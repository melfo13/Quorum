/**
 * POST /api/upload — the visitor's own budget files, under any name.
 *
 * Each file is matched to a company by name (exact, or containing the company id), or held as
 * pending when its content has a mapping's structure but its name does not say which company it is;
 * the person then picks the company (POST /api/upload/assign). A file with another structure is
 * refused with what it lacks. Matched files are written to data/uploads/<id>/ under their canonical
 * name, the pg_dataset cookie selects that folder, and the decisions cookie is cleared: a new upload
 * starts with no decisions.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { readWorkbook } from '@/lib/engine/workbook';
import { UPLOADS_DIR, getPracticeDataset } from '@/lib/server/state';
import {
  NAME,
  fileName,
  PENDING,
  SUPUESTOS,
  bestProblem,
  companyFromName,
  compatibleMappings,
  isSupuestos,
  missingOf,
  selectUpload,
  structureProblem,
  type UploadResult,
} from '@/lib/server/upload';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_FILES = 12;
const MAX_BYTES = 10 * 1024 * 1024;

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
    const name = fileName(f.name);
    if (!NAME.test(name)) return fail(`"${name}" no es un archivo .xlsx o .csv con un nombre válido.`);
    if (f.size > MAX_BYTES) return fail(`"${name}" pesa más de 10 MB.`);
    if (f.size === 0) return fail(`"${name}" está vacío.`);
  }

  const mappings = getPracticeDataset().mappings;
  const id = `${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;
  const dir = path.join(UPLOADS_DIR, id);
  mkdirSync(dir, { recursive: true });

  const result: UploadResult = { id, files: [], pending: [], missing: [], recognised: 0 };
  const taken = new Set<string>();
  for (const f of files) {
    const name = fileName(f.name);
    const buf = Buffer.from(await f.arrayBuffer());
    let wb;
    try {
      wb = readWorkbook(name, buf);
    } catch {
      result.files.push({ name, status: 'no se pudo leer' });
      continue;
    }

    if (isSupuestos(name)) {
      writeFileSync(path.join(dir, SUPUESTOS), buf);
      result.files.push({ name, status: 'supuestos' });
      continue;
    }

    const byName = companyFromName(name, mappings);
    const fits = compatibleMappings(wb, name, mappings);
    // The name says which company; the content still has to be readable with that company's mapping.
    if (byName) {
      const problem = structureProblem(wb, name, byName);
      if (problem) {
        result.files.push({ name, status: 'formato distinto', company: byName.companyName, detail: problem });
        continue;
      }
      if (taken.has(byName.file)) {
        result.files.push({ name, status: 'repetido', company: byName.companyName, detail: 'Llegó otro archivo para esta empresa.' });
        continue;
      }
      writeFileSync(path.join(dir, byName.file), buf);
      taken.add(byName.file);
      result.recognised++;
      result.files.push({ name, status: 'reconocido', company: byName.companyName });
      continue;
    }

    if (!fits.length) {
      result.files.push({ name, status: 'formato distinto', detail: bestProblem(wb, name, mappings) });
      continue;
    }
    mkdirSync(path.join(dir, PENDING), { recursive: true });
    writeFileSync(path.join(dir, PENDING, name), buf);
    result.files.push({ name, status: 'elegir empresa' });
    result.pending.push({ name, companies: fits.map((m) => ({ id: m.companyId, name: m.companyName })) });
  }
  result.missing = missingOf(mappings, taken);

  const res = NextResponse.json(result, { status: 200 });
  if (result.recognised > 0) selectUpload(res, id);
  return res;
}
