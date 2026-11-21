/**
 * One block of the Summary: the director's question as the heading, the answer as one plain
 * sentence under it (computed from the run), then the evidence.
 */
import type { ReactNode } from 'react';
import { cx } from '@/components/ui/primitives';

export function Question({
  id,
  question,
  answer,
  aside,
  children,
  className,
}: {
  id: string;
  question: string;
  answer: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cx('flex min-w-0 flex-col card', className)}>
      <header className="flex flex-col gap-1.5 px-5 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h2 id={id} className="m-0 text-base font-semibold">
            {question}
          </h2>
          {aside}
        </div>
        <div className="m-0 max-w-[920px] text-xl leading-snug text-ink">{answer}</div>
      </header>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export const linkClass = 'font-medium underline decoration-control underline-offset-[3px] hover:decoration-ink';

/** Spanish names for the validator's rules, for the lines this screen lists. */
export const RULE_ES: Record<string, string> = {
  FX_MISSING: 'Moneda sin tasa del grupo',
  FX_INVERTED: 'Tasa de cambio invertida',
  BS_UNBALANCED: 'Balance descuadrado',
  SUBTOTAL_MISMATCH: 'Subtotal que no suma',
  DUPLICATE_ROW: 'Fila duplicada',
  SIGN_INVERTED: 'Signo invertido',
  ACCOUNT_UNMAPPED: 'Cuenta sin mapeo',
  IC_ASYMMETRIC: 'Venta entre empresas que no cuadra',
  IC_MISSING: 'Venta entre empresas sin contraparte',
  KPI_MISMATCH: 'Indicador escrito que no coincide',
};

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
