import Link from 'next/link';
import { PL_LINES } from '@/lib/engine/catalog';
import type { LineFigure } from '@/lib/engine/consolidate';
import { millions } from '@/lib/format';
import { cx } from '@/components/ui/primitives';

export function StatementTable({ pl, selected }: { pl: LineFigure[]; selected: string | null }) {
  const byId = new Map(pl.map((l) => [l.id, l]));
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="ledger min-w-[300px] max-sm:text-[13px] max-sm:[&_td]:!px-1.5 max-sm:[&_th]:!px-1.5 max-sm:[&_th]:!whitespace-normal sm:min-w-[520px]">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 bg-surface">
              Cuenta del grupo
            </th>
            <th scope="col" className="num">
              Suma de empresas
            </th>
            <th scope="col" className="num">
              Eliminaciones
            </th>
            <th scope="col" className="num">
              Consolidado
            </th>
          </tr>
        </thead>
        <tbody>
          {PL_LINES.map((line) => {
            const f = byId.get(line.id);
            if (!f) return null;
            const active = selected === line.id;
            const total = !!line.total;
            return (
              <tr key={line.id}>
                <th
                  scope="row"
                  className={cx(
                    'sticky left-0 bg-surface !py-1.5 !align-middle',
                    total ? 'font-semibold' : 'font-normal',
                    !total && line.id.length === 4 && 'pl-6',
                  )}
                >
                  {line.label}
                </th>
                <td className={cx('num !py-1.5 !align-middle', total && 'font-semibold')}>{millions(f.companies)}</td>
                <td className={cx('num !py-1.5 !align-middle', f.eliminations === 0 && 'text-muted')}>
                  {f.eliminations > 0 ? '+' : ''}
                  {millions(f.eliminations)}
                </td>
                <td className="num !px-1 !py-1 !align-middle">
                  <Link
                    href={`/consolidated?line=${line.id}`}
                    scroll={false}
                    aria-current={active ? 'true' : undefined}
                    aria-label={`${line.label}, consolidado ${millions(f.consolidated)} millones. Abrir los registros que la forman.`}
                    className={cx(
                      'inline-flex h-8 items-center rounded-[6px] border px-2 tabular-nums no-underline transition-colors',
                      active
                        ? 'border-ink bg-neu-bg'
                        : 'border-transparent underline decoration-dotted underline-offset-[3px] hover:border-control hover:bg-raised',
                      total && 'font-semibold',
                    )}
                  >
                    {millions(f.consolidated)}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
