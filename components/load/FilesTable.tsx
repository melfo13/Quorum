import { ButtonLink, Pill, cx } from '@/components/ui/primitives';
import type { CompanySummary } from '@/lib/engine/pipeline';
import { int } from '@/lib/format';

const head = 'px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted border-b border-border';
const cell = '@max-4xl/main:p-0 @4xl/main:border-b @4xl/main:border-rule @4xl/main:px-3 @4xl/main:py-2 @4xl/main:align-middle';

/** One row per company file. Below lg each row folds into two lines. */
export function FilesTable({ companies }: { companies: CompanySummary[] }) {
  return (
    <table className="w-full border-collapse @max-4xl/main:block">
      <thead className="@max-4xl/main:hidden">
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
      <tbody className="@max-4xl/main:block">
        {companies.map((c) => (
          <tr
            key={c.id}
            className="@max-4xl/main:grid @max-4xl/main:grid-cols-[minmax(0,1fr)_auto] @max-4xl/main:gap-x-4 @max-4xl/main:gap-y-1 @max-4xl/main:border-b @max-4xl/main:border-rule @max-4xl/main:py-3 @4xl/main:[&:last-child>*]:border-b-0"
          >
            <th scope="row" className={cx(cell, 'text-left font-medium')}>
              {c.name}
            </th>
            <td className={cx(cell, 'font-mono text-xs @max-4xl/main:col-start-1 @max-4xl/main:text-muted')}>{c.file}</td>
            <td className={cx(cell, '@max-4xl/main:col-start-1 @max-4xl/main:text-muted')}>{c.shape}</td>
            <td className={cx(cell, '@max-4xl/main:hidden')}>{c.currency}</td>
            <td className={cx(cell, 'text-right tabular-nums @max-4xl/main:col-start-2 @max-4xl/main:row-start-1')}>
              {c.missing ? <span className="text-muted">—</span> : int(c.rowsRead)}
              <span className="text-muted @4xl/main:hidden"> filas · {c.currency}</span>
            </td>
            <td className={cx(cell, '@max-4xl/main:col-start-2 @max-4xl/main:row-start-2 @max-4xl/main:text-right')}>
              <Pill tone={c.state.tone}>{c.state.text}</Pill>
            </td>
            <td className={cx(cell, '@max-4xl/main:col-start-2 @max-4xl/main:row-start-3 @4xl/main:text-right')}>
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
