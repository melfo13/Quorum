import catalog from '@/config/catalog.json';
import type { GroupAccount } from './types';

export const GROUP_CURRENCY: string = catalog.groupCurrency;
export const ACCOUNTS = catalog.accounts as GroupAccount[];
export const ACCOUNT = new Map(ACCOUNTS.map((a) => [a.code, a]));

export const isOperating = (a: GroupAccount) => a.kind === 'revenue' || a.kind === 'cogs' || a.kind === 'opex';
export const isExpense = (a: GroupAccount) => a.statement === 'PL' && a.kind !== 'revenue';

/** The lines of the income statement, in order. A line sums group accounts or other lines. */
export type PlLine = { id: string; label: string; accounts?: string[]; sumOf?: string[]; total?: boolean };

export const PL_LINES: PlLine[] = [
  { id: '4000', label: 'Ventas', accounts: ['4000'] },
  { id: '4100', label: 'Ventas entre empresas', accounts: ['4100'] },
  { id: 'revenue', label: 'Ingresos', sumOf: ['4000', '4100'], total: true },
  { id: '5000', label: 'Costo de ventas', accounts: ['5000'] },
  { id: '5100', label: 'Compras entre empresas', accounts: ['5100'] },
  { id: 'cogs', label: 'Costo de ventas total', sumOf: ['5000', '5100'], total: true },
  { id: 'gross', label: 'Utilidad bruta', sumOf: ['revenue', 'cogs'], total: true },
  { id: '6100', label: 'Sueldos y prestaciones', accounts: ['6100'] },
  { id: '6200', label: 'Logística y fletes', accounts: ['6200'] },
  { id: '6300', label: 'Arrendamientos', accounts: ['6300'] },
  { id: '6400', label: 'Mercadeo', accounts: ['6400'] },
  { id: '6500', label: 'Servicios y otros gastos', accounts: ['6500'] },
  { id: '6900', label: 'Depreciación', accounts: ['6900'] },
  { id: 'opex', label: 'Gastos operativos', sumOf: ['6100', '6200', '6300', '6400', '6500', '6900'], total: true },
  { id: 'ebit', label: 'EBIT', sumOf: ['gross', 'opex'], total: true },
  { id: '7100', label: 'Gastos financieros', accounts: ['7100'] },
  { id: '8100', label: 'Impuesto sobre la renta', accounts: ['8100'] },
  { id: 'net', label: 'Utilidad neta', sumOf: ['ebit', '7100', '8100'], total: true },
];

/** Every group account a line covers, resolving nested lines. */
export function lineAccounts(id: string): string[] {
  const line = PL_LINES.find((l) => l.id === id);
  if (!line) return ACCOUNT.has(id) ? [id] : [];
  if (line.accounts) return line.accounts;
  return (line.sumOf ?? []).flatMap(lineAccounts);
}
