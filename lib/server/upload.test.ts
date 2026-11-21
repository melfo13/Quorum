import { describe, expect, it } from 'vitest';
import type { SourceMapping } from '@/lib/engine/types';
import { readWorkbook, writeCsv, writeXlsx, type CellValue } from '@/lib/engine/workbook';
import {
  NAME,
  bestProblem,
  fileName,
  companyFromName,
  compatibleMappings,
  isSupuestos,
  structureProblem,
} from './upload';

const HEADERS = ['Cuenta', 'Descripción', 'Mes', 'Monto', 'Contraparte', 'Moneda'];

const mapping = (id: string, file = `${id}_presupuesto.xlsx`): SourceMapping => ({
  companyId: id,
  companyName: id,
  file,
  currency: 'GTQ',
  scale: 1,
  expenseSign: 'negative',
  sheets: [
    {
      sheet: file.endsWith('.csv') ? file.replace(/\.csv$/, '') : 'Presupuesto',
      headerRow: 1,
      shape: 'long',
      columns: {
        account: 'Cuenta',
        description: 'Descripción',
        period: 'Mes',
        amount: 'Monto',
        counterparty: 'Contraparte',
        currency: 'Moneda',
      },
    },
  ],
  accountMap: {},
  counterpartyMap: {},
  status: 'proposed',
});

const MAPPINGS = ['EMP_GT_01', 'EMP_GT_02', 'EMP_CR_01'].map((id) => mapping(id));
const row: CellValue[] = ['4101', 'Ventas', '2027-01', 1000, '', 'GTQ'];
const xlsx = (name: string, sheet: string, headers: string[]) =>
  readWorkbook(name, writeXlsx([{ name: sheet, rows: [headers, row] }]));

describe('which company a file name points to', () => {
  it('takes the exact mapped name, any case', () => {
    expect(companyFromName('emp_gt_01_presupuesto.XLSX', MAPPINGS)?.companyId).toBe('EMP_GT_01');
  });

  it('takes a name that contains the company id, written any way', () => {
    expect(companyFromName('Presupuesto EMP GT 02 (versión 3).xlsx', MAPPINGS)?.companyId).toBe('EMP_GT_02');
    expect(companyFromName('emp-cr-01_final.xlsx', MAPPINGS)?.companyId).toBe('EMP_CR_01');
  });

  it('takes a name that contains the company name, with or without accents', () => {
    const named = MAPPINGS.map((m, i) => ({
      ...m,
      companyName: ['Logística Maya', 'Textiles Quetzal', 'Agroexport Pacífico'][i],
    }));
    expect(companyFromName('Logística Maya - presupuesto 2027.xlsx', named)?.companyId).toBe('EMP_GT_01');
    expect(companyFromName('logistica_maya.xlsx', named)?.companyId).toBe('EMP_GT_01');
    expect(companyFromName('AGROEXPORT PACIFICO v2.xlsx', named)?.companyId).toBe('EMP_CR_01');
  });

  it('does not guess when the name names no company, or the wrong kind of file', () => {
    expect(companyFromName('presupuesto_final.xlsx', MAPPINGS)).toBeUndefined();
    expect(companyFromName('EMP_GT_01.csv', MAPPINGS)).toBeUndefined();
  });

  it('prefers the longer id when one contains another', () => {
    const ms = [...MAPPINGS, mapping('EMP_GT_011')];
    expect(companyFromName('EMP_GT_011 budget.xlsx', ms)?.companyId).toBe('EMP_GT_011');
  });

  it('accepts the accented names macOS sends decomposed, and stores them composed', () => {
    const decomposed = 'Logi\u0301stica Maya - presupuesto 2027.xlsx';
    expect(NAME.test(decomposed)).toBe(true);
    expect(fileName(decomposed)).toBe('Logística Maya - presupuesto 2027.xlsx');
    expect(fileName('/tmp/x/Textiles Quetzal.xlsx')).toBe('Textiles Quetzal.xlsx');
  });

  it('accepts accented file names but never a path', () => {
    expect(NAME.test('Logística Maya - presupuesto 2027.xlsx')).toBe(true);
    expect(NAME.test('../escape.xlsx')).toBe(false);
    expect(NAME.test('carpeta/archivo.xlsx')).toBe(false);
  });

  it('recognises the group assumptions file', () => {
    expect(isSupuestos('supuestos.xlsx')).toBe(true);
    expect(isSupuestos('Supuestos 2027.xlsx')).toBe(true);
    expect(isSupuestos('supuestos.csv')).toBe(false);
  });
});

describe('whether the content can be read with a mapping', () => {
  it('accepts the sheet and headers the engine reads, under any file name', () => {
    const wb = xlsx('lo que sea.xlsx', 'Presupuesto', HEADERS);
    expect(structureProblem(wb, 'lo que sea.xlsx', MAPPINGS[0])).toBeNull();
    expect(compatibleMappings(wb, 'lo que sea.xlsx', MAPPINGS)).toHaveLength(3);
  });

  it('says which sheet is missing', () => {
    const wb = xlsx('x.xlsx', 'Hoja1', HEADERS);
    expect(structureProblem(wb, 'x.xlsx', MAPPINGS[0])).toBe('falta la hoja "Presupuesto"');
  });

  it('says which columns are missing', () => {
    const wb = xlsx('x.xlsx', 'Presupuesto', ['Cuenta', 'Mes', 'Importe']);
    const problem = bestProblem(wb, 'x.xlsx', MAPPINGS);
    expect(problem).toContain('"Monto"');
    expect(problem).toContain('"Descripción"');
    expect(problem).not.toContain('"Cuenta"');
  });

  it('compares only the headers of a csv, whose one sheet takes the file name', () => {
    const csvMapping = mapping('EMP_GT_09', 'EMP_GT_09.csv');
    const wb = readWorkbook('cualquier nombre.csv', Buffer.from(writeCsv([HEADERS, row])));
    expect(structureProblem(wb, 'cualquier nombre.csv', csvMapping)).toBeNull();
    expect(structureProblem(wb, 'cualquier nombre.csv', MAPPINGS[0])).toBe('se espera un archivo .xlsx');
  });
});
