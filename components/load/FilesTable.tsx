import { ButtonLink, Pill, cx } from '@/components/ui/primitives';
import type { CompanySummary } from '@/lib/engine/pipeline';
import { int } from '@/lib/format';

const head = 'px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted border-b border-border';
const cell = 'max-lg:p-0 lg:border-b lg:border-rule lg:px-3 lg:py-2 lg:align-middle';

/** One row per company file. Below lg each row folds into two lines. */
export function FilesTable({ companies }: { companies: CompanySummary[] }) {
  return (
    <table className="w-full border-collapse max-lg:block">
      <thead className="max-lg:hidden">
        <tr>
          <th scope="col" className={head}>
            Empresa
          </th>
          <th scope="col" className={head}>
            Archivo
          </th>
          <th scope="col" className={head}>
            Formato detectado
          </th>
          <th scope="col" className={head}>
            Moneda
          </th>
          <th scope="col" className={cx(head, 'text-right')}>
            Filas
          </th>
          <th scope="col" className={head}>
            Estado
          </th>
          <th scope="col" className={cx(head, 'text-right')}>
            Mapeo
          </th>
        </tr>
      </thead>
      <tbody className="max-lg:block">
        {companies.map((c) => (
          <tr
            key={c.id}
            className="max-lg:grid max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-x-4 max-lg:gap-y-1 max-lg:border-b max-lg:border-rule max-lg:py-3 lg:[&:last-child>*]:border-b-0"
          >
            <th scope="row" className={cx(cell, 'text-left font-medium')}>
              {c.name}
            </th>
            <td className={cx(cell, 'font-mono text-xs max-lg:col-start-1 max-lg:text-muted')}>{c.file}</td>
            <td className={cx(cell, 'max-lg:col-start-1 max-lg:text-muted')}>{c.shape}</td>
            <td className={cx(cell, 'max-lg:hidden')}>{c.currency}</td>
            <td className={cx(cell, 'text-right tabular-nums max-lg:col-start-2 max-lg:row-start-1')}>
              {c.missing ? <span className="text-muted">—</span> : int(c.rowsRead)}
              <span className="text-muted lg:hidden"> filas · {c.currency}</span>
            </td>
            <td className={cx(cell, 'max-lg:col-start-2 max-lg:row-start-2 max-lg:text-right')}>
              <Pill tone={c.state.tone}>{c.state.text}</Pill>
            </td>
            <td className={cx(cell, 'max-lg:col-start-2 max-lg:row-start-3 lg:text-right')}>
              <div className="flex items-center justify-end gap-3">
                <span className="text-xs text-muted">{c.mappingStatus === 'approved' ? 'Aprobado' : 'Propuesto'}</span>
                <ButtonLink href={`/load/${c.id}/mapping`} size="sm">
                  Ver mapeo
                </ButtonLink>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
