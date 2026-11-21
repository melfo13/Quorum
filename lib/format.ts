/** Number formatting shared by the engine's sentences and the screens. */

const nf = (min: number, max = min) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
const n0 = nf(0);
const n1 = nf(1);
const n2 = nf(2);

export const CURRENCY_SIGN: Record<string, string> = { GTQ: 'Q', USD: 'USD', MXN: 'MXN', EUR: 'EUR' };

/** Currency names for sentences ("el quetzal se debilita frente al colón"). Unknown codes show as the code. */
export const CURRENCY_NAME: Record<string, string> = {
  GTQ: 'quetzal',
  CRC: 'colón',
  USD: 'dólar',
  MXN: 'peso mexicano',
  EUR: 'euro',
  HNL: 'lempira',
  NIO: 'córdoba',
  PAB: 'balboa',
  DOP: 'peso dominicano',
};
export const currencyName = (code: string) => CURRENCY_NAME[code] ?? code;

/** "Q 12.3 M", "Q 15,000", "−Q 0.4 M". Cents in, group currency. */
export function money(cents: number, opts: { currency?: string; compact?: boolean; sign?: boolean } = {}) {
  const { currency = 'GTQ', compact = true, sign = false } = opts;
  const v = cents / 100;
  const abs = Math.abs(v);
  const s = CURRENCY_SIGN[currency] ?? currency;
  // Non-breaking spaces: a figure never splits across two lines ("−Q 9.5 M").
  const body = compact && abs >= 1_000_000 ? `${n1.format(abs / 1_000_000)}\u00a0M` : n0.format(abs);
  const prefix = v < 0 ? '−' : sign && v > 0 ? '+' : '';
  return `${prefix}${s}\u00a0${body}`;
}

/** A local amount (not cents), e.g. "USD 512,400". */
export function local(amount: number, currency: string, opts: { compact?: boolean } = {}) {
  return money(Math.round(amount * 100), { currency, compact: opts.compact ?? false });
}

/** Millions with one decimal, for statement columns: "203.8", "−124.4". */
export function millions(cents: number) {
  const v = cents / 100 / 1_000_000;
  if (Math.abs(v) < 0.05) return '0.0';
  return `${v < 0 ? '−' : ''}${n1.format(Math.abs(v))}`;
}

/** Thousands with no decimals: "203,812". */
export function thousands(cents: number) {
  const v = Math.round(cents / 100 / 1000);
  if (v === 0) return '0';
  return `${v < 0 ? '−' : ''}${n0.format(Math.abs(v))}`;
}

export const pct = (ratio: number, digits = 1) => `${(ratio * 100).toFixed(digits)} %`;
export const points = (ratio: number) => `${ratio >= 0 ? '+' : '−'}${Math.abs(ratio * 100).toFixed(1)} pts`;
export const int = (n: number) => n0.format(n);
export const rate = (r: number) => (r >= 1 ? n2.format(r) : r.toFixed(4));

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthName = (period: string) => MONTHS[Number(period.slice(5, 7)) - 1] ?? period;
