/**
 * What every screen shows before any file is loaded: the screen keeps its title, and the one thing to
 * do is upload the budgets. The bundled example data is a quiet fallback for a demo.
 */
import { loadSampleData } from '@/app/actions';
import { ButtonLink, TitleRow, buttonClass } from './primitives';

export function EmptyState({ title, question }: { title: string; question: string }) {
  return (
    <>
      <TitleRow title={title} sub={question} />
      <section
        aria-label="Sin datos"
        className="flex flex-col items-start gap-4 rounded-[16px] border border-dashed border-control bg-surface px-6 py-10 sm:px-10"
      >
        <h2 className="m-0 text-lg font-semibold">Todavía no hay presupuestos cargados</h2>
        <p className="m-0 max-w-[620px] text-muted">
          Sube los seis presupuestos de las empresas del grupo. La app los lee tal como llegan, frena los errores antes
          de que entren al número del grupo y consolida en quetzales.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href="/load/upload" variant="primary">
            Subir archivos
          </ButtonLink>
          <form action={loadSampleData}>
            <button type="submit" className={`${buttonClass('secondary')} cursor-pointer`}>
              Usar datos de ejemplo
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
