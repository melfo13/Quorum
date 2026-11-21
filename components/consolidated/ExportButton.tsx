import { buttonClass } from '@/components/ui/primitives';

/** A plain download link: the route builds the workbook on the server from the visitor's own state. */
export function ExportButton() {
  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-xs text-muted lg:inline">Cada cifra con su archivo, fila y celda</span>
      <a href="/api/export" download className={buttonClass('secondary')}>
        Descargar Excel con rastro
      </a>
    </div>
  );
}
