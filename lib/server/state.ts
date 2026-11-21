import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { loadDataset, runPipeline, type Dataset, type PipelineResult } from '@/lib/engine/pipeline';
import { NO_RESOLUTIONS, type Resolutions } from '@/lib/engine/types';

export const COOKIE = 'pg_resolutions';

const ROOT = process.cwd();
export const DATA_DIR = process.env.PULSEGROUP_DATA ?? path.join(ROOT, 'data');
export const MAPPINGS_DIR = path.join(ROOT, 'mappings');
const PREVIOUS_DIR = path.join(DATA_DIR, 'anterior');

export function parseResolutions(raw: string | undefined): Resolutions {
  if (!raw) return NO_RESOLUTIONS;
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Resolutions>;
    return {
      resolved: v.resolved ?? [],
      signFixes: v.signFixes ?? [],
      accountOverrides: v.accountOverrides ?? {},
      approved: v.approved ?? [],
    };
  } catch {
    return NO_RESOLUTIONS;
  }
}

export const encodeResolutions = (r: Resolutions) => Buffer.from(JSON.stringify(r), 'utf8').toString('base64url');

export const getResolutions = cache(async (): Promise<Resolutions> => {
  const jar = await cookies();
  return parseResolutions(jar.get(COOKIE)?.value);
});

export const DATASET_COOKIE = 'pg_dataset';
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const UPLOAD_ID = /^[a-z0-9-]{8,40}$/;

/** The cookie value that selects the bundled example data instead of an upload. */
export const SAMPLE_ID = 'ejemplo';

/**
 * What the screens read. The app starts empty: it shows data only after someone uploads files, or
 * picks the bundled example data as a fallback for a demo.
 */
export type Source =
  | { kind: 'none' }
  | { kind: 'practice' }
  | { kind: 'upload'; id: string; dir: string; files: string[]; uploadedAt: Date; supuestos: 'subido' | 'del grupo' };

/** The folder of an upload, or null. The id is checked strictly so a cookie can never leave data/uploads. */
export function uploadDir(id: string | undefined): string | null {
  if (!id || !UPLOAD_ID.test(id)) return null;
  const dir = path.join(UPLOADS_DIR, id);
  if (path.dirname(dir) !== UPLOADS_DIR || !existsSync(dir)) return null;
  return dir;
}

/** Which files the screens read: the visitor's upload, the example data, or nothing yet (cookie pg_dataset). */
export const getSource = cache(async (): Promise<Source> => {
  const jar = await cookies();
  const id = jar.get(DATASET_COOKIE)?.value;
  if (id === SAMPLE_ID) return { kind: 'practice' };
  const dir = uploadDir(id);
  if (!dir || !id) return { kind: 'none' };
  const files = readdirSync(dir).filter((f) => /\.(xlsx|csv)$/i.test(f));
  if (!files.length) return { kind: 'none' };
  return {
    kind: 'upload',
    id,
    dir,
    files,
    uploadedAt: statSync(dir).mtime,
    supuestos: files.includes('supuestos.xlsx') ? 'subido' : 'del grupo',
  };
});

/** No files at all: the group's mappings and assumptions, and every company file missing. */
const EMPTY_DIR = path.join(UPLOADS_DIR, '__sin-datos');

const datasetFor = (source: Source): Dataset =>
  source.kind === 'upload'
    ? loadDataset(
        source.dir,
        MAPPINGS_DIR,
        source.supuestos === 'subido' ? path.join(source.dir, 'supuestos.xlsx') : path.join(DATA_DIR, 'supuestos.xlsx'),
      )
    : source.kind === 'none'
      ? loadDataset(EMPTY_DIR, MAPPINGS_DIR, path.join(DATA_DIR, 'supuestos.xlsx'))
      : loadDataset(DATA_DIR, MAPPINGS_DIR);

/** The dataset the current request runs on, filled in by getResult(). */
const current = cache((): { ds: Dataset | null } => ({ ds: null }));

/** The dataset of the current request (practice data, or the visitor's upload). */
export const getDatasetAsync = async (): Promise<Dataset> => datasetFor(await getSource());

/**
 * Synchronous access for screens that already awaited getResult() in the same request (every
 * screen does): returns the dataset that result was computed from. Before getResult() it falls
 * back to the practice data.
 */
export function getDataset(): Dataset {
  return current().ds ?? loadDataset(DATA_DIR, MAPPINGS_DIR);
}

/** The practice dataset, whatever the visitor selected. Used to recognise uploaded file names. */
export const getPracticeDataset = (): Dataset => loadDataset(DATA_DIR, MAPPINGS_DIR);

/** The pipeline for the current visitor's resolutions. One run per request. */
export const getResult = cache(async (): Promise<PipelineResult> => {
  const ds = await getDatasetAsync();
  current().ds = ds;
  return runPipeline(ds, await getResolutions());
});

/**
 * The previous version of the budget, when it exists: data/anterior for the practice data, or an
 * `anterior/` folder inside an upload. Null otherwise; callers show no deviation then.
 */
export const getPrevious = cache(async (): Promise<PipelineResult | null> => {
  const source = await getSource();
  if (source.kind === 'none') return null;
  const dir = source.kind === 'upload' ? path.join(source.dir, 'anterior') : PREVIOUS_DIR;
  if (!existsSync(path.join(dir, 'supuestos.xlsx'))) return null;
  return runPipeline(loadDataset(dir, MAPPINGS_DIR));
});
