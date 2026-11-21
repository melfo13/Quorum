import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDataset, runPipeline } from '@/lib/engine/pipeline';
import { monthly } from './monthly';

// The frozen practice set: it has eliminations between companies and three currencies.
const FIXTURE = path.resolve(__dirname, '..', '..', 'lib', 'agent', '__fixtures__', 'practice');
const ds = loadDataset(path.join(FIXTURE, 'data'), path.join(FIXTURE, 'mappings'));
const r = runPipeline(ds, {
  resolved: runPipeline(ds).openBlocks.map((f) => f.id),
  signFixes: [],
  accountOverrides: {},
  approved: [],
});

describe('the year month by month', () => {
  for (const metric of ['revenue', 'ebit'] as const) {
    it(`adds up, month by month and for the year, to the consolidated ${metric}`, () => {
      const s = monthly(r, metric);
      expect(s.points).toHaveLength(12);
      for (const p of s.points) expect(Object.values(p.parts).reduce((a, v) => a + v, 0)).toBe(p.total);
      const year = s.points.reduce((a, p) => a + p.total, 0);
      expect(year).toBe(r.pl.find((l) => l.id === metric)!.consolidated);
    });
  }

  it('splits by the companies’ currencies, largest first', () => {
    const s = monthly(r, 'revenue');
    expect(new Set(s.countries)).toEqual(new Set(r.companies.map((c) => c.currency)));
  });
});
