import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDataset, runPipeline } from './pipeline';
import { NO_RESOLUTIONS } from './types';

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');
const MAPPINGS = path.join(ROOT, 'mappings');

const EMP = ['EMP_CR_01', 'EMP_CR_02', 'EMP_CR_03', 'EMP_GT_01', 'EMP_GT_02', 'EMP_GT_03'];

describe('the official EMP dataset', () => {
  const ds = loadDataset(DATA, MAPPINGS);
  const r = runPipeline(ds, NO_RESOLUTIONS);

  it('loads one folder per EMP company and no E# company', () => {
    expect(ds.missingFiles).toEqual([]);
    expect(ds.mappings.map((m) => m.companyId).sort()).toEqual([...EMP].sort());
    expect(ds.mappings.every((m) => m.file.startsWith(m.companyId))).toBe(true);
  });

  it('closes every bridge', () => {
    for (const b of Object.values(r.bridges)) expect(b.closes).toBe(true);
  });

  it('keeps the consolidated balance sheet balanced', () => {
    expect(Math.abs(r.bs.assets - r.bs.liabilities - r.bs.equity)).toBeLessThan(100);
  });
});
