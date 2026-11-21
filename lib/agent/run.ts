/**
 * The agent loop on the Messages API. The model is a parameter (`create`), so the same loop runs
 * against Claude, against the scripted simulator, and in tests without network.
 *
 * Each turn: the model calls tools until it answers; the answer's figures are checked against what
 * the tools returned; if any is missing the model gets one chance to fix it, and a figure that is
 * still missing is reported as unverified.
 */
import type {
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { TOOLS, runTool } from './tools';
import type { AgentAnswer, AgentContext, Proposal, Turn } from './types';
import { unverifiedFigures } from './verify';

export const MODEL = 'claude-opus-5-5';

export type CreateMessage = (params: MessageCreateParamsNonStreaming) => Promise<BetaMessage>;

export class AgentError extends Error {
  constructor(
    readonly code: 'refusal' | 'max_tokens' | 'steps' | 'empty',
    message: string,
  ) {
    super(message);
  }
}

export const SYSTEM = `Eres el analista de Quórum, la herramienta que consolida el presupuesto de un grupo de seis empresas que consolida en quetzales (GTQ). Respondes preguntas de su equipo de finanzas sobre la data ya procesada por el motor de consolidación.

Cómo trabajas:
- Toda cifra que escribas sale de una herramienta, copiada tal como la devuelve ("Q 139.7 M", "8.2 %"). No sumes, restes ni calcules porcentajes por tu cuenta: si la pregunta pide una cifra que ninguna herramienta da, dilo y ofrece la más cercana que sí tienes.
- Si la pregunta no se puede responder con esta data (pronósticos, otros años, datos de mercado), di "No lo puedo responder con esta data" y explica qué sí puedes responder.
- No puedes cambiar la data. Cuando un hallazgo abierto tiene corregibleEnApp = true, puedes proponer su corrección con proponer_correccion y una razón concreta. Para una cuenta sin mapeo, elige la cuenta del grupo que corresponde al nombre de la cuenta local (la sugerencia viene de las cuentas hermanas; úsala salvo que el nombre diga otra cosa). Nunca digas que una corrección ya se aplicó: la persona la aprueba en pantalla.
- Los hallazgos con corregibleEnApp = false los corrige la empresa en su archivo; di cuál archivo, hoja y fila.

Cómo escribes:
- En español, claro y breve, para alguien de finanzas que no es técnico. Empieza por la respuesta.
- Formato permitido: párrafos cortos, listas con "- ", **negritas**, y enlaces solo a rutas de la app que te den las herramientas, como [Ver en Configuración](/load). Sin tablas ni encabezados.
- Nombra cada empresa exactamente como la devuelven las herramientas; no inventes otros nombres ni numeraciones. Los meses, en español.`;

const RETRY_PREFIX = 'Revisión automática de cifras:';

export async function runAgent(opts: {
  ctx: AgentContext;
  question: string;
  history?: Turn[];
  create: CreateMessage;
  mode: 'agente' | 'simulado';
  /** Default claude-opus-5-5. */
  model?: string;
  /** False through a gateway: the refusal fallback is an api.anthropic.com beta a gateway may reject. */
  direct?: boolean;
  maxSteps?: number;
}): Promise<AgentAnswer> {
  const { ctx, create, maxSteps = 12, model = MODEL, direct = true } = opts;
  const messages: BetaMessageParam[] = [
    ...(opts.history ?? []).map((t) => ({ role: t.role, content: t.text })),
    { role: 'user', content: opts.question },
  ];
  const outputs: string[] = [];
  const proposals = new Map<string, Proposal>();
  const toolCalls: string[] = [];
  let retried = false;

  for (let step = 0; step < maxSteps; step++) {
    const res = await create({
      model,
      max_tokens: 16000,
      system: SYSTEM,
      tools: TOOLS,
      messages,
      output_config: { effort: 'medium' },
      // Prompt caching and the refusal fallback are api.anthropic.com features. A gateway that speaks the
      // same format (Meta's Model API for Muse Spark) rejects fields it does not know, so they go only direct.
      ...(direct
        ? {
            cache_control: { type: 'ephemeral' as const },
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default' as const,
          }
        : {}),
    });
    // Append the whole content, thinking blocks included, so the history stays exactly as the model wrote it.
    messages.push({ role: 'assistant', content: res.content });

    if (res.stop_reason === 'refusal')
      throw new AgentError('refusal', 'El modelo no quiso responder esta pregunta.');
    if (res.stop_reason === 'max_tokens')
      throw new AgentError('max_tokens', 'La respuesta salió demasiado larga.');

    if (res.stop_reason === 'tool_use') {
      const results: BetaToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== 'tool_use') continue;
        toolCalls.push(block.name);
        const input =
          block.input && typeof block.input === 'object' ? (block.input as Record<string, unknown>) : {};
        const out = runTool(ctx, block.name, input);
        if (!out.isError) outputs.push(out.content);
        if (out.proposal) proposals.set(out.proposal.findingId, out.proposal);
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: out.content,
          ...(out.isError ? { is_error: true } : {}),
        });
      }
      messages.push({ role: 'user', content: results });
      continue;
    }

    const text = res.content
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('')
      .trim();
    if (!text) throw new AgentError('empty', 'El modelo no devolvió texto.');

    const unverified = unverifiedFigures(text, outputs);
    if (unverified.length && !retried) {
      retried = true;
      messages.push({
        role: 'user',
        content: `${RETRY_PREFIX} estas cifras no aparecen en lo que devolvieron las herramientas: ${unverified.join(', ')}. Reescribe la respuesta completa usando solo cifras de las herramientas, copiadas tal cual. Si necesitas una cifra que no tienes, consulta la herramienta o di que no la tienes.`,
      });
      continue;
    }
    return { mode: opts.mode, text, proposals: [...proposals.values()], unverified, toolCalls };
  }
  throw new AgentError('steps', 'El agente no terminó en el número de pasos permitido.');
}
