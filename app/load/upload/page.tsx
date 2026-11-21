import type { Metadata } from 'next';
import Link from 'next/link';
import { Panel, TitleRow } from '@/components/ui/primitives';
import { Uploader } from '@/components/upload/Uploader';
import { getPracticeDataset } from '@/lib/server/state';

export const metadata: Metadata = { title: 'Subir archivos · Quórum' };

/** What a budget file must contain, read from the mappings so it never drifts from what the engine reads. */
function requirements() {
  const mappings = getPracticeDataset().mappings;
  const shapes = new Map<
    string,
    { sheet: string; headerRow: number; shape: string; columns: string[]; ext: string; companies: string[] }
  >();
  for (const m of mappings)
    for (const sm of m.sheets) {
      const columns = [...Object.values(sm.columns), ...Object.keys(sm.periodColumns ?? {})].filter(
        (c): c is string => !!c,
      );
      const ext = m.file.split('.').pop() ?? '';
      const key = `${sm.sheet}|${sm.headerRow}|${sm.shape}|${columns.join(',')}|${ext}`;
      const s = shapes.get(key) ?? {
        sheet: sm.sheet,
        headerRow: sm.headerRow,
        shape: sm.shape,
        columns,
        ext,
        companies: [],
      };
      s.companies.push(m.companyName);
      shapes.set(key, s);
    }
  return { shapes: [...shapes.values()], mappings };
}

export default function UploadPage() {
  const { shapes, mappings } = requirements();
  return (
    <>
      <TitleRow
        crumb={
          <>
            <Link href="/load" className="text-muted">
              Configuración
            </Link>{' '}
            / Subir archivos
          </>
        }
        title="Subir archivos"
        sub="Los presupuestos de las empresas y, si quieres, supuestos.xlsx con las tasas del grupo. Cada envío empieza sin decisiones."
      />

      <Panel title="Tus archivos">
        <Uploader />
      </Panel>

      <Panel title="Qué necesita cada archivo">
        <div className="flex flex-col gap-3 text-sm">
          <p className="m-0 text-muted">
            El nombre puede ser cualquiera. Si incluye el código de la empresa (por ejemplo{' '}
            <span className="font-mono text-xs">{mappings[0]?.companyId ?? 'EMP_GT_01'}</span>) se asigna
            solo; si no, la app te pregunta de qué empresa es. Lo que sí tiene que coincidir es el contenido:
          </p>
          {shapes.map((s) => (
            <ul key={`${s.sheet}-${s.columns.join()}`} className="m-0 flex list-disc flex-col gap-1 pl-5">
              <li>
                Un archivo <span className="font-mono text-xs">.{s.ext}</span>
                {s.ext === 'xlsx' && (
                  <>
                    {' '}
                    con una hoja llamada <span className="font-mono text-xs">{s.sheet}</span>
                  </>
                )}
                .
              </li>
              <li>
                Encabezados en la fila {s.headerRow}:{' '}
                {s.columns.map((c, i) => (
                  <span key={c}>
                    {i > 0 && ' · '}
                    <span className="font-mono text-xs">{c}</span>
                  </span>
                ))}
                .
              </li>
              <li>
                {s.shape === 'long'
                  ? 'Una fila por cuenta y mes.'
                  : 'Una fila por cuenta, un mes por columna.'}{' '}
                Las cuentas que no estén en el mapeo aparecen en Configuración como cuenta sin mapeo.
              </li>
              {shapes.length > 1 && <li>Empresas con este formato: {s.companies.join(', ')}.</li>}
            </ul>
          ))}
        </div>
      </Panel>
    </>
  );
}
