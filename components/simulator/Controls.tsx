'use client';

/**
 * Scenario controls. The values live in the URL (?usd=5&mxn=-3&wacc=12) so a scenario can be
 * linked and the server recomputes it with the same engine. Updates are debounced.
 */
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { cx } from '@/components/ui/primitives';

export type ControlValues = { usd: number; mxn: number; wacc: number };

function Slider({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <output htmlFor={id} className="text-base font-semibold tabular-nums">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-[var(--accent)] sm:h-8"
        aria-describedby={`${id}-hint`}
      />
      <div id={`${id}-hint`} className="flex justify-between text-xs text-muted tabular-nums">
        <span>{format(min)}</span>
        <span className="text-center">{hint}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} %`;

export function Controls({ initial, baseWacc }: { initial: ControlValues; baseWacc: number }) {
  const router = useRouter();
  const path = usePathname();
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const q = new URLSearchParams();
      if (v.usd) q.set('usd', String(v.usd));
      if (v.mxn) q.set('mxn', String(v.mxn));
      if (v.wacc !== baseWacc) q.set('wacc', String(v.wacc));
      const s = q.toString();
      start(() => router.replace(s ? `${path}?${s}` : path, { scroll: false }));
    }, 150);
    return () => clearTimeout(t);
  }, [v, baseWacc, path, router]);

  const changed = v.usd !== 0 || v.mxn !== 0 || v.wacc !== baseWacc;

  return (
    <section
      aria-label="Supuestos del escenario"
      className="flex flex-col gap-4 rounded-[8px] border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="m-0 text-base font-semibold">Supuestos del escenario</h2>
        <div className="ml-auto flex items-center gap-3">
          <span
            className={cx('text-xs text-muted transition-opacity', pending ? 'opacity-100' : 'opacity-0')}
            aria-live="polite"
          >
            Recalculando…
          </span>
          <button
            type="button"
            disabled={!changed}
            onClick={() => setV({ usd: 0, mxn: 0, wacc: baseWacc })}
            className="inline-flex h-11 cursor-pointer items-center rounded-[6px] border border-control bg-surface px-3 font-medium hover:bg-raised disabled:cursor-not-allowed disabled:border-border disabled:text-muted sm:h-8"
          >
            Restablecer
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Slider
          id="sim-usd"
          label="Quetzal vs USD"
          hint="+5 % = el quetzal se debilita"
          value={v.usd}
          min={-15}
          max={15}
          step={1}
          format={signed}
          onChange={(usd) => setV((x) => ({ ...x, usd }))}
        />
        <Slider
          id="sim-mxn"
          label="Quetzal vs MXN"
          hint="+5 % = el quetzal se debilita"
          value={v.mxn}
          min={-15}
          max={15}
          step={1}
          format={signed}
          onChange={(mxn) => setV((x) => ({ ...x, mxn }))}
        />
        <Slider
          id="sim-wacc"
          label="WACC"
          hint={`Base ${baseWacc.toFixed(1)} %`}
          value={v.wacc}
          min={6}
          max={16}
          step={0.5}
          format={(x) => `${x.toFixed(1)} %`}
          onChange={(wacc) => setV((x) => ({ ...x, wacc }))}
        />
      </div>
    </section>
  );
}
