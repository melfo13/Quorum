/**
 * Picks how a question is answered: Claude when there is a key, the simulator when
 * PULSEGROUP_AGENT=simulado, and the template otherwise. If the model fails, a fixed question still
 * gets its template answer and a free one says the agent is not available.
 */
import { presetById, templateAnswer, type PresetId } from './presets';
import { AgentError, runAgent, type CreateMessage } from './run';
import { simulatedModel } from './simulated';
import type { AgentAnswer, AgentContext, Turn } from './types';

export type AgentSetup =
  | { kind: 'agente'; create: CreateMessage; model?: string; direct?: boolean }
  | { kind: 'simulado' }
  | { kind: 'plantilla' };

const UNAVAILABLE =
  'El agente no está disponible, así que no puedo responder preguntas libres. Las tres preguntas fijas sí funcionan: se responden con las cifras del motor.';

function fallback(ctx: AgentContext, preset: PresetId | undefined, note: string): AgentAnswer {
  if (!preset)
    return { mode: 'no-disponible', text: UNAVAILABLE, proposals: [], unverified: [], toolCalls: [], note };
  const t = templateAnswer(preset, ctx);
  return { mode: 'plantilla', text: t.text, proposals: t.proposals, unverified: [], toolCalls: [], note };
}

export async function answerQuestion(opts: {
  ctx: AgentContext;
  setup: AgentSetup;
  preset?: PresetId;
  question?: string;
  history?: Turn[];
}): Promise<AgentAnswer> {
  const { ctx, setup } = opts;
  const preset = opts.preset ? presetById(opts.preset) : undefined;
  const question = preset?.prompt ?? opts.question?.trim() ?? '';
  if (!question) throw new Error('Falta la pregunta.');

  if (setup.kind === 'plantilla')
    return fallback(ctx, preset?.id, 'Sin ANTHROPIC_API_KEY: la respuesta la arma el código, sin modelo.');

  const create = setup.kind === 'agente' ? setup.create : simulatedModel(ctx);
  const model = setup.kind === 'agente' ? setup.model : undefined;
  const direct = setup.kind === 'agente' ? setup.direct : undefined;
  try {
    return await runAgent({ ctx, question, history: opts.history, create, mode: setup.kind, model, direct });
  } catch (e) {
    const why = e instanceof AgentError ? e.message : 'No se pudo hablar con el modelo.';
    if (!(e instanceof AgentError)) console.error('[agente]', e);
    return fallback(ctx, preset?.id, `${why} Se muestra la respuesta armada por código.`);
  }
}
