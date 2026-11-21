import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDataset, runPipeline } from './pipeline';
import { NO_RESOLUTIONS } from './types';

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');
const MAPPINGS = path.join(ROOT, 'mappings');
// The truth folder is read by tests only; the engine never opens it.
const truth = (f: string) => JSON.parse(readFileSync(path.join(DATA, '_truth', f), 'utf8'));

describe('consolidation of the clean files', () => {
  const ds = loadDataset(path.join(DATA, '_truth', 'clean'), MAPPINGS, path.join(DATA, 'supuestos.xlsx'));
  const r = runPipeline(ds);
  const expected = truth('expected_consolidated.json');
  const line = (id: string) => r.pl.find((l) => l.id === id)!.consolidated / 100;

  it('finds nothing to block or quarantine', () => {
    expect(r.findings.filter((f) => f.severity !== 'warning')).toEqual([]);
  });

  it('matches the hand-built consolidation to the quetzal', () => {
    expect(Math.abs(line('revenue') - expected.totals.revenue)).toBeLessThan(10);
    expect(Math.abs(line('ebit') - expected.totals.ebit)).toBeLessThan(10);
    expect(Math.abs(r.bs.assets / 100 - expected.totals.assets)).toBeLessThan(10);
    expect(Math.abs(r.kpis.roic - expected.kpis.roic)).toBeLessThan(1e-6);
    expect(Math.abs(r.kpis.eva / 100 - expected.kpis.eva)).toBeLessThan(10);
  });

  it('keeps the consolidated balance sheet balanced', () => {
    expect(Math.abs(r.bs.assets - r.bs.liabilities - r.bs.equity)).toBeLessThan(100);
  });
});

describe('the seeded dataset', () => {
  const ds = loadDataset(DATA, MAPPINGS);
  const first = runPipeline(ds, NO_RESOLUTIONS);
  // Resolve every block, as a person would on the Load screen, so the rows behind them are checked too.
  const r = runPipeline(ds, { ...NO_RESOLUTIONS, resolved: first.openBlocks.map((f) => f.id) });
  const key = truth('answer_key.json');

  const cases: [string, string][] = key.errors.map((e: { rule: string; file: string }) => [e.rule, e.file]);
  it.each(cases)('finds %s in %s', (rule, file) => {
    // A missing row has no place of its own; the finding names the company that lacks it.
    const company = ds.mappings.find((m) => m.file === file)!.companyId;
    const hit = r.findings.some(
      (f) => f.ruleId === rule && (f.places.some((p) => p.file === file) || f.companyIds.includes(company)),
    );
    expect(hit).toBe(true);
  });

  it('closes every bridge exactly, before and after resolving', () => {
    for (const run of [first, r]) for (const b of Object.values(run.bridges)) expect(b.closes).toBe(true);
  });

  it('holds back an open block until someone resolves it', () => {
    const blocked = first.facts.filter((f) => f.companyId === 'E5');
    expect(blocked.every((f) => f.status === 'quarantined')).toBe(true);
    expect(r.facts.filter((f) => f.companyId === 'E5' && f.status === 'clean').length).toBeGreaterThan(0);
  });
});
