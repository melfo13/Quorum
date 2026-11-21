'use client';

/**
 * The data agent as a sidebar on every screen. On wide screens it pushes the page (the page gets
 * narrower, nothing is covered) and can be widened by dragging its edge or with the expand button;
 * on a phone it opens full screen. The conversation lives here, so it survives navigation.
 */
import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Button, Pill, cx, type Tone } from '@/components/ui/primitives';
import type { AgentMode } from '@/lib/agent/config';
import type { AgentAnswer, Turn } from '@/lib/agent/types';
import { WIDTH, maxWidth, useAgentUi } from './AgentContext';
import { AnswerView } from './Answer';

const MODE_BADGE: Record<AgentMode, { tone: Tone; text: string }> = {
  agente: { tone: 'accent', text: 'Modelo' },
  simulado: { tone: 'warning', text: 'Simulado' },
  plantilla: { tone: 'neutral', text: 'Sin modelo' },
};

type Item = { id: number; question: string; answer?: AgentAnswer; error?: string };

function IconButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] text-muted hover:bg-raised hover:text-ink',
        className,
      )}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

export function AgentSidebar({
  mode,
  model,
  hasData,
  dataKey,
  presets,
}: {
  mode: AgentMode;
  /** The model id the agent calls, shown in the header. */
  model: string;
  hasData: boolean;
  /** Changes when the visitor switches data; the conversation starts over then. */
  dataKey: string;
  presets: { id: string; label: string }[];
}) {
  const { open, setOpen, width, setWidth } = useAgentUi();
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const seq = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const firstKey = useRef(dataKey);
  const freeEnabled = hasData && mode !== 'plantilla';
  const wide = width >= Math.min(WIDTH.wide, maxWidth()) - 40;

  // Other data, other conversation: earlier answers would describe files that are no longer loaded.
  useEffect(() => {
    if (firstKey.current === dataKey) return;
    firstKey.current = dataKey;
    setItems([]);
  }, [dataKey]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [items]);

  async function ask(body: { preset?: string; question?: string }, label: string) {
    if (busy || !hasData) return;
    const id = ++seq.current;
    const history: Turn[] = items.flatMap((it) =>
      it.answer
        ? [
            { role: 'user' as const, text: it.question },
            { role: 'assistant' as const, text: it.answer.text },
          ]
        : [],
    );
    setItems((xs) => [...xs, { id, question: label }]);
    setBusy(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, history }),
      });
      const data = await res.json();
      setItems((xs) =>
        xs.map((x) =>
          x.id === id ? (res.ok ? { ...x, answer: data } : { ...x, error: data.error ?? 'Algo falló.' }) : x,
        ),
      );
    } catch {
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, error: 'No se pudo conectar con la app.' } : x)));
    } finally {
      setBusy(false);
    }
  }

  function send() {
    const q = draft.trim();
    if (!q || busy || !freeEnabled) return;
    setDraft('');
    ask({ question: q }, q);
  }

  // Resize: drag the left edge, or focus it and use the arrow keys.
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    document.body.style.userSelect = 'none';
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragging) setWidth(window.innerWidth - e.clientX);
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    document.body.style.userSelect = '';
  }
  function onHandleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowLeft') setWidth(width + 32);
    else if (e.key === 'ArrowRight') setWidth(width - 32);
    else return;
    e.preventDefault();
  }

  const badge = MODE_BADGE[mode];

  return (
    <aside
      id="agente"
      aria-label="Agente de datos"
      inert={!open}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
      style={{ width: open ? width : 0 }}
      className={cx(
        // Phone: full screen over the page. From md up: a column beside the page that pushes it.
        'fixed inset-0 z-50 flex-col overflow-hidden bg-[rgba(251,253,255,0.92)] backdrop-blur-xl max-md:!w-full md:bg-glass',
        'md:relative md:inset-auto md:sticky md:top-0 md:z-auto md:flex md:h-screen md:flex-none',
        open ? 'flex md:border-l md:border-white/70' : 'hidden',
        !dragging && 'md:transition-[width] md:duration-200 md:ease-out',
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ancho del agente"
        aria-valuemin={WIDTH.min}
        aria-valuemax={maxWidth()}
        aria-valuenow={width}
        tabIndex={open ? 0 : -1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onHandleKey}
        onDoubleClick={() => setWidth(wide ? WIDTH.normal : WIDTH.wide)}
        className={cx(
          'absolute inset-y-0 left-0 z-10 hidden w-1.5 cursor-col-resize md:block',
          dragging
            ? 'bg-accent/40'
            : 'hover:bg-accent/25 focus-visible:bg-accent/25 focus-visible:outline-none',
        )}
      />

      {/* Fixed width inside, so the content does not reflow while the column opens or closes. */}
      <div className="flex h-full min-w-0 flex-col max-md:!w-full" style={{ width }}>
        <header className="flex h-12 flex-none items-center gap-2 border-b border-border pl-4 pr-2">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <span className="text-[var(--accent)]">
              <AgentIcon />
            </span>
            Agente
          </span>
          <Pill tone={badge.tone}>{mode === 'agente' ? model : badge.text}</Pill>
          <div className="ml-auto flex items-center">
            {items.length > 0 && (
              <IconButton label="Nueva conversación" onClick={() => setItems([])}>
                <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v3h3" />
              </IconButton>
            )}
            <IconButton
              label={wide ? 'Reducir el agente' : 'Ampliar el agente'}
              onClick={() => setWidth(wide ? WIDTH.normal : WIDTH.wide)}
              className="max-md:hidden"
            >
              {wide ? (
                <path d="M9.5 3.5 5 8l4.5 4.5M13 3.5 8.5 8l4.5 4.5" />
              ) : (
                <path d="M6.5 3.5 11 8l-4.5 4.5M3 3.5 7.5 8 3 12.5" transform="rotate(180 8 8)" />
              )}
            </IconButton>
            <IconButton label="Cerrar el agente" onClick={() => setOpen(false)}>
              <path d="M4 4l8 8M12 4l-8 8" />
            </IconButton>
          </div>
        </header>

        <div
          ref={scroller}
          aria-live="polite"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
        >
          {!hasData ? (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-muted">
                Todavía no hay presupuestos cargados. Sube los archivos o usa los datos de ejemplo y
                pregúntame por el número del grupo.
              </p>
              <Link
                href="/load"
                className="self-start font-medium underline decoration-control underline-offset-[3px] hover:decoration-ink"
              >
                Ir a Configuración →
              </Link>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-muted">
                Respondo con las cifras que ya calculó el motor, nunca con los archivos. Puedo proponer
                correcciones; tú decides si se aplican.
              </p>
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => ask({ preset: p.id }, p.label)}
                  className="cursor-pointer card p-3 text-left font-medium text-ink transition-colors hover:border-control hover:bg-raised"
                >
                  {p.label}
                </button>
              ))}
            </div>
          ) : (
            items.map((it) => (
              <article key={it.id} className="flex flex-col gap-3 border-b border-rule pb-4 last:border-b-0">
                <h2 className="m-0 self-end rounded-[16px] bg-raised px-3 py-2 text-[15px] font-medium">
                  {it.question}
                </h2>
                {it.answer ? (
                  <AnswerView a={it.answer} />
                ) : it.error ? (
                  <p className="m-0 text-negative">{it.error}</p>
                ) : (
                  <p className="m-0 animate-pulse text-muted">Consultando la data del grupo…</p>
                )}
              </article>
            ))
          )}
        </div>

        {hasData && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              send();
            }}
            className="flex flex-none flex-col gap-2 border-t border-border p-3"
          >
            {items.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label="Preguntas rápidas">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={busy}
                    onClick={() => ask({ preset: p.id }, p.label)}
                    className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-left text-[13px] text-ink hover:bg-raised disabled:cursor-not-allowed disabled:text-muted"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <label htmlFor="agente-pregunta" className="sr-only">
              Tu pregunta
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="agente-pregunta"
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={!freeEnabled}
                placeholder={
                  freeEnabled
                    ? 'Por ejemplo: ¿cuánto vende cada empresa en marzo?'
                    : 'Sin modelo: usa las preguntas de arriba.'
                }
                className={cx(
                  'min-h-[44px] min-w-0 flex-auto resize-none rounded-[10px] border border-control bg-surface px-3 py-2 text-ink placeholder:text-muted',
                  !freeEnabled && 'cursor-not-allowed bg-raised',
                )}
              />
              <Button type="submit" variant="primary" disabled={!freeEnabled || busy || !draft.trim()}>
                Enviar
              </Button>
            </div>
          </form>
        )}
      </div>
    </aside>
  );
}

/**
 * The agent's mark: a large spark and a small one, the analyst's "insight" rather than a chat
 * bubble, since it answers from computed figures instead of chatting.
 */
export function AgentIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M6.5 2.2c.45 2.85 1.6 4 4.45 4.45-2.85.45-4 1.6-4.45 4.45-.45-2.85-1.6-4-4.45-4.45C4.9 6.2 6.05 5.05 6.5 2.2Z" />
      <path d="M12.3 9.4c.22 1.3.8 1.88 2.1 2.1-1.3.22-1.88.8-2.1 2.1-.22-1.3-.8-1.88-2.1-2.1 1.3-.22 1.88-.8 2.1-2.1Z" />
    </svg>
  );
}

/** Opens and closes the agent from the top bar (from sm up). */
export function AgentToggle() {
  const { open, toggle } = useAgentUi();
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="agente"
        className={cx(
          'hidden h-8 flex-none cursor-pointer items-center gap-1.5 rounded-[10px] border px-2.5 text-[13px] font-medium transition-colors sm:inline-flex',
          open
            ? 'border-transparent bg-brand-tint text-[var(--accent)]'
            : 'border-control bg-surface text-ink hover:bg-raised',
        )}
      >
        <AgentIcon />
        Agente
      </button>
    </>
  );
}

/**
 * The floating button that opens the agent on phones. Rendered outside the top bar on purpose: the
 * bar's backdrop-filter makes it the containing block of any fixed child, which would pin this
 * button to the bar instead of the screen.
 */
export function AgentFab() {
  const { open, toggle } = useAgentUi();
  if (open) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-controls="agente"
      className="fixed bottom-4 right-4 z-40 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 font-medium text-white shadow-[0_4px_16px_rgba(0,0,0,0.16)] sm:hidden"
    >
      <AgentIcon size={16} />
      Preguntar al agente
    </button>
  );
}
