/**
 * Data model of the consolidation engine. Pure data: no React, no I/O.
 * Money is carried in cents (integers) once it is in the group currency, so sums close exactly.
 */
import type { CellValue } from './workbook';

export type SourceCell = {
  id: string; // `${file}!${sheet}!${column}${row}`
  file: string;
  sheet: string;
  row: number;
  column: string;
  raw: CellValue;
};

export type SheetMapping = {
  sheet: string;
  headerRow: number;
  shape: 'long' | 'wide';
  /** Header labels of the columns, as they appear in the file. */
  columns: {
    account: string;
    description?: string;
    amount?: string; // long
    period?: string; // long
    counterparty?: string;
    currency?: string; // a per-row currency column, if the file has one
  };
  /** wide: header label → period (YYYY-MM). */
  periodColumns?: Record<string, string>;
  /** wide: header of a per-row annual total the file carries (control total). */
  rowTotalColumn?: string;
  /** long: regex on the description of subtotal rows. A subtotal covers the data rows since the previous one. */
  subtotalPattern?: string;
};

export type SourceMapping = {
  companyId: string;
  companyName: string;
  file: string;
  currency: string;
  scale: 1 | 1000;
  expenseSign: 'negative' | 'positive';
  decimalSeparator?: '.' | ',';
  sheets: SheetMapping[];
  /** local account → group account */
  accountMap: Record<string, string>;
  /** counterparty as the file writes it → company id */
  counterpartyMap: Record<string, string>;
  /** A rate table the company brought with its file (GTQ per unit). */
  fileRates?: { sheet: string; headerRow: number; period: string; rate: string; currency: string };
  /** Indicators typed by hand in the file. */
  reportedKpis?: {
    sheet: string;
    headerRow: number;
    label: string;
    value: string;
    names: Record<string, KpiName>;
  };
  status: 'proposed' | 'approved';
};

export type GroupAccount = {
  code: string;
  name: string;
  statement: 'PL' | 'BS';
  kind: 'revenue' | 'cogs' | 'opex' | 'finance' | 'tax' | 'asset' | 'liability' | 'equity';
  current?: boolean;
  ic?: boolean;
  debt?: boolean;
};

export type Fact = {
  id: string;
  sourceCellId: string;
  rowKey: string; // `${file}!${sheet}!${row}`
  companyId: string;
  period: string; // YYYY-MM
  statement: 'PL' | 'BS' | null; // null while the account has no destination
  localAccount: string;
  localName: string;
  groupAccount: string | null;
  counterpartyId: string | null; // null = third party
  /** The counterparty as the file writes it, when the row names one. */
  counterpartyRaw?: string;
  currency: string;
  /** Natural sign (revenue +, expense −, balances +), already multiplied by the scale. */
  amountLocal: number;
  /** The value as typed in the file, multiplied by the scale (file sign convention). */
  amountAsTyped: number;
  status: 'clean' | 'quarantined';
  /** Finding ids that keep this fact out of the group number. */
  heldBy: string[];
  /** Set when a person corrected the sign. */
  signFixed?: boolean;
};

/** One data row of a source file, with the facts it produced. */
export type SourceRow = {
  key: string;
  companyId: string;
  file: string;
  sheet: string;
  row: number;
  signature: string; // every mapped value, for duplicate detection
  factIds: string[];
};

export type FxRate = {
  currency: string;
  period: string;
  rateType: 'avg' | 'closing';
  rate: number;
  source: string;
};

export type Severity = 'block' | 'quarantine' | 'warning';

export type RuleId =
  | 'FX_MISSING'
  | 'FX_INVERTED'
  | 'BS_UNBALANCED'
  | 'SUBTOTAL_MISMATCH'
  | 'DUPLICATE_ROW'
  | 'SIGN_INVERTED'
  | 'ACCOUNT_UNMAPPED'
  | 'IC_ASYMMETRIC'
  | 'IC_MISSING'
  | 'IC_OUTSIDE'
  | 'KPI_MISMATCH';

export type Place = { file: string; sheet: string; row: number; column?: string };

export type FindingAction =
  | { kind: 'use-group-rate'; label: string }
  | { kind: 'exclude'; label: string }
  | { kind: 'fix-sign'; label: string; factIds: string[] }
  | { kind: 'map-account'; label: string; companyId: string; localAccount: string }
  | { kind: 'none'; label: string };

export type Finding = {
  id: string;
  ruleId: RuleId;
  severity: Severity;
  companyIds: string[];
  places: Place[];
  sourceCellIds: string[];
  factIds: string[];
  expected: string;
  actual: string;
  /** Signed effect on the group number if the error had gone in, in group cents. */
  /** ebit for operating lines; net for what sits below EBIT (financial expense, income tax). */
  groupImpact: { metric: 'revenue' | 'ebit' | 'net' | 'balance' | 'none'; cents: number } | null;
  impactText: string;
  action: FindingAction;
  status: 'open' | 'resolved';
  resolutionText?: string;
};

export type IcMatch = {
  id: string;
  pairId: string; // `${seller}>${buyer}`
  statement: 'PL' | 'BS';
  period: string;
  sellerId: string;
  buyerId: string;
  sellerFactIds: string[];
  buyerFactIds: string[];
  amountSeller: number; // cents, group currency, positive
  amountBuyer: number;
  diff: number; // seller − buyer
  status: 'matched' | 'asymmetric' | 'missing' | 'pending';
};

export type Adjustment = {
  id: string;
  type: 'IC_ELIM' | 'IC_HOLD' | 'IC_RESIDUAL';
  groupAccount: string;
  period: string;
  cents: number;
  icMatchId: string;
  reason: string;
};

export type Contribution = {
  factId: string;
  companyId: string;
  amountLocal: number;
  rate: number;
  cents: number;
};

export type Cell = {
  groupAccount: string;
  period: string;
  cents: number;
  contributions: Contribution[];
  adjustmentIds: string[];
};

export type KpiName = 'ROIC' | 'ROCE' | 'EVA';

export type KpiInput = { label: string; cents?: number; ratio?: number; ref?: string };

export type Kpi = { name: KpiName; value: number; formula: string; inputs: KpiInput[] };

export type Resolutions = {
  /** Finding ids a person resolved with the finding's action. */
  resolved: string[];
  /** Fact ids whose sign a person corrected. */
  signFixes: string[];
  /** companyId → local account → group account, set from the Carga screen. */
  accountOverrides: Record<string, Record<string, string>>;
  /** companyIds whose mapping a person approved. */
  approved: string[];
};

export const NO_RESOLUTIONS: Resolutions = { resolved: [], signFixes: [], accountOverrides: {}, approved: [] };
