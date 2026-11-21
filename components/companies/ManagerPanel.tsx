/**
 * "¿Qué tiene que corregir Empresa X?": the company's open findings as tasks for its manager, the
 * quality of its delivery, and what it brings to the group number.
 */
import Link from 'next/link';
import { Pill, buttonClass, cx } from '@/components/ui/primitives';
import { int, money, pct } from '@/lib/format';
import type { CompanyValue, GroupValue } from './model';
import { taskOf } from './model';

const SEVERITY: Record<string, { tone: 'negative' | 'neutral' | 'warning'; text: string }> = {
  block: { tone: 'negative', text: 'Bloqueo' },
  quarantine: { tone: 'negative', text: 'Cuarentena' },
  warning: { tone: 'neutral', text: 'Aviso' },
};

function Line({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule py-2 last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className={cx('text-right tabular-nums', strong && 'font-semibold')}>{children}</span>
    </div>
  );
}

export function Switcher({ g, selected }: { g: GroupValue; selected: string }) {
  return (
    <nav aria-label="Empresa" className="flex flex-wrap gap-1.5">
      {g.companies.map((c) => {
        const on = c.id === selected;
        return (
          <Link
            key={c.id}
            href={`/companies?empresa=${c.id}`}
            scroll={false}
            aria-current={on ? 'page' : undefined}
            className={cx(
              'inline-flex h-8 items-center gap-1.5 rounded-[6px] border px-2.5 font-medium no-underline transition-colors',
              on ? 'border-ink bg-ink !text-white' : 'border-control bg-surface text-ink hover:bg-raised',
            )}
          >
            {c.name}
            {c.openFindings.length > 0 && (
              <span className={cx('text-xs tabular-nums', on ? 'text-white/80' : 'text-muted')}>{c.openFindings.length}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function ManagerPanel({ c, name }: { c: CompanyValue; name: (id: string) => string }) {
  const tasks = [...c.openFindings].sort(
    (a, b) => ['block', 'quarantine', 'warning'].indexOf(a.severity) - ['block', 'quarantine', 'warning'].indexOf(b.severity),
  );
  const cleanShare = c.rowsRead ? c.rowsClean / c.rowsRead : 0;
  const answer = tasks.length
    ? `${tasks.length} ${tasks.length === 1 ? 'tarea abierta' : 'tareas abiertas'} antes de que su archivo entre completo al número del grupo.`
    : 'Nada pendiente: su archivo entra completo al número del grupo.';
  return (
    <section aria-labelledby="q-corregir" className="flex min-w-0 flex-col rounded-[8px] border border-border bg-surface">
      <header className="flex flex-col gap-1.5 px-5 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h2 id="q-corregir" className="m-0 text-base font-semibold">
            ¿Qué tiene que corregir {c.name}?
          </h2>
          <Pill tone={c.delivery.tone}>{c.delivery.text}</Pill>
        </div>
        <p className="m-0 max-w-[920px] text-xl leading-snug">{answer}</p>
      </header>
      <div className="grid grid-cols-1 gap-6 px-5 pb-5 pt-5 sm:px-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col">
          <div className="pb-1 text-xs text-muted">Tareas, de la más urgente a la menos</div>
          {tasks.length ? (
            <ol className="m-0 flex list-none flex-col p-0">
              {tasks.map((f) => {
                const t = taskOf(f, c, name);
                const sev = SEVERITY[f.severity];
                return (
                  <li key={f.id} className="flex flex-col gap-1 border-b border-rule py-3 last:border-b-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <Link
                        href={`/load#${encodeURIComponent(f.id)}`}
                        className="min-w-0 font-medium underline decoration-control underline-offset-[3px] hover:decoration-ink"
                      >
                        {t.title}
                      </Link>
                      <Pill tone={sev.tone}>{sev.text}</Pill>
                    </div>
                    <p className="m-0 text-muted">{t.detail}</p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="rounded-[8px] border border-dashed border-control px-4 py-3 text-muted">
              Sin hallazgos abiertos. {c.resolvedFindings.length ? `${c.resolvedFindings.length} ya resueltos en Carga.` : ''}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col">
            <div className="pb-1 text-xs text-muted">Calidad de la entrega</div>
            <Line label="Filas leídas">{int(c.rowsRead)}</Line>
            <Line label="Filas limpias" strong>
              {int(c.rowsClean)} · {pct(cleanShare)}
            </Line>
            <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--track)]" aria-hidden="true">
              <div className="h-1.5 rounded-full bg-ink" style={{ width: `${cleanShare * 100}%` }} />
            </div>
          </div>
          <div className="flex flex-col">
            <div className="pb-1 text-xs text-muted">Aporte al grupo, en GTQ</div>
            {c.held ? (
              <p className="m-0 py-2 text-muted">Retenida por bloqueo: todavía no aporta al número.</p>
            ) : (
              <>
                <Line label="Ingresos">
                  {money(c.revenue)} · {pct(c.revenueShare, 0)}
                </Line>
                <Line label="EBIT antes de eliminaciones">{money(c.ebit)}</Line>
                <Line label="ROIC · ROCE">
                  {pct(c.roic)} · {pct(c.roce)}
                </Line>
                <Line label="EVA" strong>
                  <span className={c.evaGtq < 0 ? 'text-negative' : undefined}>{money(c.evaGtq, { sign: true })}</span>
                </Line>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/load/${c.id}/mapping`} className={buttonClass('secondary', 'sm')}>
              Ver su mapeo
            </Link>
            <Link href={`/consolidated?line=revenue&company=${c.id}`} className={buttonClass('secondary', 'sm')}>
              Ver su rastro
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
