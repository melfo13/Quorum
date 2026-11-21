'use client';

/** One answer of the agent: its text, the corrections it proposes, and how it was produced. */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { applyProposal } from '@/app/actions';
import { Button, Pill, type Tone } from '@/components/ui/primitives';
import type { AgentAnswer, AnswerMode, Proposal } from '@/lib/agent/types';
import { Markdown } from './Markdown';

type ProposalState = 'applying' | 'applied' | 'dismissed' | { error: string };

const MODE: Record<AnswerMode, { tone: Tone; text: string }> = {
  agente: { tone: 'accent', text: 'Agente' },
  simulado: { tone: 'warning', text: 'Simulado' },
  plantilla: { tone: 'neutral', text: 'Plantilla, sin modelo' },
  'no-disponible': { tone: 'negative', text: 'Agente no disponible' },
};

/** A proposed correction. Nothing changes until the person presses its button. */
function ProposalCard({ p }: { p: Proposal }) {
  const router = useRouter();
  const [state, setState] = useState<ProposalState | null>(null);
  if (state === 'dismissed') return null;
  async function apply() {
    setState('applying');
    const res = await applyProposal(p.findingId, p.groupAccount);
    if (res.ok) {
      setState('applied');
      router.refresh();
    } else setState({ error: res.error });
  }
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-raised p-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium">{p.title}</span>
        <span className="text-[13px] text-muted">{p.impact}</span>
        <span className="text-[13px]">{p.reason}</span>
        {typeof state === 'object' && state && (
          <span className="text-[13px] text-negative">{state.error}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {state === 'applied' ? (
          <Pill tone="positive">Aplicada</Pill>
        ) : (
          <>
            <Button
              size="sm"
              variant="primary"
              onClick={apply}
              disabled={state === 'applying'}
              className="h-auto min-h-8 min-w-0 whitespace-normal py-1 text-left"
            >
              {state === 'applying' ? 'Aplicando…' : p.actionLabel}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setState('dismissed')}
              disabled={state === 'applying'}
            >
              Descartar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function AnswerView({ a }: { a: AgentAnswer }) {
  const mode = MODE[a.mode];
  return (
    <div className="flex flex-col gap-3">
      <Markdown text={a.text} unverified={a.unverified} />
      {a.proposals.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-[13px] font-semibold text-muted">
            {a.proposals.length === 1
              ? 'Corrección propuesta'
              : `${a.proposals.length} correcciones propuestas`}
          </h3>
          {a.proposals.map((p) => (
            <ProposalCard key={p.findingId} p={p} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
        <Pill tone={mode.tone}>{mode.text}</Pill>
        {a.unverified.length > 0 && (
          <span className="text-warn-ink">
            {a.unverified.length === 1
              ? 'Una cifra no se pudo verificar'
              : `${a.unverified.length} cifras no se pudieron verificar`}
            ; está subrayada.
          </span>
        )}
        {a.note && <span>{a.note}</span>}
        {a.toolCalls.length > 0 && <span>Consultó: {[...new Set(a.toolCalls)].join(', ')}</span>}
      </div>
    </div>
  );
}
