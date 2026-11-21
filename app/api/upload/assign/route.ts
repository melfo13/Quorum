/**
 * POST /api/upload/assign — say which company each pending file of an upload is.
 * Body: { id, assignments: { "<file name>": "<companyId>" } }.
 *
 * Each choice is checked again on the server: the file is pending in that upload, the company exists,
 * no other file holds it, and the content has that company's structure. Then the file takes the
 * company's canonical name and the upload becomes the visitor's data.
 */
import { existsSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { readWorkbook } from '@/lib/engine/workbook';
import { getPracticeDataset, uploadDir } from '@/lib/server/state';
import {
  NAME,
  PENDING,
  fileName,
  missingOf,
  selectUpload,
  structureProblem,
  type UploadResult,
} from '@/lib/server/upload';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  let body: { id?: unknown; assignments?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail('Cuerpo inválido.');
  }
  const id = typeof body.id === 'string' ? body.id : undefined;
  const dir = uploadDir(id);
  if (!id || !dir) return fail('Esa carga ya no existe. Vuelve a subir los archivos.', 404);
  if (!body.assignments || typeof body.assignments !== 'object') return fail('Falta elegir las empresas.');

  const mappings = getPracticeDataset().mappings;
  const pendingDir = path.join(dir, PENDING);
  const present = new Set(mappings.filter((m) => existsSync(path.join(dir, m.file))).map((m) => m.file));
  const files: UploadResult['files'] = [];
  const chosen = new Set<string>();

  for (const [raw, companyId] of Object.entries(body.assignments as Record<string, unknown>)) {
    const name = fileName(raw);
    if (!NAME.test(name) || typeof companyId !== 'string' || !companyId) continue;
    const src = path.join(pendingDir, name);
    if (path.dirname(src) !== pendingDir || !existsSync(src)) {
      files.push({ name, status: 'no se pudo leer', detail: 'El archivo ya no está pendiente.' });
      continue;
    }
    const m = mappings.find((x) => x.companyId === companyId);
    if (!m) return fail(`No existe la empresa ${companyId}.`);
    if (present.has(m.file) || chosen.has(m.file)) {
      files.push({
        name,
        status: 'repetido',
        company: m.companyName,
        detail: 'Esta empresa ya tiene un archivo en la carga.',
      });
      continue;
    }
    const problem = structureProblem(readWorkbook(name, readFileSync(src)), name, m);
    if (problem) {
      files.push({ name, status: 'formato distinto', company: m.companyName, detail: problem });
      continue;
    }
    renameSync(src, path.join(dir, m.file));
    chosen.add(m.file);
    present.add(m.file);
    files.push({ name, status: 'reconocido', company: m.companyName });
  }

  const stillPending = existsSync(pendingDir) ? readdirSync(pendingDir) : [];
  const result: UploadResult = {
    id,
    files,
    pending: stillPending.map((name) => ({
      name,
      companies: mappings
        .filter((m) => !present.has(m.file))
        .map((m) => ({ id: m.companyId, name: m.companyName })),
    })),
    missing: missingOf(mappings, present),
    recognised: present.size,
  };
  const res = NextResponse.json(result);
  if (present.size > 0) selectUpload(res, id);
  return res;
}
