'use client';

/**
 * "Lectura rápida" at the top of Consolidado: the story of the number in four sentences, written by
 * the agent from the engine's figures (checked like every answer) or by template without a model.
 * It loads after the page, so the statement never waits for the model.
 */
import { useEffect, useState } from 'react';
import { Button, Pill, type Tone } from '@/components/ui/primitives';
import type { AgentAnswer, AnswerMode } from '@/lib/agent/types';
import { useAgentUi } from './AgentContext';
import { Markdown } from './Markdown';

const MODE: Record<AnswerMode, { tone: Tone; text: string }> = {
  agente: { tone: 'accent', text: 'Escrita por el agente' },
  simulado: { tone: 'warning', text: 'Simulada' },
  plantilla: { tone: 'neutral', text: 'Por plantilla' },
  'no-disponible': { tone: 'negative', text: 'No disponible' },
};

/** `version` changes when the data or the decisions change; the reading is asked again then. */
export function QuickRead({ version }: { version: string }) {
  const { setOpen } = useAgentUi();
  // Each result remembers the version it answers; a result for older data is not shown.
  const [result, setResult] = useState<{ version: string; answer: AgentAnswer | null } | null>(null);
  const current = result?.version === version ? result : null;
  const answer = current?.answer ?? null;
  const failed = !!current && !current.answer;

  useEffect(() => {
    let live = true;
    fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ preset: 'lectura' }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((a: AgentAnswer) => live && setResult({ version, answer: a }))
      .catch(() => live && setResult({ version, answer: null }));
    return () => {
      live = false;
    };
  }, [version]);

  if (failed) return null;
  const mode = answer ? MODE[answer.mode] : null;

  return (
    <section
      aria-label="Lectura rápida"
      aria-busy={!answer}
      className="flex flex-col gap-3 card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <h2 className="m-0 text-base font-semibold">Lectura rápida</h2>
          {mode && <Pill tone={mode.tone}>{mode.text}</Pill>}
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          Preguntar más al agente
        </Button>
      </div>
      {answer ? (
        <>
          <Markdown text={answer.text} unverified={answer.unverified} />
          {answer.unverified.length > 0 && (
            <p className="m-0 text-[13px] text-warn-ink">
              {answer.unverified.length === 1
                ? 'Una cifra no se pudo verificar'
                : `${answer.unverified.length} cifras no se pudieron verificar`}
              ; está subrayada.
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[92, 78, 85, 60].map((w) => (
            <div key={w} className="h-4 animate-pulse rounded bg-raised" style={{ width: `${w}%` }} />
          ))}
          <span className="sr-only">Preparando la lectura del consolidado</span>
        </div>
      )}
    </section>
  );
}
