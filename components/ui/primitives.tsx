/**
 * Shared primitives. Flat, bordered, no shadows, no gradients. Controls are 32-36px with a 6px radius;
 * cards are white on the ground with an 8px radius and a 1px border.
 */
import Link from 'next/link';
import { CountUp } from './CountUp';
import type { ComponentProps, ReactNode } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export type Tone = 'positive' | 'negative' | 'neutral' | 'warning' | 'accent' | 'blue' | 'yellow' | 'lilac';

const PILL: Record<Tone, string> = {
  positive: 'bg-pos-bg text-pos-ink',
  negative: 'bg-neg-bg text-neg-ink',
  neutral: 'bg-neu-bg text-ink',
  warning: 'bg-warn-bg text-warn-ink ring-1 ring-inset ring-warn-border',
  accent: 'bg-accent-tint text-accent',
  // Pastel category chips: one per category, never for status.
  blue: 'bg-chip-blue text-ink',
  yellow: 'bg-chip-yellow text-ink',
  lilac: 'bg-chip-lilac text-ink',
};

export function Pill({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex flex-none items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        PILL[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  title,
  aside,
  children,
  className,
  id,
  label,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  label?: string;
}) {
  return (
    <section
      id={id}
      aria-label={label ?? (typeof title === 'string' ? title : undefined)}
      className={cx('flex min-w-0 flex-col gap-3 card p-5', className)}
    >
      {(title || aside) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          {title && <h2 className="m-0 text-base font-semibold">{title}</h2>}
          {aside && <div className="text-muted">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const BTN = {
  primary: 'bg-primary text-white hover:bg-[#243246] border border-primary',
  secondary: 'bg-surface text-ink border border-control hover:border-[#9aa0a6] hover:bg-raised',
  ghost: 'bg-transparent text-ink border border-transparent hover:bg-raised',
};
const SIZE = { md: 'h-9 px-4', sm: 'h-8 px-2.5' };

export function buttonClass(variant: keyof typeof BTN = 'secondary', size: keyof typeof SIZE = 'md') {
  return cx(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium no-underline transition-colors duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:border-border disabled:bg-raised disabled:text-muted',
    BTN[variant],
    SIZE[size],
  );
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: ComponentProps<'button'> & { variant?: keyof typeof BTN; size?: keyof typeof SIZE }) {
  return <button type="button" className={cx(buttonClass(variant, size), 'cursor-pointer', className)} {...rest} />;
}

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: keyof typeof BTN; size?: keyof typeof SIZE }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...rest} />;
}

/** Page title row: a noun title at 24px, one grey sentence under it, actions on the right. */
export function TitleRow({ title, sub, actions, crumb }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumb?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 flex-col gap-1">
        {crumb && <div className="text-muted">{crumb}</div>}
        <h1 className="m-0 text-2xl font-semibold leading-tight tracking-[-0.01em]">{title}</h1>
        {sub && <p className="m-0 max-w-[760px] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** One container split by 1px dividers into equal columns. KPIs are type, not tiles. */
export function Strip({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section
      aria-label={label}
      className={cx(
        'grid grid-cols-1 divide-y divide-border card sm:auto-cols-fr sm:grid-flow-col sm:divide-x sm:divide-y-0',
        className,
      )}
    >
      {children}
    </section>
  );
}

/** File names and row references: the only place Geist Mono appears. */
export function Ref({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-mono text-xs', className)}>{children}</span>;
}

/**
 * A big figure in the metric pattern: the number huge, its currency and scale small and grey beside it
 * ("Q 173.2 M" → Q · 173.2 · M; "10.2 %" → 10.2 · %). Anything else shows as written.
 */
export function MetricValue({ text, className }: { text: string; className?: string }) {
  const t = text.replace(/\u00a0/g, ' ').trim();
  const unit = 'ml-1 text-[0.42em] font-medium tracking-normal text-muted';
  const money = t.match(/^([−-]?)(Q|GTQ|USD|CRC|MXN|EUR|HNL)\s([\d.,]+)(?:\s(M))?$/);
  if (money)
    return (
      <span className={cx('figure inline-flex items-baseline whitespace-nowrap', className)}>
        <span className={cx(unit, 'ml-0 mr-1')}>{money[2]}</span>
        <span>
          {money[1]}
          <CountUp text={money[3]} />
        </span>
        {money[4] && <span className={unit}>{money[4]}</span>}
      </span>
    );
  const ratio = t.match(/^([−-]?[\d.,]+)\s?%$/);
  if (ratio)
    return (
      <span className={cx('figure inline-flex items-baseline whitespace-nowrap', className)}>
        <span>
          {ratio[1].startsWith('-') || ratio[1].startsWith('−') ? ratio[1][0] : ''}
          <CountUp text={ratio[1].replace(/^[−-]/, '')} />
        </span>
        <span className={unit}>%</span>
      </span>
    );
  return <span className={cx('figure', className)}>{text}</span>;
}
