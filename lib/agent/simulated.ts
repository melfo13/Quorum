/**
 * A scripted stand-in for Claude. It drives the real loop (tool calls, tool results, proposals,
 * figure check) without a key or network, so the screen and the tests exercise the same path the
 * real model takes. For the three fixed questions it calls their tools and answers with the
 * template; for a free question it reads the group summary and says it is a simulation.
 */
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaStopReason,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { PRESETS, READING, templateAnswer, templateProposal } from './presets';
import type { CreateMessage } from './run';
import type { AgentContext } from './types';

type ScriptBlock =
  { type: 'text'; text: string } | { type: 'tool_use'; name: string; input: Record<string, unknown> };

let seq = 0;

/** A Messages API response with the given content, for the simulator and for tests. */
export function fakeMessage(blocks: ScriptBlock[], stop?: BetaStopReason): BetaMessage {
  const content = blocks.map((b) =>
    b.type === 'text'
      ? { type: 'text', text: b.text, citations: null }
      : { type: 'tool_use', id: `toolu_sim_${++seq}`, name: b.name, input: b.input },
  );
  return {
    id: `msg_sim_${++seq}`,
    type: 'message',
    role: 'assistant',
    model: 'simulado',
    content: content as unknown as BetaContentBlock[],
    stop_reason: stop ?? (blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn'),
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as unknown as BetaMessage;
}

/** The messages of the current turn: everything after the last question typed as plain text. */
function currentTurn(messages: BetaMessageParam[]) {
  let start = messages.length - 1;
  while (start > 0 && !(messages[start].role === 'user' && typeof messages[start].content === 'string'))
    start--;
  return { question: String(messages[start].content), after: messages.slice(start + 1) };
}

/** The JSON of every tool result in the last user message. */
function lastResults(messages: BetaMessageParam[]): unknown[] {
  const last = messages.at(-1);
  if (!last || typeof last.content === 'string') return [];
  return last.content.flatMap((b) => {
    if (b.type !== 'tool_result' || typeof b.content !== 'string') return [];
    try {
      return [JSON.parse(b.content)];
    } catch {
      return [];
    }
  });
}

export function simulatedModel(ctx: AgentContext): CreateMessage {
  return async (params: MessageCreateParamsNonStreaming) => {
    const { question, after } = currentTurn(params.messages);
    const step = after.filter((m) => m.role === 'assistant').length;
    const preset = [...PRESETS, READING].find((p) => p.prompt === question);

    if (preset) {
      if (step === 0) {
        if (preset.id === 'lectura')
          return fakeMessage([
            { type: 'tool_use', name: 'resumen_grupo', input: {} },
            { type: 'tool_use', name: 'ver_puente', input: { metrica: 'revenue' } },
          ]);
        if (preset.id === 'puente')
          return fakeMessage(
            ['revenue', 'ebit', 'eva'].map((metrica) => ({
              type: 'tool_use',
              name: 'ver_puente',
              input: { metrica },
            })),
          );
        return fakeMessage([{ type: 'tool_use', name: 'listar_hallazgos', input: {} }]);
      }
      if (step === 1 && preset.id === 'cerrar') {
        const [list] = lastResults(params.messages) as {
          hallazgos: { id: string; corregibleEnApp: boolean }[];
        }[];
        const calls = (list?.hallazgos ?? [])
          .filter((h) => h.corregibleEnApp)
          .map((h) => templateProposal(ctx, h.id))
          .filter((p) => p !== null)
          .map((p) => ({
            type: 'tool_use' as const,
            name: 'proponer_correccion',
            input: {
              hallazgo: p.findingId,
              razon: p.reason,
              ...(p.groupAccount ? { cuentaGrupo: p.groupAccount } : {}),
            },
          }));
        if (calls.length) return fakeMessage(calls);
      }
      return fakeMessage([{ type: 'text', text: templateAnswer(preset.id, ctx).text }]);
    }

    if (step === 0) return fakeMessage([{ type: 'tool_use', name: 'resumen_grupo', input: {} }]);
    const [s] = lastResults(params.messages) as { ingresos: string; ebit: string; eva: string }[];
    return fakeMessage([
      {
        type: 'text',
        text: `Esto es una simulación: no hay un modelo conectado, así que no interpreto tu pregunta. Lo que sí leí del resumen del grupo: ingresos **${s?.ingresos}**, EBIT **${s?.ebit}** y EVA **${s?.eva}**. Con una ANTHROPIC_API_KEY, el agente responde la pregunta que escribiste.`,
      },
    ]);
  };
}
