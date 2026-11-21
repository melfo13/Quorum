import type { Metadata } from 'next';
import Link from 'next/link';
import { Panel, TitleRow } from '@/components/ui/primitives';
import { Uploader } from '@/components/upload/Uploader';

export const metadata: Metadata = { title: 'Subir archivos · PulseGroup' };

export default function UploadPage() {
  return (
    <>
      <TitleRow
        crumb={
          <>
            <Link href="/load" className="text-muted">
              Carga
            </Link>{' '}
            / Subir archivos
          </>
        }
        title="Subir archivos"
        sub="Los seis presupuestos y, si quieres, supuestos.xlsx con las tasas del grupo. Cada envío empieza sin decisiones."
      />

      <Panel title="Tus archivos">
        <Uploader />
      </Panel>
    </>
  );
}
