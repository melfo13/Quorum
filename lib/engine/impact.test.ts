import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDataset, runPipeline, type Dataset } from './pipeline';
import type { SourceMapping } from './types';
import { readWorkbook, writeXlsx } from './workbook';

// Group assumptions from the frozen practice set: GTQ is the group currency.
const FIXTURE = path.resolve(__dirname, '..', 'agent', '__fixtures__', 'practice');
const assumptions = loadDataset(path.join(FIXTURE, 'data'), path.join(FIXTURE, 'mappings')).assumptions;

const mapping: SourceMapping = {
  companyId: 'T1',
  companyName: 'Prueba',
  file: 'T1.xlsx',
  currency: 'GTQ',
  scale: 1,
  expenseSign: 'negative',
  sheets: [
    {
      sheet: 'Presupuesto',
      headerRow: 1,
      shape: 'long',
      columns: {
        account: 'Cuenta',
        description: 'Descripción',
        period: 'Mes',
        amount: 'Monto',
        counterparty: 'Contraparte',
      },
    },
  ],
  accountMap: { '4101': '4000', '6101': '6100', '8101': '8100', '4201': '4000', '4190': '4100' },
  counterpartyMap: {},
  status: 'approved',
};

function run(rows: (string | number)[][]) {
  const wb = readWorkbook(
    'T1.xlsx',
    writeXlsx([
      { name: 'Presupuesto', rows: [['Cuenta', 'Descripción', 'Mes', 'Monto', 'Contraparte'], ...rows] },
    ]),
  );
  const ds: Dataset = {
    dir: '',
    isPractice: false,
    assumptions,
    mappings: [mapping],
    workbooks: new Map([['T1.xlsx', wb]]),
    missingFiles: [],
  };
  return runPipeline(ds).findings;
}

describe('which line an error moves', () => {
  it('reports an inverted operating expense against EBIT, and an inverted income tax against net income', () => {
    const findings = run([
      ['4101', 'Ventas', '2027-01', 100000],
      ['6101', 'Sueldos', '2027-01', 20000],
      ['8101', 'Impuesto sobre la renta', '2027-01', 5000],
    ]);
    const salary = findings.find((f) => f.ruleId === 'SIGN_INVERTED' && f.actual.startsWith('Sueldos'))!;
    const tax = findings.find((f) => f.ruleId === 'SIGN_INVERTED' && f.actual.startsWith('Impuesto'))!;
    expect(salary.groupImpact?.metric).toBe('ebit');
    expect(salary.impactText).toContain('el EBIT');
    expect(tax.groupImpact?.metric).toBe('net');
    expect(tax.impactText).toContain('la utilidad neta');
  });

  it('reports a duplicated income tax row against net income', () => {
    const findings = run([
      ['4101', 'Ventas', '2027-01', 100000],
      ['8101', 'Impuesto sobre la renta', '2027-01', -5000],
      ['8101', 'Impuesto sobre la renta', '2027-01', -5000],
    ]);
    const dup = findings.find((f) => f.ruleId === 'DUPLICATE_ROW')!;
    expect(dup.groupImpact?.metric).toBe('net');
    expect(dup.impactText).toContain('la utilidad neta');
    expect(dup.impactText).not.toContain('Q 0');
  });

  it('holds an intercompany sale whose counterparty is not a group company out of the number', () => {
    const findings = run([
      ['4101', 'Ventas', '2027-01', 100000, ''],
      ['4190', 'Ventas a relacionadas', '2027-01', 7000, 'Empresa 9'],
      ['4190', 'Ventas a relacionadas', '2027-02', 8000, 'Empresa 9'],
    ]);
    const f = findings.find((x) => x.ruleId === 'IC_OUTSIDE')!;
    expect(f.severity).toBe('quarantine');
    expect(f.actual).toContain('"Empresa 9"');
    expect(f.actual).toContain('2 filas');
    expect(f.groupImpact).toEqual({ metric: 'revenue', cents: 1_500_000 });
  });
});
