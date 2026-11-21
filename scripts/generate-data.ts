/**
 * Practice dataset for PulseGroup (docs/seed.md). Fixed seed, reproducible.
 *
 *   pnpm data          writes data/, data/anterior/ and data/_truth/
 *
 * Deviation from the seed: SheetJS is not installable on the event network (TLS interception),
 * so .xlsx files are written with lib/engine/workbook.ts. The files open in Excel and Numbers.
 *
 * The script builds a ledger per company in natural signs (revenue +, expense −, balances +),
 * writes each company in its own structure, then seeds the errors into copies of the clean grids.
 * The truth (answer key, clean files, expected consolidation) goes to data/_truth/, which the
 * engine never reads.
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { writeXlsx, writeCsv, type CellValue } from '../lib/engine/workbook';

const ROOT = path.resolve(import.meta.dirname, '..', 'data');
const YEAR = 2027;
const MONTHS = Array.from({ length: 12 }, (_, i) => `${YEAR}-${String(i + 1).padStart(2, '0')}`);
const ES_MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const ES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ------------------------------------------------------------------ random

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ group

type GroupAccount = {
  code: string;
  name: string;
  statement: 'PL' | 'BS';
  kind: 'revenue' | 'cogs' | 'opex' | 'finance' | 'tax' | 'asset' | 'liability' | 'equity';
  current?: boolean;
  ic?: boolean;
  debt?: boolean;
};

const CATALOG: GroupAccount[] = [
  { code: '4000', name: 'Ingresos por ventas', statement: 'PL', kind: 'revenue' },
  { code: '4100', name: 'Ingresos entre empresas', statement: 'PL', kind: 'revenue', ic: true },
  { code: '5000', name: 'Costo de ventas', statement: 'PL', kind: 'cogs' },
  { code: '5100', name: 'Compras entre empresas', statement: 'PL', kind: 'cogs', ic: true },
  { code: '6100', name: 'Sueldos y prestaciones', statement: 'PL', kind: 'opex' },
  { code: '6200', name: 'Logística y fletes', statement: 'PL', kind: 'opex' },
  { code: '6300', name: 'Arrendamientos', statement: 'PL', kind: 'opex' },
  { code: '6400', name: 'Mercadeo', statement: 'PL', kind: 'opex' },
  { code: '6500', name: 'Servicios y otros gastos', statement: 'PL', kind: 'opex' },
  { code: '6900', name: 'Depreciación', statement: 'PL', kind: 'opex' },
  { code: '7100', name: 'Gastos financieros', statement: 'PL', kind: 'finance' },
  { code: '8100', name: 'Impuesto sobre la renta', statement: 'PL', kind: 'tax' },
  { code: '1100', name: 'Efectivo', statement: 'BS', kind: 'asset', current: true },
  { code: '1200', name: 'Cuentas por cobrar', statement: 'BS', kind: 'asset', current: true },
  {
    code: '1250',
    name: 'Cuentas por cobrar entre empresas',
    statement: 'BS',
    kind: 'asset',
    current: true,
    ic: true,
  },
  { code: '1300', name: 'Inventarios', statement: 'BS', kind: 'asset', current: true },
  { code: '1500', name: 'Propiedad, planta y equipo, neto', statement: 'BS', kind: 'asset' },
  { code: '2100', name: 'Proveedores', statement: 'BS', kind: 'liability', current: true },
  {
    code: '2150',
    name: 'Cuentas por pagar entre empresas',
    statement: 'BS',
    kind: 'liability',
    current: true,
    ic: true,
  },
  { code: '2200', name: 'Impuestos por pagar', statement: 'BS', kind: 'liability', current: true },
  {
    code: '2300',
    name: 'Deuda financiera de corto plazo',
    statement: 'BS',
    kind: 'liability',
    current: true,
    debt: true,
  },
  { code: '2500', name: 'Deuda financiera de largo plazo', statement: 'BS', kind: 'liability', debt: true },
  { code: '3100', name: 'Capital social', statement: 'BS', kind: 'equity' },
  { code: '3200', name: 'Utilidades retenidas', statement: 'BS', kind: 'equity' },
  { code: '3300', name: 'Resultado del ejercicio', statement: 'BS', kind: 'equity' },
];
const ACC = new Map(CATALOG.map((a) => [a.code, a]));

// GTQ per unit. Monthly average and closing.
function rate(ccy: string, month: number, type: 'avg' | 'closing'): number {
  if (ccy === 'GTQ') return 1;
  const base = ccy === 'USD' ? 7.715 : 0.4185;
  const drift = ccy === 'USD' ? 0.0042 : -0.0011;
  const wobble = ccy === 'USD' ? 0.006 : 0.0019;
  const m = month + (type === 'closing' ? 0.5 : 0);
  const v = base + drift * (m - 6) + wobble * Math.sin((m * Math.PI) / 3);
  return Number(v.toFixed(4));
}
const WACC = 0.105;
const TAX = 0.25;

// ------------------------------------------------------------------ companies

type LocalAccount = { code: string; name: string; group: string; share?: number };
type Company = {
  id: string;
  name: string;
  currency: 'GTQ' | 'USD' | 'MXN';
  unit: number; // rounding unit of the amounts the file can carry
  revenue: number; // monthly third-party revenue, local currency
  cogs: number;
  opex: Record<string, number>; // share of revenue per group opex account
  depreciation: number; // per month
  debtST: number;
  debtLT: number;
  rateDebt: number;
  ppe0: number;
  capex: number;
  capital: number;
  retained: number;
  chart: LocalAccount[];
};

const COMPANIES: Company[] = [
  {
    id: 'E1',
    name: 'Empresa 1',
    currency: 'GTQ',
    unit: 1,
    revenue: 4_620_000,
    cogs: 0.58,
    opex: { '6100': 0.092, '6200': 0.041, '6300': 0.021, '6400': 0.028, '6500': 0.031 },
    depreciation: 152_000,
    debtST: 3_200_000,
    debtLT: 14_500_000,
    rateDebt: 0.082,
    ppe0: 31_000_000,
    capex: 120_000,
    capital: 22_000_000,
    retained: 9_400_000,
    chart: [
      { code: '4101', name: 'Ventas nacionales', group: '4000', share: 0.7 },
      { code: '4102', name: 'Ventas de exportación', group: '4000', share: 0.3 },
      { code: '4190', name: 'Ventas a empresas relacionadas', group: '4100' },
      { code: '5101', name: 'Costo de ventas', group: '5000' },
      { code: '5190', name: 'Compras a empresas relacionadas', group: '5100' },
      { code: '6101', name: 'Sueldos y prestaciones', group: '6100' },
      { code: '6201', name: 'Fletes y distribución', group: '6200' },
      { code: '6301', name: 'Arrendamientos', group: '6300' },
      { code: '6401', name: 'Publicidad', group: '6400' },
      { code: '6501', name: 'Servicios profesionales', group: '6500', share: 0.55 },
      { code: '6502', name: 'Otros gastos de administración', group: '6500', share: 0.45 },
      { code: '6901', name: 'Depreciaciones', group: '6900' },
      { code: '7101', name: 'Intereses bancarios', group: '7100' },
      { code: '8101', name: 'Impuesto sobre la renta', group: '8100' },
      { code: '1101', name: 'Caja y bancos', group: '1100' },
      { code: '1201', name: 'Clientes', group: '1200' },
      { code: '1251', name: 'Cuentas por cobrar relacionadas', group: '1250' },
      { code: '1301', name: 'Inventarios', group: '1300' },
      { code: '1501', name: 'Propiedad, planta y equipo neto', group: '1500' },
      { code: '2101', name: 'Proveedores', group: '2100' },
      { code: '2151', name: 'Cuentas por pagar relacionadas', group: '2150' },
      { code: '2201', name: 'ISR por pagar', group: '2200' },
      { code: '2301', name: 'Préstamos bancarios corto plazo', group: '2300' },
      { code: '2501', name: 'Préstamos bancarios largo plazo', group: '2500' },
      { code: '3101', name: 'Capital pagado', group: '3100' },
      { code: '3201', name: 'Utilidades acumuladas', group: '3200' },
      { code: '3301', name: 'Utilidad del ejercicio', group: '3300' },
    ],
  },
  {
    id: 'E2',
    name: 'Empresa 2',
    currency: 'GTQ',
    unit: 1,
    revenue: 3_380_000,
    cogs: 0.61,
    opex: { '6100': 0.087, '6200': 0.052, '6300': 0.018, '6400': 0.022, '6500': 0.027 },
    depreciation: 98_000,
    debtST: 1_800_000,
    debtLT: 8_900_000,
    rateDebt: 0.085,
    ppe0: 19_500_000,
    capex: 80_000,
    capital: 14_000_000,
    retained: 5_100_000,
    chart: [
      { code: '4.1.01', name: 'Ventas de empaque flexible', group: '4000', share: 0.62 },
      { code: '4.1.02', name: 'Ventas de empaque rígido', group: '4000', share: 0.38 },
      { code: '4.1.90', name: 'Ventas intercompañía', group: '4100' },
      { code: '5.1.01', name: 'Costo de producción vendida', group: '5000' },
      { code: '5.1.90', name: 'Compras intercompañía', group: '5100' },
      { code: '6.1.01', name: 'Planilla y prestaciones', group: '6100' },
      { code: '6.2.01', name: 'Transporte y entregas', group: '6200' },
      { code: '6.3.01', name: 'Alquiler de bodegas', group: '6300' },
      { code: '6.4.01', name: 'Mercadeo y promoción', group: '6400' },
      { code: '6.5.01', name: 'Servicios generales', group: '6500' },
      { code: '6.9.01', name: 'Depreciación de activos', group: '6900' },
      { code: '7.1.01', name: 'Intereses sobre préstamos', group: '7100' },
      { code: '8.1.01', name: 'ISR del periodo', group: '8100' },
      { code: '1.1.01', name: 'Bancos', group: '1100' },
      { code: '1.2.01', name: 'Cuentas por cobrar clientes', group: '1200' },
      { code: '1.2.90', name: 'Cuentas por cobrar intercompañía', group: '1250' },
      { code: '1.3.01', name: 'Inventario de materia prima y producto', group: '1300' },
      { code: '1.5.01', name: 'Activo fijo neto', group: '1500' },
      { code: '2.1.01', name: 'Proveedores locales', group: '2100' },
      { code: '2.1.90', name: 'Cuentas por pagar intercompañía', group: '2150' },
      { code: '2.2.01', name: 'Impuestos por pagar', group: '2200' },
      { code: '2.3.01', name: 'Préstamos corto plazo', group: '2300' },
      { code: '2.5.01', name: 'Préstamos largo plazo', group: '2500' },
      { code: '3.1.01', name: 'Capital social', group: '3100' },
      { code: '3.2.01', name: 'Utilidades retenidas', group: '3200' },
      { code: '3.3.01', name: 'Resultado del ejercicio', group: '3300' },
    ],
  },
  {
    id: 'E3',
    name: 'Empresa 3',
    currency: 'USD',
    unit: 1,
    revenue: 418_000,
    cogs: 0.55,
    opex: { '6100': 0.11, '6200': 0.064, '6300': 0.024, '6400': 0.035, '6500': 0.029 },
    depreciation: 9_800,
    debtST: 240_000,
    debtLT: 1_150_000,
    rateDebt: 0.071,
    ppe0: 2_100_000,
    capex: 7_000,
    capital: 1_600_000,
    retained: 620_000,
    chart: [
      { code: '4010', name: 'Product sales', group: '4000', share: 0.84 },
      { code: '4020', name: 'Service revenue', group: '4000', share: 0.16 },
      { code: '4090', name: 'Intercompany sales', group: '4100' },
      { code: '5010', name: 'Cost of goods sold', group: '5000' },
      { code: '5090', name: 'Intercompany purchases', group: '5100' },
      { code: '6010', name: 'Salaries and wages', group: '6100' },
      { code: '6400', name: 'Freight out', group: '6200' },
      { code: '6500', name: 'Rent', group: '6300' },
      { code: '6600', name: 'Marketing', group: '6400' },
      { code: '6700', name: 'Professional fees', group: '6500' },
      { code: '6800', name: 'Depreciation and amortization', group: '6900' },
      { code: '7010', name: 'Interest expense', group: '7100' },
      { code: '8010', name: 'Income tax', group: '8100' },
      { code: '1010', name: 'Cash and equivalents', group: '1100' },
      { code: '1200', name: 'Accounts receivable', group: '1200' },
      { code: '1290', name: 'Intercompany receivables', group: '1250' },
      { code: '1300', name: 'Inventory', group: '1300' },
      { code: '1500', name: 'PP&E, net', group: '1500' },
      { code: '2010', name: 'Accounts payable', group: '2100' },
      { code: '2090', name: 'Intercompany payables', group: '2150' },
      { code: '2200', name: 'Taxes payable', group: '2200' },
      { code: '2300', name: 'Short-term debt', group: '2300' },
      { code: '2500', name: 'Long-term debt', group: '2500' },
      { code: '3010', name: 'Common stock', group: '3100' },
      { code: '3020', name: 'Retained earnings', group: '3200' },
      { code: '3030', name: 'Current year earnings', group: '3300' },
    ],
  },
  {
    id: 'E4',
    name: 'Empresa 4',
    currency: 'USD',
    unit: 100,
    revenue: 291_000,
    cogs: 0.6,
    opex: { '6100': 0.094, '6200': 0.071, '6300': 0.019, '6400': 0.017, '6500': 0.026 },
    depreciation: 7_200,
    debtST: 150_000,
    debtLT: 820_000,
    rateDebt: 0.074,
    ppe0: 1_460_000,
    capex: 5_000,
    capital: 1_050_000,
    retained: 410_000,
    chart: [
      { code: 'R-100', name: 'Freight services revenue', group: '4000' },
      { code: 'R-190', name: 'Related party revenue', group: '4100' },
      { code: 'C-200', name: 'Direct operating costs', group: '5000' },
      { code: 'C-290', name: 'Related party purchases', group: '5100' },
      { code: 'X-310', name: 'Payroll', group: '6100' },
      { code: 'X-320', name: 'Fuel and logistics', group: '6200' },
      { code: 'X-330', name: 'Facility leases', group: '6300' },
      { code: 'X-340', name: 'Sales and marketing', group: '6400' },
      { code: 'X-350', name: 'General and administrative', group: '6500' },
      { code: 'X-390', name: 'Depreciation', group: '6900' },
      { code: 'F-410', name: 'Finance costs', group: '7100' },
      { code: 'T-510', name: 'Income taxes', group: '8100' },
      { code: 'A-110', name: 'Cash', group: '1100' },
      { code: 'A-120', name: 'Trade receivables', group: '1200' },
      { code: 'A-125', name: 'Due from related parties', group: '1250' },
      { code: 'A-130', name: 'Inventories and supplies', group: '1300' },
      { code: 'A-150', name: 'Property and equipment, net', group: '1500' },
      { code: 'L-210', name: 'Trade payables', group: '2100' },
      { code: 'L-215', name: 'Due to related parties', group: '2150' },
      { code: 'L-220', name: 'Income taxes payable', group: '2200' },
      { code: 'L-230', name: 'Current portion of borrowings', group: '2300' },
      { code: 'L-250', name: 'Non-current borrowings', group: '2500' },
      { code: 'Q-310', name: 'Share capital', group: '3100' },
      { code: 'Q-320', name: 'Retained earnings', group: '3200' },
      { code: 'Q-330', name: 'Profit for the year', group: '3300' },
    ],
  },
  {
    id: 'E5',
    name: 'Empresa 5',
    currency: 'MXN',
    unit: 100,
    revenue: 5_640_000,
    cogs: 0.57,
    opex: { '6100': 0.098, '6200': 0.046, '6300': 0.023, '6400': 0.031, '6500': 0.03 },
    depreciation: 182_000,
    debtST: 3_900_000,
    debtLT: 17_600_000,
    rateDebt: 0.112,
    ppe0: 36_500_000,
    capex: 150_000,
    capital: 26_000_000,
    retained: 10_800_000,
    chart: [
      { code: '401-01', name: 'Ventas de mercancía', group: '4000' },
      { code: '401-90', name: 'Ventas a partes relacionadas', group: '4100' },
      { code: '501-01', name: 'Costo de lo vendido', group: '5000' },
      { code: '501-90', name: 'Compras a partes relacionadas', group: '5100' },
      { code: '601-01', name: 'Sueldos y salarios', group: '6100' },
      { code: '602-01', name: 'Fletes', group: '6200' },
      { code: '603-01', name: 'Rentas', group: '6300' },
      { code: '604-01', name: 'Publicidad y propaganda', group: '6400' },
      { code: '605-01', name: 'Honorarios', group: '6500', share: 0.6 },
      { code: '605-02', name: 'Viáticos', group: '6500', share: 0.4 },
      { code: '609-01', name: 'Depreciación', group: '6900' },
      { code: '701-01', name: 'Intereses a cargo', group: '7100' },
      { code: '801-01', name: 'ISR', group: '8100' },
      { code: '101-01', name: 'Bancos', group: '1100' },
      { code: '105-01', name: 'Clientes', group: '1200' },
      { code: '105-90', name: 'Partes relacionadas por cobrar', group: '1250' },
      { code: '115-01', name: 'Inventarios', group: '1300' },
      { code: '120-01', name: 'Activo fijo neto', group: '1500' },
      { code: '201-01', name: 'Proveedores', group: '2100' },
      { code: '201-90', name: 'Partes relacionadas por pagar', group: '2150' },
      { code: '213-01', name: 'Impuestos por pagar', group: '2200' },
      { code: '215-01', name: 'Préstamos bancarios corto plazo', group: '2300' },
      { code: '251-01', name: 'Préstamos bancarios largo plazo', group: '2500' },
      { code: '301-01', name: 'Capital social', group: '3100' },
      { code: '304-01', name: 'Resultados de ejercicios anteriores', group: '3200' },
      { code: '305-01', name: 'Resultado del ejercicio', group: '3300' },
    ],
  },
  {
    id: 'E6',
    name: 'Empresa 6',
    currency: 'MXN',
    unit: 1,
    revenue: 7_380_000,
    cogs: 0.62,
    opex: { '6100': 0.085, '6200': 0.058, '6300': 0.02, '6400': 0.024, '6500': 0.022 },
    depreciation: 205_000,
    debtST: 4_600_000,
    debtLT: 21_000_000,
    rateDebt: 0.109,
    ppe0: 41_000_000,
    capex: 180_000,
    capital: 30_000_000,
    retained: 12_500_000,
    chart: [
      { code: 'V-01', name: 'Ventas mayoreo', group: '4000', share: 0.74 },
      { code: 'V-02', name: 'Ventas menudeo', group: '4000', share: 0.26 },
      { code: 'V-90', name: 'Ventas a filiales', group: '4100' },
      { code: 'O-01', name: 'Costo de mercancía vendida', group: '5000' },
      { code: 'O-90', name: 'Compras a filiales', group: '5100' },
      { code: 'O-20', name: 'Distribución y fletes', group: '6200' },
      { code: 'O-30', name: 'Renta de centros de distribución', group: '6300' },
      { code: 'A-10', name: 'Nómina administrativa', group: '6100' },
      { code: 'A-40', name: 'Mercadotecnia', group: '6400' },
      { code: 'A-50', name: 'Gastos generales', group: '6500' },
      { code: 'A-90', name: 'Depreciación', group: '6900' },
      { code: 'A-70', name: 'Gastos financieros', group: '7100' },
      { code: 'A-80', name: 'Impuestos a la utilidad', group: '8100' },
      { code: 'B-101', name: 'Efectivo y bancos', group: '1100' },
      { code: 'B-105', name: 'Clientes', group: '1200' },
      { code: 'B-106', name: 'Filiales por cobrar', group: '1250' },
      { code: 'B-115', name: 'Inventarios', group: '1300' },
      { code: 'B-120', name: 'Inmuebles, maquinaria y equipo', group: '1500' },
      { code: 'B-201', name: 'Proveedores', group: '2100' },
      { code: 'B-202', name: 'Filiales por pagar', group: '2150' },
      { code: 'B-213', name: 'Impuestos por pagar', group: '2200' },
      { code: 'B-215', name: 'Créditos bancarios corto plazo', group: '2300' },
      { code: 'B-251', name: 'Créditos bancarios largo plazo', group: '2500' },
      { code: 'B-301', name: 'Capital social', group: '3100' },
      { code: 'B-304', name: 'Utilidades acumuladas', group: '3200' },
      { code: 'B-305', name: 'Resultado del ejercicio', group: '3300' },
    ],
  },
];
const CO = new Map(COMPANIES.map((c) => [c.id, c]));

// Intercompany pairs: monthly amount in the seller's currency.
const PAIRS = [
  { id: 'P1', seller: 'E1', buyer: 'E3', amount: 182_000 },
  { id: 'P2', seller: 'E1', buyer: 'E4', amount: 121_500 },
  { id: 'P3', seller: 'E2', buyer: 'E5', amount: 96_400 },
  { id: 'P4', seller: 'E3', buyer: 'E6', amount: 22_300 },
  { id: 'P5', seller: 'E5', buyer: 'E2', amount: 261_000 },
  { id: 'P6', seller: 'E4', buyer: 'E1', amount: 14_200 },
];

// ------------------------------------------------------------------ ledger

type Entry = {
  company: string;
  month: number; // 1..12
  local: string;
  group: string;
  amount: number; // natural sign, local currency
  counterparty?: string;
};

const roundTo = (v: number, unit: number) => Math.round(v / unit) * unit;
const r2 = (v: number) => Math.round(v * 100) / 100;

type Factor = (company: string, group: string) => number;

function buildLedger(factor: Factor, pairFactor: (pair: string) => number): Entry[] {
  const rnd = mulberry32(20270101);
  const out: Entry[] = [];
  const seasonal = (m: number) => 1 + 0.075 * Math.sin(((m - 3) * 2 * Math.PI) / 12);

  // IC amounts per month, both sides, local currencies.
  const ic: { pair: string; seller: string; buyer: string; month: number; s: number; b: number }[] = [];
  for (const p of PAIRS) {
    const seller = CO.get(p.seller)!;
    const buyer = CO.get(p.buyer)!;
    for (let m = 1; m <= 12; m++) {
      const s = roundTo(p.amount * pairFactor(p.id) * (0.96 + 0.08 * rnd()), seller.unit);
      const gtq = s * rate(seller.currency, m, 'avg');
      const b = roundTo(gtq / rate(buyer.currency, m, 'avg'), buyer.unit);
      ic.push({ pair: p.id, seller: p.seller, buyer: p.buyer, month: m, s, b });
    }
  }

  for (const c of COMPANIES) {
    const chartBy = (group: string) => c.chart.filter((a) => a.group === group);
    const push = (m: number, group: string, amount: number, counterparty?: string) => {
      const accounts = chartBy(group);
      let left = amount;
      accounts.forEach((a, i) => {
        const part = i === accounts.length - 1 ? left : roundTo(amount * (a.share ?? 1), c.unit);
        left = r2(left - part);
        out.push({ company: c.id, month: m, local: a.code, group, amount: part, counterparty });
      });
    };
    let cumulative = 0;
    let ppe = c.ppe0;
    for (let m = 1; m <= 12; m++) {
      const noise = () => 0.97 + 0.06 * rnd();
      const rev = roundTo(c.revenue * seasonal(m) * noise() * factor(c.id, '4000'), c.unit);
      const cogs = roundTo(rev * c.cogs * noise() * factor(c.id, '5000'), c.unit);
      push(m, '4000', rev);
      const sales = ic.filter((x) => x.seller === c.id && x.month === m);
      const buys = ic.filter((x) => x.buyer === c.id && x.month === m);
      for (const s of sales) push(m, '4100', s.s, s.buyer);
      push(m, '5000', -cogs);
      for (const b of buys) push(m, '5100', -b.b, b.seller);
      let opexTotal = 0;
      for (const [g, share] of Object.entries(c.opex)) {
        const v = roundTo(rev * share * noise() * factor(c.id, g), c.unit);
        opexTotal += v;
        push(m, g, -v);
      }
      const dep = roundTo(c.depreciation * factor(c.id, '6900'), c.unit);
      push(m, '6900', -dep);
      const interest = roundTo(((c.debtST + c.debtLT) * c.rateDebt) / 12, c.unit);
      push(m, '7100', -interest);
      const icRev = sales.reduce((a, x) => a + x.s, 0);
      const icCost = buys.reduce((a, x) => a + x.b, 0);
      const ebt = rev + icRev - cogs - icCost - opexTotal - dep - interest;
      const tax = roundTo(Math.max(0, ebt) * TAX, c.unit);
      push(m, '8100', -tax);
      const ni = ebt - tax;
      cumulative = r2(cumulative + ni);

      // Balance sheet at month end.
      ppe = r2(ppe + roundTo(c.capex, c.unit) - dep);
      const ar = roundTo(rev * 1.15, c.unit);
      const inv = roundTo(cogs * 1.05, c.unit);
      const ap = roundTo(cogs * 0.78, c.unit);
      const arIc = sales.map((s) => ({ cp: s.buyer, v: s.s }));
      // The buyer owes the same economic amount, translated at closing rates.
      const apIc = buys.map((b) => {
        const seller = CO.get(b.seller)!;
        const v = roundTo(
          (b.s * rate(seller.currency, m, 'closing')) / rate(c.currency, m, 'closing'),
          c.unit,
        );
        return { cp: b.seller, v };
      });
      const liabilities =
        ap + apIc.reduce((a, x) => a + x.v, 0) + tax + c.debtST + c.debtLT + c.capital + c.retained + cumulative;
      const nonCash = ar + arIc.reduce((a, x) => a + x.v, 0) + inv + ppe;
      const cash = r2(liabilities - nonCash);
      if (cash <= 0) throw new Error(`${c.id} month ${m}: cash would be negative (${cash})`);
      push(m, '1100', cash);
      push(m, '1200', ar);
      for (const x of arIc) push(m, '1250', x.v, x.cp);
      push(m, '1300', inv);
      push(m, '1500', ppe);
      push(m, '2100', ap);
      for (const x of apIc) push(m, '2150', x.v, x.cp);
      push(m, '2200', tax);
      push(m, '2300', c.debtST);
      push(m, '2500', c.debtLT);
      push(m, '3100', c.capital);
      push(m, '3200', c.retained);
      push(m, '3300', cumulative);
    }
  }
  return out;
}

// ------------------------------------------------------------------ writers

type Grid = CellValue[][];
type FileOut = { file: string; sheets: { name: string; grid: Grid }[]; csvDelimiter?: string };

const isExpense = (group: string) => ACC.get(group)!.statement === 'PL' && ACC.get(group)!.kind !== 'revenue';
const nameOf = (c: Company, code: string) => c.chart.find((a) => a.code === code)!.name;

/** Counterparty as each company writes it. */
const CP_STYLE: Record<string, (id: string) => string> = {
  E1: (id) => `Empresa ${id.slice(1)}`,
  E2: (id) => `EMP-${id.slice(1)}`,
  E3: (id) => id,
  E4: (id) => `CO-0${id.slice(1)}`,
  E5: (id) => `Empresa ${id.slice(1)}`,
  E6: (id) => `Filial ${id.slice(1)}`,
};

function excelSerial(month: number): number {
  const d = Date.UTC(YEAR, month - 1, 1);
  return Math.round((d - Date.UTC(1899, 11, 30)) / 86400000);
}

/** Merge entries that share account, month and counterparty (split helpers can create two). */
function rowsOf(entries: Entry[], company: string) {
  return entries.filter((e) => e.company === company);
}

function e1(entries: Entry[]): FileOut {
  const c = CO.get('E1')!;
  const grid: Grid = [['Cuenta', 'Descripción', 'Mes', 'Moneda', 'Monto', 'Contraparte']];
  for (const e of rowsOf(entries, 'E1')) {
    grid.push([
      e.local,
      nameOf(c, e.local),
      MONTHS[e.month - 1],
      'GTQ',
      e.amount,
      e.counterparty ? CP_STYLE.E1(e.counterparty) : null,
    ]);
  }
  return { file: 'e1_presupuesto.xlsx', sheets: [{ name: 'Presupuesto', grid }] };
}

const E2_BLOCKS: { label: string; groups: string[] }[] = [
  { label: 'Subtotal ingresos', groups: ['4000', '4100'] },
  { label: 'Subtotal costo de ventas', groups: ['5000', '5100'] },
  { label: 'Subtotal gastos de operación', groups: ['6100', '6200', '6300', '6400', '6500', '6900'] },
  { label: 'Subtotal gastos financieros e impuestos', groups: ['7100', '8100'] },
  { label: 'Subtotal activos', groups: ['1100', '1200', '1250', '1300', '1500'] },
  { label: 'Subtotal pasivos', groups: ['2100', '2150', '2200', '2300', '2500'] },
  { label: 'Subtotal patrimonio', groups: ['3100', '3200', '3300'] },
];

function e2(entries: Entry[]): FileOut {
  const c = CO.get('E2')!;
  const grid: Grid = [
    ['Presupuesto anual 2027. Cifras en quetzales; los gastos se registran en positivo.'],
    [],
    ['Mes', 'Código', 'Cuenta', 'Importe', 'Intercompañía'],
  ];
  const mine = rowsOf(entries, 'E2');
  for (let m = 1; m <= 12; m++) {
    for (const block of E2_BLOCKS) {
      let sub = 0;
      for (const e of mine.filter((x) => x.month === m && block.groups.includes(x.group))) {
        const v = isExpense(e.group) ? -e.amount : e.amount;
        sub = r2(sub + v);
        grid.push([
          ES_MONTHS[m - 1],
          e.local,
          nameOf(c, e.local),
          v,
          e.counterparty ? CP_STYLE.E2(e.counterparty) : null,
        ]);
      }
      grid.push([ES_MONTHS[m - 1], null, block.label, sub, null]);
    }
  }
  return { file: 'e2_presupuesto.xlsx', sheets: [{ name: 'Presupuesto 2027', grid }] };
}

/** One row per account and counterparty, one column per month. */
function wideRows(entries: Entry[], company: string) {
  const keyed = new Map<string, { local: string; group: string; cp?: string; months: number[] }>();
  for (const e of rowsOf(entries, company)) {
    const k = `${e.local}|${e.counterparty ?? ''}`;
    if (!keyed.has(k))
      keyed.set(k, { local: e.local, group: e.group, cp: e.counterparty, months: Array(12).fill(0) });
    keyed.get(k)!.months[e.month - 1] = r2(keyed.get(k)!.months[e.month - 1] + e.amount);
  }
  return [...keyed.values()];
}

function e3(entries: Entry[]): FileOut {
  const c = CO.get('E3')!;
  const grid: Grid = [
    ['Empresa 3 - FY2027 Operating Budget'],
    ['Amounts in USD. Expenses shown as negative values.'],
    ['Acct Code', 'Account Name', 'IC Partner', ...EN_SHORT, 'FY Total'],
  ];
  for (const r of wideRows(entries, 'E3')) {
    const pl = ACC.get(r.group)!.statement === 'PL';
    grid.push([
      r.local,
      nameOf(c, r.local),
      r.cp ? CP_STYLE.E3(r.cp) : null,
      ...r.months,
      pl ? r2(r.months.reduce((a, b) => a + b, 0)) : null,
    ]);
  }
  return { file: 'e3_budget.csv', sheets: [{ name: 'e3_budget', grid }] };
}

const thousandsComma = (v: number) => (v / 1000).toFixed(1).replace('.', ',');

function e4(entries: Entry[]): FileOut {
  const c = CO.get('E4')!;
  const grid: Grid = [
    ['Budget 2027 - USD thousands'],
    ['Account', 'Description', 'Intercompany', ...EN_SHORT],
  ];
  for (const r of wideRows(entries, 'E4')) {
    grid.push([r.local, nameOf(c, r.local), r.cp ? CP_STYLE.E4(r.cp) : null, ...r.months.map(thousandsComma)]);
  }
  return { file: 'e4_budget.csv', sheets: [{ name: 'e4_budget', grid }], csvDelimiter: ';' };
}

function e5(entries: Entry[]): FileOut {
  const c = CO.get('E5')!;
  const grid: Grid = [['Periodo', 'Cuenta', 'Nombre', 'Contraparte', 'Importe (miles MXN)']];
  for (const e of rowsOf(entries, 'E5')) {
    grid.push([
      excelSerial(e.month),
      e.local,
      nameOf(c, e.local),
      e.counterparty ? CP_STYLE.E5(e.counterparty) : null,
      r2(e.amount / 1000),
    ]);
  }
  const tasas: Grid = [['Mes', 'Moneda', 'GTQ por MXN']];
  for (let m = 1; m <= 12; m++) tasas.push([MONTHS[m - 1], 'MXN', rate('MXN', m, 'avg')]);
  return {
    file: 'e5_presupuesto.xlsx',
    sheets: [
      { name: 'Presupuesto', grid },
      { name: 'Tasas', grid: tasas },
    ],
  };
}

const E6_AREAS: { sheet: string; title: string; prefixes: string[] }[] = [
  { sheet: 'Ventas', title: 'Ventas', prefixes: ['V-'] },
  { sheet: 'Operaciones', title: 'Operaciones', prefixes: ['O-'] },
  { sheet: 'Administración', title: 'Administración', prefixes: ['A-'] },
  { sheet: 'Balance', title: 'Balance general', prefixes: ['B-'] },
];

function e6(entries: Entry[], kpis: CompanyKpis): FileOut {
  const c = CO.get('E6')!;
  const rows = wideRows(entries, 'E6');
  const sheets = E6_AREAS.map((area) => {
    const grid: Grid = [
      [`Empresa 6. ${area.title} 2027 (MXN). Gastos en positivo.`],
      ['Cuenta', 'Concepto', 'Contraparte', ...ES_SHORT],
    ];
    for (const r of rows.filter((x) => area.prefixes.some((p) => x.local.startsWith(p)))) {
      const sign = isExpense(r.group) ? -1 : 1;
      grid.push([
        r.local,
        nameOf(c, r.local),
        r.cp ? CP_STYLE.E6(r.cp) : null,
        ...r.months.map((v) => r2(v * sign)),
      ]);
    }
    return { name: area.sheet, grid };
  });
  sheets.push({
    name: 'KPIs',
    grid: [
      ['Indicador', 'Valor', 'Nota'],
      ['ROIC', Number(kpis.roic.toFixed(4)), 'Calculado por finanzas'],
      ['ROCE', Number(kpis.roce.toFixed(4)), 'Calculado por finanzas'],
      ['EVA (MXN)', Math.round(kpis.eva), 'Calculado por finanzas'],
    ],
  });
  return { file: 'e6_presupuesto.xlsx', sheets };
}

// ------------------------------------------------------------------ figures

type CompanyKpis = { ebit: number; nopat: number; capital: number; roic: number; roce: number; eva: number };

function companyKpis(entries: Entry[], company: string): CompanyKpis {
  const mine = rowsOf(entries, company);
  const ebit = mine
    .filter((e) => ['revenue', 'cogs', 'opex'].includes(ACC.get(e.group)!.kind))
    .reduce((a, e) => a + e.amount, 0);
  const dec = mine.filter((e) => e.month === 12);
  const bal = (pred: (a: GroupAccount) => boolean) =>
    dec.filter((e) => pred(ACC.get(e.group)!)).reduce((a, e) => a + e.amount, 0);
  const capital = bal((a) => !!a.debt) + bal((a) => a.kind === 'equity');
  const assets = bal((a) => a.kind === 'asset');
  const currentLiab = bal((a) => a.kind === 'liability' && !!a.current);
  const nopat = ebit * (1 - TAX);
  return {
    ebit,
    nopat,
    capital,
    roic: nopat / capital,
    roce: ebit / (assets - currentLiab),
    eva: nopat - capital * WACC,
  };
}

function consolidate(entries: Entry[]) {
  const pl = new Map<string, number>();
  const bs = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, r2((m.get(k) ?? 0) + v));
  for (const e of entries) {
    const a = ACC.get(e.group)!;
    const ccy = CO.get(e.company)!.currency;
    if (a.statement === 'PL') add(pl, e.group, e.amount * rate(ccy, e.month, 'avg'));
    else if (e.month === 12) add(bs, e.group, e.amount * rate(ccy, 12, 'closing'));
  }
  // Eliminate every intercompany line in full; the residual on the balance goes to equity.
  const icPL = { revenue: pl.get('4100') ?? 0, cost: pl.get('5100') ?? 0 };
  const icBS = { receivable: bs.get('1250') ?? 0, payable: bs.get('2150') ?? 0 };
  pl.set('4100', 0);
  pl.set('5100', 0);
  bs.set('1250', 0);
  bs.set('2150', 0);
  bs.set('3900', r2(icBS.payable - icBS.receivable));
  const sum = (m: Map<string, number>, pred: (a: GroupAccount) => boolean) =>
    r2([...m].filter(([k]) => ACC.has(k) && pred(ACC.get(k)!)).reduce((a, [, v]) => a + v, 0));
  const revenue = sum(pl, (a) => a.kind === 'revenue');
  const cogs = sum(pl, (a) => a.kind === 'cogs');
  const opex = sum(pl, (a) => a.kind === 'opex');
  const ebit = r2(revenue + cogs + opex);
  const assets = sum(bs, (a) => a.kind === 'asset');
  const liabilities = sum(bs, (a) => a.kind === 'liability');
  const equity = r2(sum(bs, (a) => a.kind === 'equity') + (bs.get('3900') ?? 0));
  const debt = sum(bs, (a) => !!a.debt);
  const currentLiab = sum(bs, (a) => a.kind === 'liability' && !!a.current);
  const nopat = ebit * (1 - TAX);
  const capital = r2(debt + equity);
  return {
    currency: 'GTQ',
    period: `FY${YEAR}`,
    note: 'P&L at monthly average rates, balance at December closing rates. Every intercompany line is eliminated in full; the balance residual sits in 3900.',
    pl: Object.fromEntries([...pl].map(([k, v]) => [k, r2(v)])),
    bs: Object.fromEntries([...bs].map(([k, v]) => [k, r2(v)])),
    eliminated: { pl: icPL, bs: icBS },
    totals: {
      revenue,
      cogs,
      grossProfit: r2(revenue + cogs),
      opex,
      ebit,
      assets,
      liabilities,
      equity,
      currentLiabilities: currentLiab,
      debt,
    },
    kpis: {
      taxRate: TAX,
      wacc: WACC,
      nopat: r2(nopat),
      investedCapital: capital,
      roic: nopat / capital,
      roce: ebit / (assets - currentLiab),
      eva: r2(nopat - capital * WACC),
    },
  };
}

// ------------------------------------------------------------------ seeding

type Seeded = {
  rule: string;
  file: string;
  sheet: string;
  row: number;
  column: string;
  correct: CellValue;
  seeded: CellValue;
  effectGTQ: { revenue: number; ebit: number };
  note: string;
};

const colLetter = (i: number) => {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

function findRow(grid: Grid, pred: (r: CellValue[]) => boolean, from = 0): number {
  for (let i = from; i < grid.length; i++) if (pred(grid[i])) return i;
  throw new Error('seed target row not found');
}

function seed(files: Map<string, FileOut>): Seeded[] {
  const out: Seeded[] = [];
  const sheetOf = (f: string, s: string) => files.get(f)!.sheets.find((x) => x.name === s)!;

  // FX_INVERTED: Empresa 5 typed MXN per GTQ in its rate sheet.
  {
    const s = sheetOf('e5_presupuesto.xlsx', 'Tasas');
    const e5 = files.get('e5_presupuesto.xlsx')!.sheets[0].grid;
    let revEffect = 0;
    let ebitEffect = 0;
    for (let i = 1; i < s.grid.length; i++) {
      const good = s.grid[i][2] as number;
      const bad = Number((1 / good).toFixed(4));
      s.grid[i][2] = bad;
      // Effect if each row were converted at the file's own rate instead of the group's.
      for (const r of e5.slice(1)) {
        if (Number(r[0]) !== excelSerial(i)) continue;
        const code = String(r[1]);
        const acc = CO.get('E5')!.chart.find((a) => a.code === code);
        if (!acc) continue;
        const kind = ACC.get(acc.group)!.kind;
        const v = (r[4] as number) * 1000;
        if (kind === 'revenue') revEffect += v * (bad - good);
        if (['revenue', 'cogs', 'opex'].includes(kind)) ebitEffect += v * (bad - good);
      }
    }
    out.push({
      rule: 'FX_INVERTED',
      file: 'e5_presupuesto.xlsx',
      sheet: 'Tasas',
      row: 2,
      column: 'C',
      correct: rate('MXN', 1, 'avg'),
      seeded: s.grid[1][2],
      effectGTQ: { revenue: r2(revEffect), ebit: r2(ebitEffect) },
      note: 'Las 12 tasas de la hoja están invertidas (MXN por GTQ en lugar de GTQ por MXN). Fila 2 es enero.',
    });
  }

  // DUPLICATE_ROW: Empresa 1 repeats an export sale in May.
  {
    const g = sheetOf('e1_presupuesto.xlsx', 'Presupuesto').grid;
    const i = findRow(g, (r) => r[0] === '4102' && r[2] === MONTHS[4]);
    g.splice(i + 1, 0, [...g[i]]);
    out.push({
      rule: 'DUPLICATE_ROW',
      file: 'e1_presupuesto.xlsx',
      sheet: 'Presupuesto',
      row: i + 2,
      column: 'E',
      correct: null,
      seeded: g[i][4],
      effectGTQ: { revenue: g[i][4] as number, ebit: g[i][4] as number },
      note: `La fila ${i + 2} repite exactamente la fila ${i + 1}.`,
    });
  }

  // FX_MISSING: Empresa 1 budgets a software licence in EUR, which the group table lacks.
  {
    const g = sheetOf('e1_presupuesto.xlsx', 'Presupuesto').grid;
    const i = findRow(g, (r) => r[0] === '6501' && r[2] === MONTHS[3]);
    const eur = 18_500;
    const gtqEquivalent = Math.round(eur * 8.62);
    g.splice(i + 1, 0, ['6501', 'Licencia anual de software (proveedor europeo)', MONTHS[3], 'EUR', -eur, null]);
    out.push({
      rule: 'FX_MISSING',
      file: 'e1_presupuesto.xlsx',
      sheet: 'Presupuesto',
      row: i + 2,
      column: 'D',
      correct: 'GTQ',
      seeded: 'EUR',
      effectGTQ: { revenue: 0, ebit: gtqEquivalent },
      note: `En la versión limpia la licencia está en GTQ por -${gtqEquivalent}. Si la fila queda fuera, el EBIT del grupo sube en ese monto.`,
    });
  }

  // SUBTOTAL_MISMATCH: Empresa 2, operating expenses subtotal for July does not add up.
  {
    const g = sheetOf('e2_presupuesto.xlsx', 'Presupuesto 2027').grid;
    const i = findRow(g, (r) => r[0] === ES_MONTHS[6] && r[2] === 'Subtotal gastos de operación');
    const good = g[i][3] as number;
    g[i][3] = r2(good - 12_400);
    out.push({
      rule: 'SUBTOTAL_MISMATCH',
      file: 'e2_presupuesto.xlsx',
      sheet: 'Presupuesto 2027',
      row: i + 1,
      column: 'D',
      correct: good,
      seeded: g[i][3],
      effectGTQ: { revenue: 0, ebit: 0 },
      note: 'El subtotal no suma sus cuentas. No cambia el número del grupo si el motor suma las cuentas y no los subtotales.',
    });
  }

  // SIGN_INVERTED (1 of 2): Empresa 2 records expenses as positive; August marketing is negative.
  {
    const g = sheetOf('e2_presupuesto.xlsx', 'Presupuesto 2027').grid;
    const i = findRow(g, (r) => r[0] === ES_MONTHS[7] && r[1] === '6.4.01');
    const good = g[i][3] as number;
    g[i][3] = -good;
    // Keep the block subtotal consistent with what was typed, the way a formula would.
    const j = findRow(g, (r) => r[1] === null && String(r[2]).startsWith('Subtotal'), i);
    g[j][3] = r2((g[j][3] as number) - 2 * good);
    out.push({
      rule: 'SIGN_INVERTED',
      file: 'e2_presupuesto.xlsx',
      sheet: 'Presupuesto 2027',
      row: i + 1,
      column: 'D',
      correct: good,
      seeded: -good,
      effectGTQ: { revenue: 0, ebit: r2(2 * good) },
      note: 'Gasto de mercadeo con signo negativo en un archivo que registra gastos en positivo.',
    });
  }

  // SIGN_INVERTED (2 of 2): Empresa 3, March freight typed as positive.
  {
    const g = sheetOf('e3_budget.csv', 'e3_budget').grid;
    const i = findRow(g, (r) => r[0] === '6400');
    const col = 3 + 2; // Mar
    const good = g[i][col] as number;
    g[i][col] = -good;
    g[i][15] = r2((g[i][15] as number) - 2 * good);
    out.push({
      rule: 'SIGN_INVERTED',
      file: 'e3_budget.csv',
      sheet: 'e3_budget',
      row: i + 1,
      column: colLetter(col),
      correct: good,
      seeded: -good,
      effectGTQ: { revenue: 0, ebit: r2(-2 * good * rate('USD', 3, 'avg')) },
      note: 'Flete de marzo en positivo; el resto de gastos del archivo es negativo. El total FY se arrastró con el error.',
    });
  }

  // IC_ASYMMETRIC: Empresa 4 booked May's purchase from Empresa 1 at 85 %.
  {
    const g = sheetOf('e4_budget.csv', 'e4_budget').grid;
    const i = findRow(g, (r) => r[0] === 'C-290' && r[2] === CP_STYLE.E4('E1'));
    const col = 3 + 4; // May
    const good = Number(String(g[i][col]).replace(',', '.'));
    const bad = Number((good * 0.85).toFixed(1));
    g[i][col] = bad.toFixed(1).replace('.', ',');
    out.push({
      rule: 'IC_ASYMMETRIC',
      file: 'e4_budget.csv',
      sheet: 'e4_budget',
      row: i + 1,
      column: colLetter(col),
      correct: good.toFixed(1).replace('.', ','),
      seeded: g[i][col],
      effectGTQ: { revenue: 0, ebit: r2((good - bad) * 1000 * rate('USD', 5, 'avg')) },
      note: 'La compra a Empresa 1 de mayo no coincide con la venta que Empresa 1 registró.',
    });
  }

  // BS_UNBALANCED: Empresa 4, June inventories overstated.
  {
    const g = sheetOf('e4_budget.csv', 'e4_budget').grid;
    const i = findRow(g, (r) => r[0] === 'A-130');
    const col = 3 + 5; // Jun
    const good = Number(String(g[i][col]).replace(',', '.'));
    const bad = Number((good + 18.5).toFixed(1));
    g[i][col] = bad.toFixed(1).replace('.', ',');
    out.push({
      rule: 'BS_UNBALANCED',
      file: 'e4_budget.csv',
      sheet: 'e4_budget',
      row: i + 1,
      column: colLetter(col),
      correct: good.toFixed(1).replace('.', ','),
      seeded: g[i][col],
      effectGTQ: { revenue: 0, ebit: 0 },
      note: 'Inventarios de junio 18.5 mil USD por encima: activos ya no igualan pasivos más patrimonio.',
    });
  }

  // IC_MISSING: Empresa 5 never recorded September's purchase from Empresa 2.
  {
    const g = sheetOf('e5_presupuesto.xlsx', 'Presupuesto').grid;
    const i = findRow(
      g,
      (r) => r[1] === '501-90' && r[3] === CP_STYLE.E5('E2') && Number(r[0]) === excelSerial(9),
    );
    const removed = g.splice(i, 1)[0];
    out.push({
      rule: 'IC_MISSING',
      file: 'e5_presupuesto.xlsx',
      sheet: 'Presupuesto',
      row: i + 1,
      column: 'E',
      correct: removed[4],
      seeded: null,
      effectGTQ: { revenue: 0, ebit: r2(-(removed[4] as number) * 1000 * rate('MXN', 9, 'avg')) },
      note: 'Falta la compra de septiembre a Empresa 2; la fila habría estado aquí. La venta sí está en e2_presupuesto.xlsx.',
    });
  }

  // ACCOUNT_UNMAPPED: Empresa 5 posts June travel to 605-09, which its chart does not have.
  {
    const g = sheetOf('e5_presupuesto.xlsx', 'Presupuesto').grid;
    const i = findRow(g, (r) => r[1] === '605-02' && Number(r[0]) === excelSerial(6));
    g[i][1] = '605-09';
    g[i][2] = 'Viáticos y gastos de viaje';
    out.push({
      rule: 'ACCOUNT_UNMAPPED',
      file: 'e5_presupuesto.xlsx',
      sheet: 'Presupuesto',
      row: i + 1,
      column: 'B',
      correct: '605-02',
      seeded: '605-09',
      effectGTQ: { revenue: 0, ebit: r2(-(g[i][4] as number) * 1000 * rate('MXN', 6, 'avg')) },
      note: 'Cuenta inexistente en el plan de Empresa 5. Si la fila queda fuera, el EBIT sube en el monto del gasto.',
    });
  }

  // KPI_MISMATCH: Empresa 6 typed an old ROIC by hand.
  {
    const s = sheetOf('e6_presupuesto.xlsx', 'KPIs');
    const good = s.grid[1][1] as number;
    const bad = Number((good + 0.031).toFixed(4));
    s.grid[1][1] = bad;
    out.push({
      rule: 'KPI_MISMATCH',
      file: 'e6_presupuesto.xlsx',
      sheet: 'KPIs',
      row: 2,
      column: 'B',
      correct: good,
      seeded: bad,
      effectGTQ: { revenue: 0, ebit: 0 },
      note: 'ROIC escrito a mano que no sale de los datos del archivo.',
    });
  }

  return out;
}

// ------------------------------------------------------------------ output

function cloneFile(f: FileOut): FileOut {
  return { ...f, sheets: f.sheets.map((s) => ({ name: s.name, grid: s.grid.map((r) => [...r]) })) };
}

function writeFile(dir: string, f: FileOut) {
  mkdirSync(dir, { recursive: true });
  const p = path.join(dir, f.file);
  if (f.file.endsWith('.csv')) writeFileSync(p, writeCsv(f.sheets[0].grid, f.csvDelimiter ?? ','));
  else writeFileSync(p, writeXlsx(f.sheets.map((s) => ({ name: s.name, rows: s.grid }))));
}

function filesFor(entries: Entry[]): Map<string, FileOut> {
  const k6 = companyKpis(entries, 'E6');
  const list = [e1(entries), e2(entries), e3(entries), e4(entries), e5(entries), e6(entries, k6)];
  return new Map(list.map((f) => [f.file, f]));
}

function supuestos(): Buffer {
  const tasas: Grid = [['Moneda', 'Mes', 'Tipo', 'GTQ por unidad']];
  for (const ccy of ['USD', 'MXN'])
    for (let m = 1; m <= 12; m++) {
      tasas.push([ccy, MONTHS[m - 1], 'Promedio', rate(ccy, m, 'avg')]);
      tasas.push([ccy, MONTHS[m - 1], 'Cierre', rate(ccy, m, 'closing')]);
    }
  const params: Grid = [
    ['Parámetro', 'Valor', 'Nota'],
    ['Moneda del grupo', 'GTQ', 'Quetzal guatemalteco'],
    ['WACC', WACC, 'Costo promedio ponderado de capital, anual'],
    ['Tasa impositiva', TAX, 'Tasa efectiva usada para NOPAT'],
    ['Ejercicio', YEAR, 'Presupuesto de enero a diciembre'],
  ];
  return writeXlsx([
    { name: 'Tasas', rows: tasas },
    { name: 'Parametros', rows: params },
  ]);
}

// ------------------------------------------------------------------ verification

function verify(entries: Entry[], label: string) {
  for (const c of COMPANIES)
    for (let m = 1; m <= 12; m++) {
      const rows = entries.filter((e) => e.company === c.id && e.month === m);
      const side = (k: GroupAccount['kind'][]) =>
        rows.filter((e) => k.includes(ACC.get(e.group)!.kind)).reduce((a, e) => a + e.amount, 0);
      const diff = r2(side(['asset']) - side(['liability', 'equity']));
      if (Math.abs(diff) > 0.005) throw new Error(`${label}: ${c.id} month ${m} unbalanced by ${diff}`);
    }
  // Every IC sale has its purchase, equal in GTQ within one rounding unit of the buyer.
  for (const p of PAIRS)
    for (let m = 1; m <= 12; m++) {
      const s = entries.find((e) => e.company === p.seller && e.group === '4100' && e.counterparty === p.buyer && e.month === m);
      const b = entries.find((e) => e.company === p.buyer && e.group === '5100' && e.counterparty === p.seller && e.month === m);
      if (!s || !b) throw new Error(`${label}: pair ${p.id} month ${m} missing a side`);
      const sg = s.amount * rate(CO.get(p.seller)!.currency, m, 'avg');
      const bg = -b.amount * rate(CO.get(p.buyer)!.currency, m, 'avg');
      const tol = CO.get(p.buyer)!.unit * rate(CO.get(p.buyer)!.currency, m, 'avg');
      if (Math.abs(sg - bg) > tol) throw new Error(`${label}: pair ${p.id} month ${m} off by ${sg - bg}`);
    }
}

// ------------------------------------------------------------------ main

function main() {
  rmSync(ROOT, { recursive: true, force: true });
  const current = buildLedger(
    () => 1,
    () => 1,
  );
  verify(current, 'current');

  // Previous version: every figure 2-6 % off, plus three deliberate large changes.
  const prevRnd = mulberry32(20261001);
  const factors = new Map<string, number>();
  const big: Record<string, number> = { 'E4|6200': 1 / 1.14, 'E1|4000': 1 / 0.91, 'E6|6100': 1 / 1.12 };
  const prevFactor: Factor = (company, group) => {
    const k = `${company}|${group}`;
    if (big[k]) return big[k];
    if (!factors.has(k)) {
      const mag = 0.02 + 0.04 * prevRnd();
      factors.set(k, prevRnd() < 0.5 ? 1 - mag : 1 + mag);
    }
    return factors.get(k)!;
  };
  const previous = buildLedger(prevFactor, (p) => (p === 'P1' ? 0.97 : 1.03));
  verify(previous, 'previous');

  const clean = filesFor(current);
  const seededFiles = new Map([...clean].map(([k, f]) => [k, cloneFile(f)]));
  const seeded = seed(seededFiles);
  const prevFiles = filesFor(previous);

  for (const f of seededFiles.values()) writeFile(ROOT, f);
  for (const f of prevFiles.values()) writeFile(path.join(ROOT, 'anterior'), f);
  for (const f of clean.values()) writeFile(path.join(ROOT, '_truth', 'clean'), f);
  writeFileSync(path.join(ROOT, 'supuestos.xlsx'), supuestos());
  writeFileSync(path.join(ROOT, 'anterior', 'supuestos.xlsx'), supuestos());

  const rules = new Set(seeded.map((s) => s.rule));
  if (seeded.length < 10 || seeded.length > 12) throw new Error(`seeded ${seeded.length} errors, expected 10-12`);
  if (rules.size !== 10) throw new Error(`expected 10 rules seeded, got ${rules.size}`);

  const truth = path.join(ROOT, '_truth');
  writeFileSync(
    path.join(truth, 'answer_key.json'),
    JSON.stringify({ count: seeded.length, errors: seeded }, null, 2),
  );
  writeFileSync(path.join(truth, 'expected_consolidated.json'), JSON.stringify(consolidate(current), null, 2));
  writeFileSync(
    path.join(truth, 'catalogo_grupo.json'),
    JSON.stringify(
      {
        accounts: [...CATALOG, { code: '3900', name: 'Diferencias de conversión y eliminación', statement: 'BS', kind: 'equity' }],
        companies: COMPANIES.map((c) => ({
          id: c.id,
          name: c.name,
          currency: c.currency,
          accountMap: Object.fromEntries(c.chart.map((a) => [a.code, a.group])),
        })),
        pairs: PAIRS,
        companyKpis: Object.fromEntries(COMPANIES.map((c) => [c.id, companyKpis(current, c.id)])),
      },
      null,
      2,
    ),
  );
  writeFileSync(path.join(ROOT, 'README.md'), README);

  // Summary.
  const exp = consolidate(current);
  console.log('Files');
  for (const f of seededFiles.values())
    console.log(`  ${f.file.padEnd(22)} ${f.sheets.map((s) => `${s.name}: ${s.grid.length} filas`).join(' · ')}`);
  console.log('Errors by rule');
  const byRule = new Map<string, number>();
  for (const s of seeded) byRule.set(s.rule, (byRule.get(s.rule) ?? 0) + 1);
  for (const [r, n] of byRule) console.log(`  ${r.padEnd(18)} ${n}`);
  console.log(`Expected consolidated (clean), GTQ`);
  console.log(`  revenue ${exp.totals.revenue.toLocaleString('en-US')}`);
  console.log(`  EBIT    ${exp.totals.ebit.toLocaleString('en-US')}`);
  console.log(`  ROIC ${(exp.kpis.roic * 100).toFixed(2)} %  ROCE ${(exp.kpis.roce * 100).toFixed(2)} %  EVA ${exp.kpis.eva.toLocaleString('en-US')}`);
}

const README = `# Datos del reto: presupuesto ${YEAR} del grupo

Seis empresas del grupo enviaron su presupuesto anual. Cada una usa su propio plan de cuentas y su
propia plantilla, así que los archivos no se parecen entre sí. La moneda del grupo es el quetzal (GTQ).

| Archivo | Empresa | Moneda | Notas de quien lo envió |
| --- | --- | --- | --- |
| e1_presupuesto.xlsx | Empresa 1 | GTQ | Una fila por cuenta y mes. |
| e2_presupuesto.xlsx | Empresa 2 | GTQ | Incluye subtotales por bloque. Gastos en positivo. |
| e3_budget.csv | Empresa 3 | USD | Un mes por columna. Total anual al final. |
| e4_budget.csv | Empresa 4 | USD | Exportado desde su ERP: punto y coma, coma decimal, miles. |
| e5_presupuesto.xlsx | Empresa 5 | MXN | Montos en miles. Trae su propia hoja de tasas. |
| e6_presupuesto.xlsx | Empresa 6 | MXN | Una hoja por área, más el balance y una hoja de indicadores. |
| supuestos.xlsx | Grupo | | Tasas de cambio promedio y de cierre por mes, WACC y tasa impositiva. |

Cada archivo trae estado de resultados y balance mensual. Las operaciones entre empresas del grupo
se identifican por la columna de contraparte de cada archivo.

\`anterior/\` contiene la versión previa del mismo presupuesto, con la misma estructura.
`;

main();
