/**
 * A 132px ring with a 5px stroke and its figure in the centre. `fill` is the true ratio (0-1);
 * `mark` draws a tick at a fraction of the track (the WACC on the value ring). `empty` draws the
 * dashed ring of a signal with no base yet.
 */
import type { ReactNode } from 'react';

const SIZE = 132;
const R = 62;
const C = 2 * Math.PI * R;

export function Ring({
  fill = 0,
  mark,
  empty,
  label,
  value,
  caption,
  tone = 'ink',
}: {
  fill?: number;
  mark?: number;
  empty?: boolean;
  label: string;
  value?: ReactNode;
  caption?: ReactNode;
  tone?: 'ink' | 'accent';
}) {
  const f = Math.max(0, Math.min(1, fill));
  const stroke = tone === 'accent' ? 'var(--accent)' : 'var(--brand)';
  const angle = mark !== undefined ? mark * 2 * Math.PI - Math.PI / 2 : 0;
  const at = (r: number) => ({ x: SIZE / 2 + r * Math.cos(angle), y: SIZE / 2 + r * Math.sin(angle) });
  return (
    <div className="grid h-[132px] w-[132px] flex-none place-items-center">
      <svg role="img" aria-label={label} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="[grid-area:1/1]">
        {empty ? (
          <circle cx={66} cy={66} r={R} fill="none" stroke="var(--bar-muted)" strokeWidth={5} strokeDasharray="3 7" />
        ) : (
          <>
            <circle cx={66} cy={66} r={R} fill="none" stroke="var(--track)" strokeWidth={5} />
            {f > 0 && (
              <circle
                cx={66}
                cy={66}
                r={R}
                fill="none"
                stroke={stroke}
                strokeWidth={5}
                strokeDasharray={`${(f * C).toFixed(1)} ${C.toFixed(1)}`}
                transform="rotate(-90 66 66)"
              />
            )}
            {mark !== undefined && (
              <line x1={at(R - 11).x} y1={at(R - 11).y} x2={at(R + 3).x} y2={at(R + 3).y} stroke="var(--text)" strokeWidth={2} />
            )}
          </>
        )}
      </svg>
      <div className="flex flex-col items-center gap-0.5 text-center [grid-area:1/1]">
        {value !== undefined && <div className="text-[26px] leading-tight">{value}</div>}
        {caption && <div className="text-xs text-muted">{caption}</div>}
      </div>
    </div>
  );
}
