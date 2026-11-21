/**
 * The product's signature element: the source row a figure came from, drawn as the file looks,
 * with the originating cell outlined in the data hue. Used on Load (a finding), Mapping (how a
 * cell lands) and Consolidated (the audit panel).
 */
import type { Excerpt } from '@/lib/server/excerpt';
import { cx } from './primitives';

export function SourceExcerpt({ excerpt, maxColumns = 8, className }: { excerpt: Excerpt; maxColumns?: number; className?: string }) {
  // Keep the marked columns in view: show the first columns, plus any marked one past the cut.
  const marked = new Set(excerpt.rows.flatMap((r) => r.marked));
  const visible = excerpt.columns
    .map((c, i) => ({ ...c, i }))
    .filter((c) => c.i < maxColumns || marked.has(c.i));
  const target = excerpt.rows.find((r) => r.isTarget);
  const cellRef = target && target.marked.length ? `${excerpt.columns[target.marked[0]]?.letter ?? ''}${target.row}` : null;
  const gaps = new Set<number>();
  visible.forEach((c, k) => {
    if (k > 0 && c.i !== visible[k - 1].i + 1) gaps.add(c.i);
  });

  return (
    <figure className={cx('m-0 flex min-w-0 flex-col gap-1.5', className)}>
      <div className="overflow-x-auto rounded-[10px] border border-border">
        <table className="w-full border-collapse text-xs" aria-label={`Origen: ${excerpt.origin}`}>
          <thead>
            <tr className="bg-raised">
              <th scope="col" className="w-10 border-b border-r border-border px-2 py-1 text-right font-normal text-muted">
                <span className="sr-only">Fila</span>
              </th>
              {visible.map((c) => (
                <th
                  key={c.i}
                  scope="col"
                  className={cx(
                    'border-b border-r border-border px-2 py-1 text-left font-medium text-muted last:border-r-0',
                    gaps.has(c.i) && 'border-l-2 border-l-control',
                    marked.has(c.i) && 'border-b-2 border-b-accent',
                  )}
                >
                  <span className={cx('block', marked.has(c.i) ? 'font-semibold text-accent' : 'font-normal text-faint')}>{c.letter}</span>
                  <span className="block max-w-[140px] truncate text-ink">{c.label || ' '}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {excerpt.rows.map((r) => (
              <tr key={r.row} className={r.isTarget ? 'bg-surface' : 'bg-surface text-muted'}>
                <th
                  scope="row"
                  className={cx(
                    'border-r border-border px-2 py-1.5 text-right font-mono',
                    r.isTarget ? 'border-r-2 border-r-accent font-semibold text-accent' : 'font-normal text-faint',
                  )}
                >
                  {r.row}
                </th>
                {visible.map((c) => {
                  const hit = r.marked.includes(c.i);
                  const v = r.cells[c.i];
                  const numeric = v !== '' && !Number.isNaN(Number(v.replace(',', '.')));
                  return (
                    <td
                      key={c.i}
                      className={cx(
                        'max-w-[160px] truncate border-r border-rule px-2 py-1.5 last:border-r-0',
                        numeric && 'text-right tabular-nums',
                        gaps.has(c.i) && 'border-l-2 border-l-control',
                        hit && 'pg-cell-pulse bg-accent-tint font-semibold text-ink outline-2 -outline-offset-2 outline-accent',
                      )}
                    >
                      {v || <span className="text-faint">·</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {cellRef && (
          <span className="rounded-[4px] bg-accent-tint px-1.5 py-0.5 font-mono font-semibold text-accent">Celda {cellRef}</span>
        )}
        <span className="font-mono">{excerpt.origin}</span>
      </figcaption>
    </figure>
  );
}
